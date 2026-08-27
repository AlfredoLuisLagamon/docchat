import type { RetrievedChunk } from "@/lib/retrieval/retrieve-chunks";

export function buildSourceContext(chunks: RetrievedChunk[]) {
  if (chunks.length === 0) {
    return "(none)";
  }

  return chunks
    .map((chunk, index) => {
      const lines = [
        `[${index + 1}]`,
        `Source ID: ${chunk.id}`,
        `Filename: ${chunk.filename}`,
        `Location: ${chunk.locator}`,
      ];
      if (chunk.page != null) {
        lines.push(`Page: ${chunk.page}`);
      }
      if (chunk.section != null && chunk.section.length > 0) {
        lines.push(`Section: ${chunk.section}`);
      }
      lines.push("Content:", chunk.content);
      return lines.join("\n");
    })
    .join("\n\n");
}
