import { getOwnedChat } from "@/lib/chats";
import { listDocumentsForOwnedChat } from "@/lib/documents";
import { listUiMessages } from "@/lib/messages";
import { getVisitorId } from "@/lib/visitor";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const visitorId = await getVisitorId();

  if (!visitorId) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const chat = await getOwnedChat(id, visitorId);
  if (!chat) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const [documents, messages] = await Promise.all([
    listDocumentsForOwnedChat(chat.id),
    listUiMessages(chat.id),
  ]);

  return Response.json({
    chat,
    documents,
    messages,
  });
}
