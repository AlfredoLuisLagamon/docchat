type Part = {
  type: string;
  text?: string;
};

export function composeAssistantParts<T extends Part>(parts: T[]): T[] {
  const firstTextIndex = parts.findIndex(
    (part) =>
      part.type === "text" &&
      typeof part.text === "string" &&
      part.text.trim().length > 0,
  );

  return parts.filter((part, index) => {
    if (part.type === "step-start") {
      return false;
    }
    if (part.type === "text") {
      return index === firstTextIndex;
    }
    return true;
  });
}

export function stopAfterFirstTextStep({
  steps,
}: {
  steps: Array<{ text?: string }>;
}) {
  if (steps.length >= 2) {
    return true;
  }
  const text = steps[0]?.text;
  return typeof text === "string" && text.trim().length > 0;
}

export function readableFromAsync<T>(iterable: AsyncIterable<T>) {
  const iterator = iterable[Symbol.asyncIterator]();
  return new ReadableStream<T>({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(value);
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

export async function* omitTextAfterFirstAnswer<T extends { type: string }>(
  chunks: AsyncIterable<T>,
) {
  const droppedIds = new Set<string>();
  let keptNonEmptyText = false;

  for await (const chunk of chunks) {
    if (chunk.type === "text-start") {
      const id = "id" in chunk ? String(chunk.id) : "";
      if (keptNonEmptyText) {
        droppedIds.add(id);
        continue;
      }
      yield chunk;
      continue;
    }

    if (chunk.type === "text-delta" || chunk.type === "text-end") {
      const id = "id" in chunk ? String(chunk.id) : "";
      if (droppedIds.has(id)) {
        continue;
      }
      if (
        chunk.type === "text-delta" &&
        "delta" in chunk &&
        typeof chunk.delta === "string" &&
        chunk.delta.trim().length > 0
      ) {
        keptNonEmptyText = true;
      }
      yield chunk;
      continue;
    }

    yield chunk;
  }
}
