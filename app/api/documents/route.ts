import { getOwnedChat, touchChatUpdatedAt } from "@/lib/chats";
import {
  IngestError,
  MAX_UPLOAD_BYTES,
  assertSupportedUpload,
  insertDocumentChunks,
  insertParsingDocument,
  isPdfUpload,
  markDocumentError,
  markDocumentStatus,
  persistChunkEmbeddingsAndMarkReady,
  safeFilename,
  setDocumentPageCount,
} from "@/lib/documents";
import { embedChunkContents } from "@/lib/documents/embed-chunks";
import { chunkPlainText } from "@/lib/documents/chunk-text";
import { chunkMarkdown } from "@/lib/documents/parse-markdown";
import {
  PdfIngestError,
  chunkPdfPages,
  parsePdf,
} from "@/lib/documents/parse-pdf";
import { getVisitorId } from "@/lib/visitor";

export const maxDuration = 300;

function clientErrorMessage(error: unknown) {
  if (error instanceof IngestError) {
    return error.message;
  }
  return "Could not process the document.";
}

async function chunksFromUpload(
  filename: string,
  mimeType: string,
  bytes: Uint8Array,
) {
  if (isPdfUpload(filename, mimeType)) {
    const parsed = await parsePdf(bytes);
    return {
      pageCount: parsed.pageCount,
      chunks: chunkPdfPages(parsed.pages, filename),
    };
  }

  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (text.trim().length === 0) {
    throw new IngestError("The file is empty.");
  }
  const lower = filename.toLowerCase();
  const chunks =
    lower.endsWith(".md") || lower.endsWith(".markdown")
      ? chunkMarkdown(text, filename)
      : chunkPlainText(text, filename);
  return { pageCount: null as number | null, chunks };
}

export async function POST(request: Request) {
  const visitorId = await getVisitorId();
  if (!visitorId) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Invalid upload." }, { status: 400 });
  }

  const chatIdValue = form.get("chatId");
  const fileValue = form.get("file");
  if (typeof chatIdValue !== "string" || !(fileValue instanceof File)) {
    return Response.json({ error: "chatId and file are required." }, { status: 400 });
  }

  const owned = await getOwnedChat(chatIdValue, visitorId);
  if (!owned) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const filename = safeFilename(fileValue.name);
  const mimeType = fileValue.type || "application/octet-stream";

  try {
    assertSupportedUpload(filename, mimeType);
    if (fileValue.size > MAX_UPLOAD_BYTES) {
      throw new IngestError("File is too large. Maximum size is 5 MB.", 400);
    }
  } catch (error) {
    const status = error instanceof IngestError ? error.httpStatus : 400;
    return Response.json({ error: clientErrorMessage(error) }, { status });
  }

  const document = await insertParsingDocument({
    chatId: owned.id,
    filename,
    mimeType,
  });

  try {
    const bytes = new Uint8Array(await fileValue.arrayBuffer());
    const { pageCount, chunks } = await chunksFromUpload(
      filename,
      mimeType,
      bytes,
    );
    if (pageCount != null) {
      await setDocumentPageCount(document.id, owned.id, pageCount);
    }
    if (chunks.length === 0) {
      throw new IngestError("The file is empty.");
    }

    const stored = await insertDocumentChunks({
      documentId: document.id,
      chatId: owned.id,
      chunks,
    });
    await markDocumentStatus(document.id, owned.id, "embedding");

    const { embeddings, batchCount } = await embedChunkContents(
      stored.map((chunk) => chunk.content),
    );
    await persistChunkEmbeddingsAndMarkReady({
      documentId: document.id,
      chatId: owned.id,
      chunkIds: stored.map((chunk) => chunk.id),
      embeddings,
    });
    await touchChatUpdatedAt(owned.id);

    return Response.json({
      document: {
        ...document,
        status: "ready",
        errorMessage: null,
        pageCount,
      },
      embeddingBatches: batchCount,
    });
  } catch (error) {
    if (error instanceof PdfIngestError && error.pageCount != null) {
      await setDocumentPageCount(document.id, owned.id, error.pageCount);
    }
    const message = clientErrorMessage(error);
    await markDocumentError(document.id, message);
    const status = error instanceof IngestError ? error.httpStatus : 400;
    return Response.json(
      {
        error: message,
        document: {
          ...document,
          status: "error",
          errorMessage: message,
          pageCount:
            error instanceof PdfIngestError ? error.pageCount : document.pageCount,
        },
      },
      { status },
    );
  }
}
