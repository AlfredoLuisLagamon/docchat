import { google } from "@ai-sdk/google";

export const CHAT_MODEL = "gemini-3.6-flash";
export const EMBEDDING_MODEL = "gemini-embedding-2";
export const EMBEDDING_DIM = 768;

export const chatModel = google(CHAT_MODEL);
export const embeddingModel = google.embedding(EMBEDDING_MODEL);

export const documentEmbeddingOptions = {
  google: {
    outputDimensionality: EMBEDDING_DIM,
    taskType: "RETRIEVAL_DOCUMENT",
  },
} as const;

export const queryEmbeddingOptions = {
  google: {
    outputDimensionality: EMBEDDING_DIM,
    taskType: "RETRIEVAL_QUERY",
  },
} as const;
