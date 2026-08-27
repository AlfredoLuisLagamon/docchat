import type { UIMessage } from "ai";
import { composeAssistantParts } from "@/lib/assistant-parts";
import { getSql } from "@/lib/db";

function isUiRole(value: unknown): value is UIMessage["role"] {
  return value === "user" || value === "assistant" || value === "system";
}

export function isUiMessage(value: unknown): value is UIMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const message = value as Record<string, unknown>;
  return (
    typeof message.id === "string" &&
    message.id.length > 0 &&
    isUiRole(message.role) &&
    Array.isArray(message.parts)
  );
}

export function toUiMessage(row: Record<string, unknown>): UIMessage | null {
  const parts = row.parts;
  if (!isUiRole(row.role) || typeof row.id !== "string") {
    return null;
  }

  if (!Array.isArray(parts)) {
    return null;
  }

  return {
    id: row.id,
    role: row.role,
    parts:
      row.role === "assistant"
        ? composeAssistantParts(parts as UIMessage["parts"])
        : (parts as UIMessage["parts"]),
  };
}

export function getUserMessageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function isNonEmptyUserMessage(message: UIMessage) {
  return getUserMessageText(message).trim().length > 0;
}

export async function upsertUiMessage(chatId: string, message: UIMessage) {
  const sql = getSql();
  await sql.query(
    `insert into messages (id, chat_id, role, parts)
     values ($1, $2, $3, $4::jsonb)
     on conflict (id) do update
       set role = excluded.role,
           parts = excluded.parts
     where messages.chat_id = excluded.chat_id`,
    [message.id, chatId, message.role, JSON.stringify(message.parts)],
  );
}

export async function getCompletedAssistantForUserTurn(
  chatId: string,
  userMessageId: string,
): Promise<UIMessage | null> {
  const sql = getSql();
  const rows = await sql.query(
    `select a.id, a.role, a.parts
     from messages u
     join messages a
       on a.chat_id = u.chat_id
      and a.role = 'assistant'
      and a.created_at >= u.created_at
      and a.id <> u.id
     where u.chat_id = $1
       and u.id = $2
       and u.role = 'user'
     order by a.created_at asc
     limit 1`,
    [chatId, userMessageId],
  );

  const message = rows[0]
    ? toUiMessage(rows[0] as Record<string, unknown>)
    : null;
  if (!message) {
    return null;
  }

  const hasText = message.parts.some(
    (part) => part.type === "text" && part.text.trim().length > 0,
  );
  return hasText ? message : null;
}

export async function listUiMessages(chatId: string): Promise<UIMessage[]> {
  const sql = getSql();
  const rows = await sql.query(
    `select id, role, parts
     from messages
     where chat_id = $1
     order by created_at asc`,
    [chatId],
  );

  return rows
    .map((row) => toUiMessage(row as Record<string, unknown>))
    .filter((message): message is UIMessage => message !== null);
}

export async function countMessages(chatId: string): Promise<number> {
  const sql = getSql();
  const rows = await sql.query(
    `select count(*)::int as count from messages where chat_id = $1`,
    [chatId],
  );
  return Number(rows[0]?.count ?? 0);
}
