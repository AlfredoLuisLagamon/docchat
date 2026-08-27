import { redirect } from "next/navigation";
import { createChat, getLatestChatForVisitor } from "@/lib/chats";
import { ensureVisitorId, getVisitorId } from "@/lib/visitor";

export const dynamic = "force-dynamic";

export default async function Home() {
  const visitorId = (await getVisitorId()) ?? (await ensureVisitorId());
  const existing = await getLatestChatForVisitor(visitorId);
  const chat = existing ?? (await createChat(visitorId));
  redirect(`/c/${chat.id}`);
}
