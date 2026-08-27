import { neon } from "@neondatabase/serverless";
import { loadEnvFiles } from "./load-env.mjs";
import { redactSecrets } from "./redact.mjs";

loadEnvFiles();

const sql = neon(process.env.DATABASE_URL);

function summarize(row) {
  const parts = row.parts;
  const isArray = Array.isArray(parts);
  const types = isArray ? parts.map((part) => part?.type) : typeof parts;
  const textChars = isArray
    ? parts
        .filter((part) => part?.type === "text")
        .reduce((sum, part) => sum + String(part.text ?? "").length, 0)
    : 0;
  return {
    role: row.role,
    partsIsArray: isArray,
    partTypes: types,
    partsIsString: typeof parts === "string",
    textChars,
  };
}

try {
  const chatId = process.argv[2];
  if (!chatId) {
    throw new Error("chat id argument required");
  }

  const chat = await sql.query(
    `select id, updated_at from chats where id = $1`,
    [chatId],
  );
  const messages = await sql.query(
    `select role, parts, created_at
     from messages
     where chat_id = $1
     order by created_at asc`,
    [chatId],
  );

  console.log(`CHAT_ROWS=${chat.length}`);
  console.log(`MESSAGE_COUNT=${messages.length}`);
  console.log(
    `ROLES=${messages.map((row) => row.role).join(",")}`,
  );
  console.log(`UPDATED_AT=${chat[0]?.updated_at ?? ""}`);
  for (const [index, row] of messages.entries()) {
    console.log(`MSG_${index}=${JSON.stringify(summarize(row))}`);
  }
} catch (error) {
  console.error(redactSecrets(error instanceof Error ? error.message : error));
  process.exit(1);
}
