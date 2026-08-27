import { createChat } from "@/lib/chats";
import { ensureVisitorId } from "@/lib/visitor";

export async function POST() {
  const visitorId = await ensureVisitorId();
  const chat = await createChat(visitorId);
  return Response.json({ id: chat.id });
}
