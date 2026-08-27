import { getSql } from "@/lib/db";
import { isVisitorId } from "@/lib/visitor-cookie";

export type ChatRecord = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

function toIso(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

function mapChat(row: Record<string, unknown>): ChatRecord {
  return {
    id: String(row.id),
    title: row.title == null ? null : String(row.title),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function createChat(visitorId: string): Promise<ChatRecord> {
  const sql = getSql();
  const rows = await sql.query(
    `insert into chats (visitor_id)
     values ($1)
     returning id, title, created_at, updated_at`,
    [visitorId],
  );
  return mapChat(rows[0] as Record<string, unknown>);
}

export async function getLatestChatForVisitor(
  visitorId: string,
): Promise<ChatRecord | null> {
  const sql = getSql();
  const rows = await sql.query(
    `select id, title, created_at, updated_at
     from chats
     where visitor_id = $1
     order by updated_at desc
     limit 1`,
    [visitorId],
  );
  return rows[0] ? mapChat(rows[0] as Record<string, unknown>) : null;
}

export async function getOwnedChat(
  chatId: string,
  visitorId: string,
): Promise<ChatRecord | null> {
  if (!isVisitorId(chatId) || !isVisitorId(visitorId)) {
    return null;
  }

  const sql = getSql();
  const rows = await sql.query(
    `select id, title, created_at, updated_at
     from chats
     where id = $1
       and visitor_id = $2`,
    [chatId, visitorId],
  );
  return rows[0] ? mapChat(rows[0] as Record<string, unknown>) : null;
}

export async function listDocumentsForChat(chatId: string) {
  const sql = getSql();
  return sql.query(
    `select id, filename, mime_type, status, error_message, page_count, created_at
     from documents
     where chat_id = $1
     order by created_at asc`,
    [chatId],
  );
}

export async function listMessagesForChat(chatId: string) {
  const sql = getSql();
  return sql.query(
    `select id, role, parts, created_at
     from messages
     where chat_id = $1
     order by created_at asc`,
    [chatId],
  );
}

export async function touchChatUpdatedAt(chatId: string) {
  const sql = getSql();
  await sql.query(`update chats set updated_at = now() where id = $1`, [
    chatId,
  ]);
}
