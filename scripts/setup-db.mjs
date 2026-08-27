import { readFileSync } from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { loadEnvFiles } from "./load-env.mjs";
import { redactSecrets } from "./redact.mjs";

loadEnvFiles();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set in .env.local.");
  process.exit(1);
}

function sqlStatements(fileName) {
  const filePath = path.join(process.cwd(), "db", fileName);
  const sqlText = readFileSync(filePath, "utf8").replace(/--[^\n]*/g, "");
  return sqlText
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

const sql = neon(databaseUrl);

try {
  for (const statement of sqlStatements("schema.sql")) {
    await sql.query(statement);
    console.log(`ok: ${statement.split("\n")[0].slice(0, 72)}`);
  }
  for (const statement of sqlStatements("migrate.sql")) {
    await sql.query(statement);
    console.log(`ok: ${statement.split("\n")[0].slice(0, 72)}`);
  }
  console.log("Schema applied.");
} catch (error) {
  console.error(redactSecrets(error instanceof Error ? error.message : error));
  process.exit(1);
}
