import { existsSync, readFileSync } from "node:fs";
import { loadEnvFiles } from "./load-env.mjs";

loadEnvFiles();

const chatId = process.argv[2];
const query = process.argv.slice(3).join(" ");
const cookieJar = process.env.RETRIEVE_COOKIE_JAR;
const origin = process.env.RETRIEVE_ORIGIN ?? "http://localhost:3000";

if (!chatId || !query) {
  console.error("Usage: node scripts/test-retrieval.mjs <chatId> <query>");
  process.exit(1);
}

function visitorCookie(jarPath) {
  if (!jarPath || !existsSync(jarPath)) {
    return null;
  }
  for (const line of readFileSync(jarPath, "utf8").split(/\r?\n/)) {
    if (!line.includes("docchat_visitor")) {
      continue;
    }
    const parts = line.split("\t");
    return parts.at(-1) ?? null;
  }
  return null;
}

const headers = { "Content-Type": "application/json" };
const visitor = visitorCookie(cookieJar);
if (visitor) {
  headers.Cookie = `docchat_visitor=${visitor}`;
}

const response = await fetch(`${origin}/api/dev/retrieve`, {
  method: "POST",
  headers,
  body: JSON.stringify({ chatId, query }),
});

if (!response.ok) {
  const text = await response.text();
  console.error(`HTTP ${response.status}`);
  console.error(text.slice(0, 300));
  process.exit(1);
}

const payload = await response.json();
console.log(`QUERY=${query}`);
console.log(`EMBED_DIMS=${payload.embeddingDimensions}`);
console.log(`EMBED_MS=${payload.embedMs}`);
console.log(`SEARCH_MS=${payload.searchMs}`);
console.log(`TOTAL_MS=${payload.totalMs}`);
for (const row of payload.results ?? []) {
  console.log(
    `RANK=${row.rank} FILE=${row.filename} LOCATOR=${row.locator} SIM=${Number(row.similarity).toFixed(4)} EXCERPT=${JSON.stringify(row.excerpt)}`,
  );
}
