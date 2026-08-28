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
    <div className={`min-w-0 ${open ? "bg-surface-subtle" : ""}`}>
      <button
        type="button"
        className="flex w-full min-w-0 items-start gap-2 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-foreground">
            {source.filename}
          </span>
          <span className="mt-0.5 block break-words text-[12px] text-muted">
            {source.locator}
          </span>
          {!open ? (
            <span className="mt-1 line-clamp-2 break-words text-[13px] leading-5 text-muted">
              {excerptPreview(source.excerpt)}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 shrink-0 text-[12px] text-muted-light" aria-hidden>
          {open ? "⌃" : "⌄"}
        </span>
      </button>
      {open ? (
        <div id={panelId} className="pb-3">
          <p className="whitespace-pre-wrap break-words text-[13px] leading-5 text-foreground">
            {source.excerpt}
          </p>
        </div>
      ) : null}
    </div>
  );
}
