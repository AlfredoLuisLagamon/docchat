import { neon } from "@neondatabase/serverless";
import { loadEnvFiles } from "./load-env.mjs";
import { redactSecrets } from "./redact.mjs";

loadEnvFiles();

const documentId = process.argv[2];
if (!documentId) {
  console.error("document id required");
  process.exit(1);
}

try {
  const sql = neon(process.env.DATABASE_URL);
  const docs = await sql.query(
    `select id, status, filename, error_message, page_count
     from documents
     where id = $1`,
    [documentId],
  );
  const chunks = await sql.query(
    `select chunk_index, locator, page, section, filename,
            embedding is null as embedding_null,
            case when embedding is null then null else vector_dims(embedding) end as dims
     from chunks
     where document_id = $1
     order by chunk_index asc`,
    [documentId],
  );

  const nullCount = chunks.filter((row) => row.embedding_null === true).length;
  const dims = [
    ...new Set(
      chunks
        .map((row) => row.dims)
        .filter((value) => value != null)
        .map((value) => String(value)),
    ),
  ];

  const zeros = await sql.query(
    `select count(*)::int as zeros
     from chunks
     where document_id = $1
       and embedding is not null
       and embedding = array_fill(0::real, array[768])::vector`,
    [documentId],
  );

  console.log(`DOC_STATUS=${docs[0]?.status ?? "missing"}`);
  console.log(`DOC_FILENAME=${docs[0]?.filename ?? ""}`);
  console.log(`DOC_PAGE_COUNT=${docs[0]?.page_count ?? ""}`);
  console.log(`CHUNK_COUNT=${chunks.length}`);
  console.log(`NULL_EMBEDDING_COUNT=${nullCount}`);
  console.log(`VECTOR_DIMS=${dims.join(",") || "none"}`);
  console.log(`ZERO_VECTORS=${zeros[0]?.zeros ?? 0}`);
  console.log(`FIRST_LOCATOR=${chunks[0]?.locator ?? ""}`);
  console.log(`LAST_LOCATOR=${chunks.at(-1)?.locator ?? ""}`);
  console.log(
    `DISTINCT_PAGES=${[...new Set(chunks.map((row) => String(row.page)))].join(",")}`,
  );
  console.log(
    `SECTIONS=${chunks.map((row) => String(row.section)).join(",")}`,
  );
  console.log(
    `PAGES=${chunks.map((row) => String(row.page)).join(",")}`,
  );
  console.log(
    `INDEXES=${chunks.map((row) => String(row.chunk_index)).join(",")}`,
  );
} catch (error) {
  console.error(redactSecrets(error instanceof Error ? error.message : error));
  process.exit(1);
}
