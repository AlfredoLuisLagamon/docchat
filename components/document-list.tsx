"use client";

import type { DocumentRecord } from "@/lib/documents";
import { safeIngestError } from "@/lib/safe-ui";

function statusLabel(status: string) {
  if (status === "parsing") {
    return "Parsing…";
  }
  if (status === "embedding") {
    return "Embedding…";
  }
  if (status === "ready") {
    return "Ready";
  }
  if (status === "error") {
    return "Failed";
  }
  return status;
}

function documentMeta(document: DocumentRecord) {
  if (document.status === "ready" && document.pageCount != null) {
    return `${document.pageCount} pages`;
  }
  if (document.status === "ready") {
    return null;
  }
  return statusLabel(document.status);
}

function DocumentIcon() {
  return (
    <svg
      aria-hidden
      className="mt-0.5 size-4 shrink-0 text-muted"
      fill="none"
      viewBox="0 0 16 16"
    >
      <path
        d="M4.25 1.75h5.2L12.25 4.6v9.65H4.25V1.75Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M9.35 1.75V4.7h2.9"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DocumentList({ documents }: { documents: DocumentRecord[] }) {
  const visible = documents.filter(
    (document) =>
      typeof document.id === "string" &&
      document.id.length > 0 &&
      typeof document.filename === "string" &&
      document.filename.length > 0,
  );
  if (visible.length === 0) {
    return null;
  }

  return (
    <ul className="mb-4 space-y-2">
      {visible.map((document) => {
        const meta = documentMeta(document);
        return (
          <li key={document.id}>
            <div className="flex min-w-0 items-start gap-2.5 rounded-[9px] border border-border bg-surface-subtle px-3 py-2">
              <DocumentIcon />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                {document.filename}
              </span>
              {meta ? (
                <span className="shrink-0 text-[12px] text-muted">{meta}</span>
              ) : null}
            </div>
            {document.status === "error" ? (
              <p className="mt-1.5 text-[13px] text-danger">
                {safeIngestError(document.errorMessage)}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
