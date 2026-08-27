import { neon } from "@neondatabase/serverless";
import { loadEnvFiles } from "./load-env.mjs";
import { redactSecrets } from "./redact.mjs";

loadEnvFiles();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set in .env.local.");
  process.exit(1);
}

const sql = neon(databaseUrl);

try {
const ping = await sql.query("select 1 as ok");
if (ping[0]?.ok !== 1) {
  throw new Error("Neon ping failed");
}

const extension = await sql.query(
  "select extname from pg_extension where extname = 'vector'",
);
if (extension.length === 0) {
  throw new Error("pgvector extension is not enabled");
}

const expectedTables = ["chats", "documents", "chunks", "messages"];
const tables = await sql.query(
  `select table_name
   from information_schema.tables
   where table_schema = 'public'
     and table_name = any($1)`,
  [expectedTables],
);
const found = new Set(tables.map((row) => row.table_name));
for (const name of expectedTables) {
  if (!found.has(name)) {
    throw new Error(`Missing table: ${name}`);
  }
}

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
if (embeddingType[0]?.type !== "vector(768)") {
  throw new Error(
    `Expected chunks.embedding to be vector(768), got ${embeddingType[0]?.type}`,
  );
}

const embeddingNullability = await sql.query(
  `select is_nullable
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'chunks'
     and column_name = 'embedding'`,
);
if (embeddingNullability[0]?.is_nullable !== "YES") {
  throw new Error("Expected chunks.embedding to be nullable until Stage 5");
}

const vectorIndexes = await sql.query(
  `select indexname, indexdef
   from pg_indexes
   where schemaname = 'public'
     and (
       indexdef ilike '%hnsw%'
       or indexdef ilike '%ivfflat%'
     )`,
);
if (vectorIndexes.length > 0) {
  throw new Error(
    `Found forbidden vector index: ${JSON.stringify(vectorIndexes)}`,
  );
}

const expectedIndexes = [
  "chunks_chat_id_idx",
  "messages_chat_id_idx",
  "documents_chat_id_idx",
  "chats_visitor_id_idx",
];
const indexes = await sql.query(
  `select indexname
   from pg_indexes
   where schemaname = 'public'
     and indexname = any($1)`,
  [expectedIndexes],
);
const foundIndexes = new Set(indexes.map((row) => row.indexname));
for (const name of expectedIndexes) {
  if (!foundIndexes.has(name)) {
    throw new Error(`Missing index: ${name}`);
  }
}

console.log("Neon connection works.");
console.log("vector extension enabled.");
console.log("Schema present: chats, documents, chunks, messages.");
console.log("chunks.embedding is vector(768) and nullable.");
console.log("No HNSW or IVFFlat indexes.");
console.log("Relational indexes present.");

const readyWithNull = await sql.query(
  `select d.id
   from documents d
   join chunks c on c.document_id = d.id
   where d.status = 'ready'
     and c.embedding is null
   limit 1`,
);
if (readyWithNull.length > 0) {
  throw new Error("Ready documents must not have NULL embeddings");
}

const wrongDims = await sql.query(
  `select c.id
   from documents d
   join chunks c on c.document_id = d.id
   where d.status = 'ready'
     and c.embedding is not null
     and vector_dims(c.embedding) <> 768
   limit 1`,
);
if (wrongDims.length > 0) {
  throw new Error("Ready document embeddings must be 768 dimensions");
}

console.log("Ready documents have 768-d embeddings on every chunk.");
} catch (error) {
  console.error(redactSecrets(error instanceof Error ? error.message : error));
  process.exit(1);
}
