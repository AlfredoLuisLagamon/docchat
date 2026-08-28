"use client";

import { EvidenceCard } from "@/components/evidence-card";
import type { DocChatUIMessage } from "@/lib/chat-message";
import type { EvidenceSource } from "@/lib/retrieval/present-evidence";

function isEvidenceSource(value: unknown): value is EvidenceSource {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const source = value as Record<string, unknown>;
  return (
    typeof source.id === "string" &&
    source.id.length > 0 &&
    typeof source.filename === "string" &&
    typeof source.locator === "string" &&
    typeof source.excerpt === "string"
  );
}

function sourcesFromOutput(output: unknown): EvidenceSource[] {
  if (typeof output !== "object" || output === null || !("sources" in output)) {
    return [];
  }
  const sources = (output as { sources: unknown }).sources;
  if (!Array.isArray(sources)) {
    return [];
  }
  return sources.filter(isEvidenceSource);
}

export function EvidenceList({ message }: { message: DocChatUIMessage }) {
  if (!Array.isArray(message.parts)) {
    return null;
  }

  const parts = message.parts.filter(
    (part) =>
      typeof part === "object" &&
      part !== null &&
      part.type === "tool-presentEvidence",
  );

  if (parts.length === 0) {
    return null;
  }

  const selecting = parts.some(
    (part) =>
      part.state === "input-streaming" || part.state === "input-available",
  );
  const failed = parts.some((part) => part.state === "output-error");
  const sources = parts.flatMap((part) =>
    part.state === "output-available" ? sourcesFromOutput(part.output) : [],
  );

  if (sources.length > 0) {
    return (
      <section className="mt-3 min-w-0" aria-label="Evidence">
        <h2 className="border-b border-border pb-1.5 text-[13px] font-medium text-muted">
          Evidence
        </h2>
        <div className="divide-y divide-border">
          {sources.map((source, index) => (
            <EvidenceCard key={`${source.id}-${index}`} source={source} />
          ))}
        </div>
      </section>
    );
  }

  if (selecting) {
    return (
      <p className="mt-3 text-[13px] text-muted">Selecting evidence…</p>
    );
  }

  if (failed) {
    return (
      <p className="mt-3 text-[13px] text-muted">Evidence unavailable.</p>
    );
  }

  return null;
}
