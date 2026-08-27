import { getOwnedChat } from "@/lib/chats";
import { resolvePresentEvidence } from "@/lib/retrieval/present-evidence";
import { retrieveChunks } from "@/lib/retrieval/retrieve-chunks";
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

  const { chatId, query, sourceIds } = body as {
    chatId?: unknown;
    query?: unknown;
    sourceIds?: unknown;
  };
  if (
    typeof chatId !== "string" ||
    typeof query !== "string" ||
    !Array.isArray(sourceIds) ||
    sourceIds.some((id) => typeof id !== "string")
  ) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const owned = await getOwnedChat(chatId, visitorId);
  if (!owned) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const retrieved = await retrieveChunks(owned.id, query);
  try {
    const result = await resolvePresentEvidence({
      chatId: owned.id,
      allowedSourceIds: new Set(retrieved.chunks.map((chunk) => chunk.id)),
      sourceIds,
    });
    return Response.json({
      allowedIds: retrieved.chunks.map((chunk) => chunk.id),
      result,
    });
  } catch {
    return Response.json(
      { error: "Invalid source IDs.", allowedIds: retrieved.chunks.map((c) => c.id) },
      { status: 400 },
    );
  }
}
