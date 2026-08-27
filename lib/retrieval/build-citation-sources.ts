import type { CitationSource } from "@/lib/chat-message";
import type { RetrievedChunk } from "@/lib/retrieval/retrieve-chunks";

export const CITATION_EXCERPT_CHARS = 400;

export function citationExcerpt(content: string) {
  const trimmed = content.trim();
  if (trimmed.length <= CITATION_EXCERPT_CHARS) {
    return trimmed;
  }
  return `${trimmed.slice(0, CITATION_EXCERPT_CHARS).trimEnd()}…`;
}

export function buildCitationSources(
  chunks: RetrievedChunk[],
): CitationSource[] {
  return chunks.map((chunk, index) => ({
    number: index + 1,
    id: chunk.id,
    filename: chunk.filename,
    locator: chunk.locator,
    page: chunk.page,
    section: chunk.section,
    excerpt: citationExcerpt(chunk.content),
  }));
}
