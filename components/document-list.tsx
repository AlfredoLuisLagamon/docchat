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

function documentHeading(document: DocumentRecord) {
  if (document.status === "ready" && document.pageCount != null) {
    return `${document.filename} · ${document.pageCount} pages`;
  }
  if (document.status === "ready") {
    return document.filename;
  }
  return `${document.filename} · ${statusLabel(document.status)}`;
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
    <ul className="mb-4 space-y-1 text-sm text-muted">
      {visible.map((document) => (
        <li key={document.id} className="min-w-0 break-words">
          <span>{documentHeading(document)}</span>
          {document.status === "error" ? (
            <p className="text-sm text-danger">
              {safeIngestError(document.errorMessage)}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
