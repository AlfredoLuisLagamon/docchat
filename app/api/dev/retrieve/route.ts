import { getOwnedChat } from "@/lib/chats";
import {
  RetrievalError,
  retrieveChunks,
} from "@/lib/retrieval/retrieve-chunks";
import { getVisitorId } from "@/lib/visitor";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const visitorId = await getVisitorId();
  if (!visitorId) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const { chatId, query } = body as { chatId?: unknown; query?: unknown };
  if (typeof chatId !== "string" || typeof query !== "string") {
    return Response.json({ error: "chatId and query are required." }, { status: 400 });
  }

  const owned = await getOwnedChat(chatId, visitorId);
  if (!owned) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const result = await retrieveChunks(owned.id, query);
    return Response.json({
      embeddingDimensions: result.embeddingDimensions,
      embedMs: result.embedMs,
      searchMs: result.searchMs,
      totalMs: result.embedMs + result.searchMs,
      results: result.chunks.map((chunk, index) => ({
        rank: index + 1,
        id: chunk.id,
        documentId: chunk.documentId,
        filename: chunk.filename,
        locator: chunk.locator,
        page: chunk.page,
        section: chunk.section,
        similarity: chunk.similarity,
        excerpt: chunk.content.slice(0, 160),
      })),
    });
  } catch (error) {
    if (error instanceof RetrievalError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ error: "Retrieval failed." }, { status: 400 });
  }
}
