"use client";

import { useId, useState } from "react";
import type { EvidenceSource } from "@/lib/retrieval/present-evidence";

function excerptPreview(excerpt: string) {
  const compact = excerpt.replace(/\s+/g, " ").trim();
  if (compact.length <= 140) {
    return compact;
  }
  return `${compact.slice(0, 140).trimEnd()}…`;
}

export function EvidenceCard({ source }: { source: EvidenceSource }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const label = `${source.filename} · ${source.locator}`;

  return (
    <div
      className={`min-w-0 rounded-lg border bg-surface ${
        open ? "border-violet/40" : "border-border"
      }`}
    >
      <button
        type="button"
        className="flex w-full min-w-0 items-start gap-2 px-2.5 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-foreground">
            {label}
          </span>
          {!open ? (
            <span className="mt-0.5 line-clamp-2 break-words text-[0.7rem] leading-4 text-muted">
              {excerptPreview(source.excerpt)}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 shrink-0 text-[0.65rem] text-muted" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open ? (
        <div id={panelId} className="border-t border-border px-2.5 py-2">
          <p className="break-words text-xs font-medium text-foreground">
            {source.filename}
          </p>
          <p className="break-words text-[0.7rem] text-muted">
            {source.locator}
          </p>
          <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-foreground">
            {source.excerpt}
          </p>
        </div>
      ) : null}
    </div>
  );
}
