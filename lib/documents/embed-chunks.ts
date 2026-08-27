import { embedMany } from "ai";
import {
  documentEmbeddingOptions,
  embeddingModel,
} from "@/lib/ai-config";
import { IngestError } from "@/lib/documents/errors";
import { EmbeddingError, assertValidEmbedding } from "@/lib/embeddings/vector";

export const EMBEDDING_BATCH_SIZE = 50;

export async function embedChunkContents(contents: string[]) {
  const embeddings: number[][] = [];
  let batchCount = 0;

  for (let start = 0; start < contents.length; start += EMBEDDING_BATCH_SIZE) {
    batchCount += 1;
    const batch = contents.slice(start, start + EMBEDDING_BATCH_SIZE);
    const { embeddings: batchEmbeddings } = await embedMany({
      model: embeddingModel,
      values: batch,
      providerOptions: documentEmbeddingOptions,
    });

    if (batchEmbeddings.length !== batch.length) {
      throw new IngestError("Could not generate embeddings.");
    }

    for (const embedding of batchEmbeddings) {
      try {
        assertValidEmbedding(embedding);
      } catch (error) {
        if (error instanceof EmbeddingError) {
          throw new IngestError("Could not generate embeddings.");
        }
        throw error;
      }
      embeddings.push(embedding);
    }
  }

  if (embeddings.length !== contents.length) {
    throw new IngestError("Could not generate embeddings.");
  }

  return { embeddings, batchCount };
}
