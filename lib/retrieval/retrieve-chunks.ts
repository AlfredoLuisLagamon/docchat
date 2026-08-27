import { embed } from "ai";
import { google } from "@ai-sdk/google";
import {
  EMBEDDING_MODEL,
  queryEmbeddingOptions,
} from "@/lib/ai-config";
import { getSql } from "@/lib/db";
import {
  EmbeddingError,
  assertValidEmbedding,
  toVectorLiteral,
} from "@/lib/embeddings/vector";
import { isVisitorId } from "@/lib/visitor-cookie";

export const RETRIEVAL_LIMIT = 8;

export class RetrievalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetrievalError";
  }
}

export type RetrievedChunk = {
  id: string;
  documentId: string;
  filename: string;
  locator: string;
  page: number | null;
  section: string | null;
  content: string;
  similarity: number;
};

export type RetrieveChunksResult = {
  chunks: RetrievedChunk[];
  embeddingDimensions: number;
  embedMs: number;
  searchMs: number;
};

function mapChunk(row: Record<string, unknown>): RetrievedChunk {
  return {
    id: String(row.id),
    documentId: String(row.document_id),
    filename: String(row.filename),
    locator: String(row.locator),
    page: row.page == null ? null : Number(row.page),
    section: row.section == null ? null : String(row.section),
    content: String(row.content),
    similarity: Number(row.similarity),
  };
}

export async function retrieveChunks(
  chatId: string,
  question: string,
): Promise<RetrieveChunksResult> {
  if (!isVisitorId(chatId)) {
    throw new RetrievalError("Invalid chat.");
  }

  const trimmed = question.trim();
  if (!trimmed) {
    throw new RetrievalError("Query is empty.");
  }

  const embedStarted = Date.now();
  const { embedding } = await embed({
    model: google.embedding(EMBEDDING_MODEL),
    value: trimmed,
    providerOptions: queryEmbeddingOptions,
  });
  const embedMs = Date.now() - embedStarted;
  try {
    assertValidEmbedding(embedding);
  } catch (error) {
    if (error instanceof EmbeddingError) {
      throw new RetrievalError("Invalid query embedding.");
    }
    throw error;
  }

  const sql = getSql();
  const searchStarted = Date.now();
  const rows = await sql.query(
    `select
       c.id,
       c.document_id,
       c.filename,
       c.locator,
       c.page,
       c.section,
       c.content,
       1 - (c.embedding <=> $2::vector) as similarity
     from chunks c
     join documents d on d.id = c.document_id
     where c.chat_id = $1
       and d.status = 'ready'
       and c.embedding is not null
     order by c.embedding <=> $2::vector
     limit $3`,
    [chatId, toVectorLiteral(embedding), RETRIEVAL_LIMIT],
  );
  const searchMs = Date.now() - searchStarted;

  return {
    chunks: rows.map((row) => mapChunk(row as Record<string, unknown>)),
    embeddingDimensions: embedding.length,
    embedMs,
    searchMs,
  };
}
