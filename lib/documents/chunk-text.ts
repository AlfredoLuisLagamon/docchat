/**
 * Character-based chunking for Stage 4 TXT ingestion.
 *
 * Approximation: 4 characters ≈ 1 token. Target 500–800 tokens
 * (about 2000–3200 characters) with modest overlap (~80 tokens).
 * Paragraph boundaries (`\n\n`) are preferred over mid-sentence cuts.
 */
export const CHARS_PER_TOKEN = 4;
export const TARGET_CHUNK_CHARS = 600 * CHARS_PER_TOKEN;
export const MAX_CHUNK_CHARS = 800 * CHARS_PER_TOKEN;
export const OVERLAP_CHARS = 80 * CHARS_PER_TOKEN;

export type PlainTextChunk = {
  filename: string;
  locator: string;
  page: number | null;
  section: string | null;
  chunkIndex: number;
  content: string;
};

function splitParagraphs(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function splitOversized(paragraph: string) {
  if (paragraph.length <= MAX_CHUNK_CHARS) {
    return [paragraph];
  }

  const pieces: string[] = [];
  let start = 0;
  while (start < paragraph.length) {
    const end = Math.min(start + MAX_CHUNK_CHARS, paragraph.length);
    pieces.push(paragraph.slice(start, end));
    if (end >= paragraph.length) {
      break;
    }
    start = Math.max(end - OVERLAP_CHARS, start + 1);
  }
  return pieces;
}

function packUnits(units: string[]) {
  const packed: string[] = [];
  let buffer: string[] = [];
  let length = 0;

  const flush = () => {
    if (buffer.length === 0) {
      return;
    }
    packed.push(buffer.join("\n\n"));
    buffer = [];
    length = 0;
  };

  for (const unit of units) {
    for (const piece of splitOversized(unit)) {
      const extra = buffer.length > 0 ? 2 + piece.length : piece.length;
      if (buffer.length > 0 && length + extra > TARGET_CHUNK_CHARS) {
        flush();
        const previous = packed[packed.length - 1];
        if (previous) {
          const overlap = previous.slice(-OVERLAP_CHARS).trim();
          if (overlap) {
            buffer = [overlap];
            length = overlap.length;
          }
        }
      }
      buffer.push(piece);
      length += buffer.length > 1 ? 2 + piece.length : piece.length;
      if (length >= MAX_CHUNK_CHARS) {
        flush();
      }
    }
  }

  flush();
  return packed;
}

export function packTextUnits(text: string) {
  return packUnits(splitParagraphs(text));
}

export function chunkPlainText(
  text: string,
  filename: string,
): PlainTextChunk[] {
  const contents = packTextUnits(text);
  return contents.map((content, chunkIndex) => {
    const section = `Section ${chunkIndex + 1}`;
    return {
      filename,
      locator: section,
      page: null,
      section,
      chunkIndex,
      content,
    };
  });
}
