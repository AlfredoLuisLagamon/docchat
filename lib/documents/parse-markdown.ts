import {
  packTextUnits,
  type PlainTextChunk,
} from "@/lib/documents/chunk-text";

export const PREAMBLE_LOCATOR = "Preamble";

export type MarkdownSection = {
  locator: string;
  content: string;
};

type HeadingFrame = {
  level: number;
  title: string;
};

function normalizeNewlines(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function openingFence(line: string) {
  const match = line.match(/^( {0,3})(`{3,}|~{3,})(.*)$/);
  if (!match) {
    return null;
  }
  const marker = match[2];
  const info = match[3] ?? "";
  if (marker.startsWith("`") && info.includes("`")) {
    return null;
  }
  return { char: marker[0], length: marker.length };
}

function closingFence(
  line: string,
  fence: { char: string; length: number },
) {
  const escaped = fence.char === "`" ? "`" : "~";
  const match = line.match(new RegExp(`^( {0,3})${escaped}{${fence.length},}[ \t]*$`));
  return Boolean(match);
}

function parseAtxHeading(line: string) {
  const match = line.match(/^( {0,3})(#{1,6})(?:[ \t]+|$)(.*)$/);
  if (!match) {
    return null;
  }
  const title = (match[3] ?? "")
    .replace(/[ \t]+#+\s*$/, "")
    .trim();
  if (!title) {
    return null;
  }
  return { level: match[2].length, title };
}

function locatorFromStack(stack: HeadingFrame[]) {
  return stack.map((frame) => frame.title).join(" > ");
}

function pushHeading(stack: HeadingFrame[], heading: { level: number; title: string }) {
  while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
    stack.pop();
  }
  stack.push(heading);
  return locatorFromStack(stack);
}

function flushSection(
  sections: MarkdownSection[],
  locator: string,
  lines: string[],
) {
  const content = lines.join("\n").trim();
  if (!content) {
    return;
  }
  sections.push({ locator, content });
}

export function parseMarkdownSections(text: string): MarkdownSection[] {
  const lines = normalizeNewlines(text).split("\n");
  const sections: MarkdownSection[] = [];
  const stack: HeadingFrame[] = [];
  let currentLocator = PREAMBLE_LOCATOR;
  let buffer: string[] = [];
  let fence: { char: string; length: number } | null = null;

  for (const line of lines) {
    if (fence) {
      buffer.push(line);
      if (closingFence(line, fence)) {
        fence = null;
      }
      continue;
    }

    const opened = openingFence(line);
    if (opened) {
      buffer.push(line);
      fence = opened;
      continue;
    }

    const heading = parseAtxHeading(line);
    if (heading) {
      flushSection(sections, currentLocator, buffer);
      buffer = [];
      currentLocator = pushHeading(stack, heading);
      continue;
    }

    buffer.push(line);
  }

  flushSection(sections, currentLocator, buffer);
  return sections;
}

export function chunkMarkdown(text: string, filename: string): PlainTextChunk[] {
  const chunks: PlainTextChunk[] = [];
  let chunkIndex = 0;

  for (const section of parseMarkdownSections(text)) {
    for (const content of packTextUnits(section.content)) {
      chunks.push({
        filename,
        locator: section.locator,
        page: null,
        section: section.locator,
        chunkIndex,
        content,
      });
      chunkIndex += 1;
    }
  }

  return chunks;
}
