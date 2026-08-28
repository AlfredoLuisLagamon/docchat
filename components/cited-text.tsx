"use client";

import {
  citationLabel,
  getCitationSources,
  type CitationSource,
} from "@/lib/chat-message";
import type { UIMessage } from "ai";

const CITATION_TOKEN = /(\[\d+\])/g;
const CITATION_NUMBER = /^\[(\d+)\]$/;

function sourceByNumber(sources: CitationSource[], number: number) {
  return sources.find((source) => source.number === number);
}

export function CitedText({
  text,
  message,
}: {
  text: string;
  message: UIMessage;
}) {
  const sources = (() => {
    try {
      return getCitationSources(message);
    } catch {
      return [];
    }
  })();
  const pieces = text.split(CITATION_TOKEN);

  return (
    <span className="whitespace-pre-wrap break-words">
      {pieces.map((piece, index) => {
        const match = piece.match(CITATION_NUMBER);
        if (!match) {
          return <span key={index}>{piece}</span>;
        }

        const number = Number(match[1]);
        const source = sourceByNumber(sources, number);
        if (!source) {
          return <span key={index}>{piece}</span>;
        }

        const label = citationLabel(source);
        return (
          <sup key={index} className="whitespace-nowrap">
            <span
              className="mx-0.5 inline-flex min-w-3.5 items-center justify-center rounded-[5px] bg-accent-soft px-1 py-px text-[0.65rem] font-medium leading-none text-accent"
              title={`${label}\n${source.excerpt}`}
              aria-label={label}
            >
              [{source.number}]
            </span>
          </sup>
        );
      })}
    </span>
  );
}
