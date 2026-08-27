# docchat

Grounded document chat (Next.js, AI SDK 6, Neon pgvector).

## Stage 1 setup

1. Create a Neon project and copy the pooled connection string.
2. Copy `.env.example` to `.env.local` and set `DATABASE_URL`.
3. `GOOGLE_GENERATIVE_AI_API_KEY` can wait until chat/embeddings stages.
4. Apply and verify schema:

```bash
npm run db:setup
npm run db:verify
```

5. Run the app:

```bash
npm run dev
```

Exact cosine search (no HNSW/IVFFlat) is intentional for small collections. Model IDs and embedding size live in `lib/ai-config.ts` and must match `chunks.embedding vector(768)`.
