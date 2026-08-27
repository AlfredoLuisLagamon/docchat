import { notFound } from "next/navigation";
import { ChatView } from "@/components/chat-view";
import type { DocChatUIMessage } from "@/lib/chat-message";
import { getOwnedChat } from "@/lib/chats";
import { listDocumentsForOwnedChat } from "@/lib/documents";
import { listUiMessages } from "@/lib/messages";
import { getVisitorId } from "@/lib/visitor";

export const dynamic = "force-dynamic";

type ChatPageProps = {
  params: Promise<{ chatId: string }>;
};

export default async function ChatPage({ params }: ChatPageProps) {
  const { chatId } = await params;
  const visitorId = await getVisitorId();
  if (!visitorId) {
    notFound();
  }

  const chat = await getOwnedChat(chatId, visitorId);
  if (!chat) {
    notFound();
  }

  const [initialMessages, initialDocuments] = await Promise.all([
    listUiMessages(chat.id),
    listDocumentsForOwnedChat(chat.id),
  ]);

  return (
    <ChatView
      chatId={chat.id}
      initialMessages={initialMessages as DocChatUIMessage[]}
      initialDocuments={initialDocuments}
    />
  );
}
