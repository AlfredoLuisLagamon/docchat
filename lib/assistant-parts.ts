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

export function omitTextAfterFirstAnswerTransform<T extends { type: string }>() {
  const droppedIds = new Set<string>();
  let keptNonEmptyText = false;

  return new TransformStream<T, T>({
    transform(chunk, controller) {
      if (chunk.type === "text-start") {
        const id = "id" in chunk ? String(chunk.id) : "";
        if (keptNonEmptyText) {
          droppedIds.add(id);
          return;
        }
        controller.enqueue(chunk);
        return;
      }

      if (chunk.type === "text-delta" || chunk.type === "text-end") {
        const id = "id" in chunk ? String(chunk.id) : "";
        if (droppedIds.has(id)) {
          return;
        }
        if (
          chunk.type === "text-delta" &&
          "delta" in chunk &&
          typeof chunk.delta === "string" &&
          chunk.delta.trim().length > 0
        ) {
          keptNonEmptyText = true;
        }
        controller.enqueue(chunk);
        return;
      }

      controller.enqueue(chunk);
    },
  });
}
