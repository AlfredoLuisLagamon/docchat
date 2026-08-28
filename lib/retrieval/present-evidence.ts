import { tool } from "ai";
import { z } from "zod";
import { logChatFailure } from "@/lib/chat-error";
import { getSql } from "@/lib/db";
import { citationExcerpt } from "@/lib/retrieval/build-citation-sources";
import type { RetrievedChunk } from "@/lib/retrieval/retrieve-chunks";
import { isVisitorId } from "@/lib/visitor-cookie";

export const PRESENT_EVIDENCE_MAX_IDS = 5;

export type EvidenceSource = {
  id: string;
  filename: string;
  locator: string;
  page: number | null;
  section: string | null;
  excerpt: string;
};

export type PresentEvidenceOutput = {
  sources: EvidenceSource[];
};

export class PresentEvidenceError extends Error {
  constructor(message = "Invalid source IDs.") {
    super(message);
    this.name = "PresentEvidenceError";
  }
}

const presentEvidenceInputSchema = z.object({
  sourceIds: z.array(z.string()).min(1).max(PRESENT_EVIDENCE_MAX_IDS),
});

export async function resolvePresentEvidence(input: {
  chatId: string;
  allowedSourceIds: Set<string>;
  sourceIds: string[];
}): Promise<PresentEvidenceOutput> {
  if (!isVisitorId(input.chatId)) {
    throw new PresentEvidenceError();
  }

  const requested = input.sourceIds.map((id) => id.trim());
  if (
    requested.length === 0 ||
    requested.length > PRESENT_EVIDENCE_MAX_IDS ||
    requested.some((id) => !isVisitorId(id) || !input.allowedSourceIds.has(id))
  ) {
    throw new PresentEvidenceError();
  }

  const sql = getSql();
  const rows = await sql.query(
    `select id, filename, locator, page, section, content
     from chunks
     where chat_id = $1
       and id = any($2::uuid[])`,
    [input.chatId, requested],
  );

  const byId = new Map(
    rows.map((row) => {
      const record = row as Record<string, unknown>;
      return [String(record.id), record] as const;
    }),
  );

  const sources: EvidenceSource[] = [];
  for (const id of requested) {
    const row = byId.get(id);
    if (!row) {
      continue;
    }
    sources.push({
      id,
      filename: String(row.filename),
      locator: String(row.locator),
      page: row.page == null ? null : Number(row.page),
      section: row.section == null ? null : String(row.section),
      excerpt: citationExcerpt(String(row.content)),
    });
  }

  return { sources };
}

export function createPresentEvidenceTool(input: {
  chatId: string;
  retrievedSources: RetrievedChunk[];
}) {
  const allowedSourceIds = new Set(
    input.retrievedSources.map((source) => source.id),
  );

  return tool({
    description:
      "Present the strongest document chunks that support the answer. Pass only Source IDs from the current retrieved sources. Do not pass filenames, pages, or excerpts.",
    inputSchema: presentEvidenceInputSchema,
    execute: async ({ sourceIds }) => {
      try {
        return await resolvePresentEvidence({
          chatId: input.chatId,
          allowedSourceIds,
          sourceIds,
        });
      } catch (error) {
        logChatFailure("presentEvidence", error);
        throw error;
      }
    },
  });
}
