import { extractText, getDocumentProxy } from "unpdf";
import { packTextUnits, type PlainTextChunk } from "@/lib/documents/chunk-text";
import { IngestError } from "@/lib/documents/errors";

export const MAX_PDF_PAGES = 50;

export const NO_EXTRACTABLE_PDF_TEXT =
  "This PDF does not contain extractable text. Scanned/image-only PDFs are not supported.";

export class PdfIngestError extends IngestError {
  constructor(
    message: string,
    readonly pageCount: number | null = null,
    httpStatus = 400,
  ) {
    super(message, httpStatus);
    this.name = "PdfIngestError";
  }
}

export type PdfPage = {
  page: number;
  text: string;
};

export type ParsedPdf = {
  pageCount: number;
  pages: PdfPage[];
};

export function pdfPageLocator(page: number) {
  return `Page ${page}`;
}

export function normalizePdfText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function parsePdf(data: Uint8Array): Promise<ParsedPdf> {
  let pdf;
  try {
    pdf = await getDocumentProxy(data);
  } catch {
    throw new PdfIngestError("Could not read this PDF.");
  }

  const pageCount = pdf.numPages;
  if (pageCount > MAX_PDF_PAGES) {
    throw new PdfIngestError(
      "PDF is too long. Maximum is 50 pages.",
      pageCount,
    );
  }

  let extracted: { totalPages: number; text: string | string[] };
  try {
    extracted = await extractText(pdf, { mergePages: false });
  } catch {
    throw new PdfIngestError("Could not read this PDF.", pageCount);
  }

  const texts = Array.isArray(extracted.text)
    ? extracted.text
    : [extracted.text];
  const pages: PdfPage[] = [];

  for (let index = 0; index < pageCount; index += 1) {
    const text = normalizePdfText(texts[index] ?? "");
    if (!text) {
      continue;
    }
    pages.push({ page: index + 1, text });
  }

  if (pages.length === 0) {
    throw new PdfIngestError(NO_EXTRACTABLE_PDF_TEXT, pageCount);
  }

  return { pageCount, pages };
}

export function chunkPdfPages(
  pages: PdfPage[],
  filename: string,
): PlainTextChunk[] {
  const chunks: PlainTextChunk[] = [];
  let chunkIndex = 0;

  for (const page of pages) {
    const locator = pdfPageLocator(page.page);
    for (const content of packTextUnits(page.text)) {
      chunks.push({
        filename,
        locator,
        page: page.page,
        section: null,
        chunkIndex,
        content,
      });
      chunkIndex += 1;
    }
  }

  return chunks;
}
