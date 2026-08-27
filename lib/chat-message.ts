import type { UIMessage } from "ai";
import type { PresentEvidenceOutput } from "@/lib/retrieval/present-evidence";

export type CitationSource = {
  number: number;
  id: string;
  filename: string;
  locator: string;
  page: number | null;
  section: string | null;
  excerpt: string;
};

export type DocChatDataParts = {
  sources: {
    items: CitationSource[];
  };
};

export type DocChatTools = {
  presentEvidence: {
    input: { sourceIds: string[] };
    output: PresentEvidenceOutput;
  };
};

export type DocChatUIMessage = UIMessage<never, DocChatDataParts, DocChatTools>;

export function isDataSourcesPart(
  part: UIMessage["parts"][number],
): part is { type: "data-sources"; data: { items: CitationSource[] } } {
  if (part.type !== "data-sources") {
    return false;
  }
  const data = "data" in part ? part.data : null;
  if (typeof data !== "object" || data === null || !("items" in data)) {
    return false;
  }
  return Array.isArray((data as { items: unknown }).items);
}

export function getCitationSources(message: UIMessage): CitationSource[] {
  const part = message.parts.find(isDataSourcesPart);
  if (!part) {
    return [];
  }
  return part.data.items.filter(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      typeof item.number === "number" &&
      typeof item.id === "string" &&
      typeof item.filename === "string" &&
      typeof item.locator === "string" &&
      typeof item.excerpt === "string",
  );
}

export function citationLabel(source: CitationSource) {
  return `${source.filename} · ${source.locator}`;
}
