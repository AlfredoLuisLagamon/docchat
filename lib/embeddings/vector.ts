import { EMBEDDING_DIM } from "@/lib/ai-config";

export class EmbeddingError extends Error {
  constructor(message = "Invalid embedding.") {
    super(message);
    this.name = "EmbeddingError";
  }
}

export function assertValidEmbedding(values: number[]) {
  if (values.length !== EMBEDDING_DIM) {
    throw new EmbeddingError();
  }
  if (!values.every((value) => Number.isFinite(value))) {
    throw new EmbeddingError();
  }
  if (values.every((value) => value === 0)) {
    throw new EmbeddingError();
  }
}

export function toVectorLiteral(values: number[]) {
  assertValidEmbedding(values);
  return `[${values.join(",")}]`;
}
