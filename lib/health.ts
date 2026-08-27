import { getSql } from "@/lib/db";
import {
  CHAT_MODEL,
  EMBEDDING_DIM,
  EMBEDDING_MODEL,
} from "@/lib/ai-config";

function redactSecrets(value: string) {
  return value.replace(
    /(?:postgres(?:ql)?:\/\/)[^\s"'`]+/gi,
    "postgres://[redacted]",
  );
}

const expectedTables = ["chats", "documents", "chunks", "messages"] as const;
const expectedIndexes = [
  "chunks_chat_id_idx",
  "messages_chat_id_idx",
  "documents_chat_id_idx",
  "chats_visitor_id_idx",
] as const;

export type HealthStatus = {
  ok: boolean;
  connected: boolean;
  vectorExtension: boolean;
  embeddingColumnType: string | null;
  expectedEmbeddingDim: number;
  missingTables: string[];
  missingIndexes: string[];
  forbiddenVectorIndexes: unknown[];
  models: {
    chat: string;
    embedding: string;
    embeddingDim: number;
  };
  error?: string;
};

export async function getHealthStatus(): Promise<HealthStatus> {
  const models = {
    chat: CHAT_MODEL,
    embedding: EMBEDDING_MODEL,
    embeddingDim: EMBEDDING_DIM,
  };

  try {
    const sql = getSql();

    const ping = await sql.query("select 1 as ok");
    const extension = await sql.query(
      "select extname from pg_extension where extname = 'vector'",
    );
    const tables = await sql.query(
      `select table_name
       from information_schema.tables
       where table_schema = 'public'
         and table_name = any($1)`,
      [expectedTables],
    );
    const embeddingType = await sql.query(
      `select format_type(a.atttypid, a.atttypmod) as type
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = 'chunks'
         and a.attname = 'embedding'
         and a.attnum > 0
         and not a.attisdropped`,
    );
    const vectorIndexes = await sql.query(
      `select indexname, indexdef
       from pg_indexes
       where schemaname = 'public'
         and (
           indexdef ilike '%hnsw%'
           or indexdef ilike '%ivfflat%'
         )`,
    );
    const indexes = await sql.query(
      `select indexname
       from pg_indexes
       where schemaname = 'public'
         and indexname = any($1)`,
      [expectedIndexes],
    );

    const foundTables = tables.map((row) => String(row.table_name));
    const foundIndexes = indexes.map((row) => String(row.indexname));
    const missingTables = expectedTables.filter(
      (name) => !foundTables.includes(name),
    );
    const missingIndexes = expectedIndexes.filter(
      (name) => !foundIndexes.includes(name),
    );
    const embeddingColumnType = embeddingType[0]
      ? String(embeddingType[0].type)
      : null;

    const connected = ping[0]?.ok === 1;
    const vectorExtension = extension.length > 0;
    const ok =
      connected &&
      vectorExtension &&
      missingTables.length === 0 &&
      missingIndexes.length === 0 &&
      embeddingColumnType === `vector(${EMBEDDING_DIM})` &&
      vectorIndexes.length === 0;

    return {
      ok,
      connected,
      vectorExtension,
      embeddingColumnType,
      expectedEmbeddingDim: EMBEDDING_DIM,
      missingTables,
      missingIndexes,
      forbiddenVectorIndexes: vectorIndexes,
      models,
    };
  } catch (error) {
    return {
      ok: false,
      connected: false,
      vectorExtension: false,
      embeddingColumnType: null,
      expectedEmbeddingDim: EMBEDDING_DIM,
      missingTables: [...expectedTables],
      missingIndexes: [...expectedIndexes],
      forbiddenVectorIndexes: [],
      models,
      error: redactSecrets(
        error instanceof Error ? error.message : "Unknown error",
      ),
    };
  }
}
