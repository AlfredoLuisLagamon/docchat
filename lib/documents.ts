import { getSql } from "@/lib/db";
import type { PlainTextChunk } from "@/lib/documents/chunk-text";
import { IngestError } from "@/lib/documents/errors";
import { toVectorLiteral } from "@/lib/embeddings/vector";

export { IngestError } from "@/lib/documents/errors";
export { MAX_UPLOAD_BYTES } from "@/lib/upload-limits";

export type DocumentRecord = {
  id: string;
  filename: string;
  mimeType: string;
  status: string;
  errorMessage: string | null;
  pageCount: number | null;
  createdAt: string;
};

function toIso(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

export function mapDocument(row: Record<string, unknown>): DocumentRecord {
  return {
    id: String(row.id),
    filename: String(row.filename),
    mimeType: String(row.mime_type),
    status: String(row.status),
    errorMessage: row.error_message == null ? null : String(row.error_message),
    pageCount:
      row.page_count == null || !Number.isFinite(Number(row.page_count))
        ? null
        : Number(row.page_count),
    createdAt: toIso(row.created_at),
  };
}

export function safeFilename(name: string) {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "upload.txt";
  return base.trim() || "upload.txt";
}

export function isPdfUpload(filename: string, mimeType: string) {
  const lower = filename.toLowerCase();
  const mime = mimeType.toLowerCase();
  return lower.endsWith(".pdf") || mime === "application/pdf";
}

export function assertSupportedUpload(filename: string, mimeType: string) {
  const lower = filename.toLowerCase();
  const mime = mimeType.toLowerCase();
  const isTxt = lower.endsWith(".txt");
  const isMarkdown = lower.endsWith(".md") || lower.endsWith(".markdown");
  const isPdf = isPdfUpload(filename, mimeType);
  if (!isTxt && !isMarkdown && !isPdf) {
    throw new IngestError(
      "Only .txt, .md, .markdown, and .pdf files are supported.",
      415,
    );
  }

  if (isPdf) {
    return;
  }

  const allowedMime = new Set([
    "",
    "text/plain",
    "text/markdown",
    "text/x-markdown",
    "application/markdown",
    "application/octet-stream",
    "txt",
  ]);
  if (mime && !allowedMime.has(mime)) {
    throw new IngestError(
      "Only .txt, .md, .markdown, and .pdf files are supported.",
      415,
    );
  }
}

export const assertTxtUpload = assertSupportedUpload;

export async function insertParsingDocument(input: {
  chatId: string;
  filename: string;
  mimeType: string;
}): Promise<DocumentRecord> {
  const sql = getSql();
  const rows = await sql.query(
    `insert into documents (chat_id, filename, mime_type, status)
     values ($1, $2, $3, 'parsing')
     returning id, filename, mime_type, status, error_message, page_count, created_at`,
    [input.chatId, input.filename, input.mimeType],
  );
  return mapDocument(rows[0] as Record<string, unknown>);
}

export async function setDocumentPageCount(
  documentId: string,
  chatId: string,
  pageCount: number,
) {
  const sql = getSql();
  await sql.query(
    `update documents
     set page_count = $3
     where id = $1
       and chat_id = $2`,
    [documentId, chatId, pageCount],
  );
}

export async function markDocumentError(documentId: string, message: string) {
  const sql = getSql();
  await sql.query(
    `update documents
     set status = 'error',
         error_message = $2
     where id = $1`,
    [documentId, message],
  );
}

export async function markDocumentStatus(
  documentId: string,
  chatId: string,
  status: "parsing" | "embedding" | "ready" | "error",
) {
  const sql = getSql();
  await sql.query(
    `update documents
     set status = $3,
         error_message = case when $3 = 'error' then error_message else null end
     where id = $1
       and chat_id = $2`,
    [documentId, chatId, status],
  );
}

export async function insertDocumentChunks(input: {
  documentId: string;
  chatId: string;
  chunks: PlainTextChunk[];
}) {
  const sql = getSql();
  const results = await sql.transaction((txn) => {
    const queries = [
      txn.query(`delete from chunks where document_id = $1`, [input.documentId]),
    ];
    for (const chunk of input.chunks) {
      queries.push(
        txn.query(
          `insert into chunks (
             document_id, chat_id, content, filename, locator, page, section, chunk_index
           )
           values ($1, $2, $3, $4, $5, $6, $7, $8)
           returning id, chunk_index, content, filename, locator, page, section`,
          [
            input.documentId,
            input.chatId,
            chunk.content,
            chunk.filename,
            chunk.locator,
            chunk.page,
            chunk.section,
            chunk.chunkIndex,
          ],
        ),
      );
    }
    return queries;
  });

  const inserted = results
    .slice(1)
    .flat()
    .map((row) => row as Record<string, unknown>)
    .sort((left, right) => Number(left.chunk_index) - Number(right.chunk_index));

  return inserted.map((row) => ({
    id: String(row.id),
    chunkIndex: Number(row.chunk_index),
    content: String(row.content),
    filename: String(row.filename),
    locator: String(row.locator),
    page: row.page == null ? null : Number(row.page),
    section: row.section == null ? null : String(row.section),
  }));
}

export async function persistChunkEmbeddingsAndMarkReady(input: {
  documentId: string;
  chatId: string;
  chunkIds: string[];
  embeddings: number[][];
}) {
  if (input.chunkIds.length !== input.embeddings.length) {
    throw new IngestError("Could not generate embeddings.");
  }

  const sql = getSql();
  await sql.transaction((txn) => {
    const queries = input.chunkIds.map((chunkId, index) =>
      txn.query(
        `update chunks
         set embedding = $1::vector
         where id = $2
           and chat_id = $3
           and document_id = $4`,
        [
          toVectorLiteral(input.embeddings[index] ?? []),
          chunkId,
          input.chatId,
          input.documentId,
        ],
      ),
    );
    queries.push(
      txn.query(
        `update documents
         set status = 'ready',
             error_message = null
         where id = $1
           and chat_id = $2
           and not exists (
             select 1
             from chunks
             where document_id = $1
               and embedding is null
           )`,
        [input.documentId, input.chatId],
      ),
    );
    return queries;
  });

  const ready = await sql.query(
    `select status
     from documents
     where id = $1
       and chat_id = $2`,
    [input.documentId, input.chatId],
  );
  if (ready[0]?.status !== "ready") {
    throw new IngestError("Could not generate embeddings.");
  }
}

export async function chatHasReadyDocument(chatId: string) {
  const sql = getSql();
  const rows = await sql.query(
    `select exists(
       select 1
       from documents
       where chat_id = $1
         and status = 'ready'
     ) as ready`,
    [chatId],
  );
  return rows[0]?.ready === true || rows[0]?.ready === "t";
}

export async function listDocumentsForOwnedChat(chatId: string) {
  const sql = getSql();
  const rows = await sql.query(
    `select id, filename, mime_type, status, error_message, page_count, created_at
     from documents
     where chat_id = $1
     order by created_at asc`,
    [chatId],
  );
  return rows.map((row) => mapDocument(row as Record<string, unknown>));
}

export async function getOwnedDocument(documentId: string, visitorId: string) {
  const sql = getSql();
  const rows = await sql.query(
    `select d.id, d.filename, d.mime_type, d.status, d.error_message, d.page_count, d.created_at
     from documents d
     join chats c on c.id = d.chat_id
     where d.id = $1
       and c.visitor_id = $2`,
    [documentId, visitorId],
  );
  return rows[0] ? mapDocument(rows[0] as Record<string, unknown>) : null;
}
