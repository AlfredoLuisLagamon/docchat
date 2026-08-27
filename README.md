# docchat

A small document-chat application built with Next.js, Vercel AI SDK, Neon Postgres, and pgvector.

Upload a PDF, TXT, or Markdown file inside the conversation, then ask questions grounded in the document with inline citations and expandable evidence.

Live demo: https://docchat-orcin.vercel.app

Repository: https://github.com/AlfredoLuisLagamon/docchat

Open `/` so the app can mint a visitor cookie and create a chat. Do not bookmark a `/c/[chatId]` URL from someone else; chats are cookie-scoped.

## Features

- PDF, TXT, and Markdown upload from the chat composer
- Persistent cookie-scoped conversations
- Neon storage for chats, messages, document metadata, chunks, and embeddings
- `gemini-embedding-2` embeddings at 768 dimensions
- Exact cosine search with pgvector (`<=>`, top 8)
- Streamed grounded answers (`gemini-3.6-flash`)
- Inline numbered citations (`[n]`)
- Page-level PDF provenance (`Page N`)
- Heading-level Markdown provenance (nested locators)
- `presentEvidence` tool and expandable evidence cards
- Reload-safe `UIMessage.parts` (citations and evidence without rerunning retrieval or Gemini)
- Loading, empty, and safe error states

## Architecture

Retrieval is application-controlled. Every question against a ready document is embedded and searched before `streamText`. The model does not choose whether to search.

```
Browser
  │
  ├─ file upload
  │    ↓
  │  /api/documents
  │    ↓
  │  extract + provenance
  │    ↓
  │  chunk
  │    ↓
  │  embedMany(RETRIEVAL_DOCUMENT)
  │    ↓
  │  Neon / pgvector
  │
  └─ question
       ↓
     /api/chat
       ↓
     embed(RETRIEVAL_QUERY)
       ↓
     exact pgvector top-8
       ↓
     grounded streamText
       ↓
     [n] citations
       ↓
     presentEvidence(sourceIds)
       ↓
     streamed UIMessage
       ↓
     persisted messages.parts
```

Pinned runtime: Next.js 16.3.3, `ai@6.0.270`, `@ai-sdk/react@3.0.273`, `@ai-sdk/google@3.0.116`.

## Data model

| Table | Role |
| --- | --- |
| `chats` | Conversation owned by `visitor_id` |
| `documents` | Upload metadata, ingest status, optional `page_count` |
| `chunks` | Extracted text, locator/page/section, embedding |
| `messages` | User/assistant turns as AI SDK UI message `parts` JSON |

`chunks.embedding` is `vector(768)` and **nullable** while a document is parsing, embedding, or failed. Ready documents are enforced in application code and `npm run db:verify`: every chunk on a ready document must have a valid 768-dimensional embedding. There is no HNSW or IVFFlat index.

`messages.parts` stores UI parts, including:

- `text`
- `data-sources` (citation map for that turn)
- `tool-presentEvidence` (selected evidence snapshot)

Reload reconstructs the transcript from Postgres. Completed turns are not re-retrieved or re-generated. A retry of the same user message id streams the stored assistant instead of calling Gemini again.

Original file bytes are not stored—only extracted text, chunks, and metadata.

## Ingestion

Uploads are accepted from the composer. Maximum size is 5 MB (`5 * 1024 * 1024` bytes).

### PDF

- Parsed with `unpdf`
- Selectable text only; scanned/image-only and empty-text PDFs are rejected
- `extractText({ mergePages: false })` — one string per physical page
- Chunks never cross page boundaries; a long page may become multiple chunks that share `Page N`
- Provenance: `page` plus locator `Page N` (1-based physical pages; blank pages are skipped without renumbering later pages)
- Maximum 50 pages

### Markdown

- ATX headings; locators nest like `Project Mercury > Infrastructure > Database`
- Headings inside fenced code are ignored
- Text before the first heading uses locator `Preamble`
- Chunks stay inside a section; sections are packed independently

### TXT

- Paragraph-aware packing (target ~500–800 tokens, modest overlap)
- Deterministic locators `Section N`

Statuses shown in the UI: Parsing…, Embedding…, Ready, Failed. Failed documents keep a short safe error; re-attach is the recovery path (no ingest retry endpoint).

## Retrieval and grounding

Embeddings use `gemini-embedding-2` at 768 dimensions:

- stored chunks: `RETRIEVAL_DOCUMENT`
- user questions: `RETRIEVAL_QUERY`

Search (chat-scoped, ready documents only):

```sql
ORDER BY embedding <=> query_vector
LIMIT 8
```

Exact cosine distance is intentional. docchat targets small collections (hundreds of chunks, not millions). Exact pgvector search stays deterministic and simple. An ANN index such as HNSW was not used; it would add complexity without a meaningful latency benefit at this scale.

The system prompt requires answers from the numbered retrieved sources only. If those sources are insufficient, the model must say the uploaded documents do not provide that information, without a fake citation, and must not call `presentEvidence`. Document text is treated as untrusted content and must not override system instructions.

There is no similarity cutoff. Unsupported questions can still retrieve related chunks; the prompt, not a threshold, is what rejects them.

## Citations and evidence

**Inline citations**

1. Retrieval returns up to 8 chunks in rank order.
2. The server assigns `[1]`…`[8]` and writes a `data-sources` part (chunk id, filename, locator, page, section, excerpt).
3. Excerpts are truncated stored chunk text (400 characters), not model-written.
4. The model is instructed to cite claims with those numbers. Invalid `[n]` values stay plain text and are not remapped.

`data-sources` is the full citation map for the turn. It is persisted so `[n]` keeps the same meaning after reload.

**Evidence tool**

```ts
presentEvidence({ sourceIds: [...] })
```

- 1–5 source IDs only
- allow-list is the **current retrieval set** (a UUID that exists in Neon but was not retrieved is rejected)
- SQL reload is `chat_id` + `id = any(...)`
- filename, page/section, locator, and excerpt come from Neon

`data-sources` maps every inline `[n]`. `presentEvidence` is the model-selected subset shown as evidence cards. Cards render completed tool output only. Unsupported answers have no Evidence section.

## Persistence and visitor model

Cookie: `docchat_visitor=<uuid>`

- HttpOnly
- SameSite=Lax
- Path=/
- Secure in production

The assignment did not require login. Identity lives on `chats.visitor_id`. Chat-scoped APIs load the chat with `id` **and** `visitor_id`. Browser-supplied visitor ids (headers, body fields) are not trusted. This is a lightweight take-home identity model, not an auth system.

## Setup

```bash
git clone https://github.com/AlfredoLuisLagamon/docchat.git
cd docchat
npm install
```

Copy `.env.example` to `.env.local`:

```
DATABASE_URL=
GOOGLE_GENERATIVE_AI_API_KEY=
```

Use a Neon pooled connection string. Apply and check schema:

```bash
npm run db:setup
npm run db:verify
```

```bash
npm run dev
```

Quality checks:

```bash
npm run typecheck
npm run lint
npm run build
```

## Deployment

Hosted on Vercel (Hobby) with Neon Postgres. `DATABASE_URL` and `GOOGLE_GENERATIVE_AI_API_KEY` are set in the Vercel project environment. Deployment is a standard Next.js App Router build. `/api/dev/retrieve` and `/api/dev/present-evidence` return 404 when `NODE_ENV === "production"`.

## Key trade-offs

- **Exact vector search, not HNSW.** Small corpus; simpler, deterministic ranking.
- **No original file blobs.** Only extracted text, chunks, and metadata.
- **No OCR.** Image-only PDFs fail with an explicit error instead of a paid OCR pipeline.
- **Cookie identity, not auth.** Matches take-home scope.
- **Application-controlled retrieval.** Document questions always retrieve before generation.
- **Persisted citation snapshots.** `[n]` and evidence survive reload without another search or Gemini call.

## Known limitations

- Scanned/image-only PDFs are unsupported
- 5 MB upload limit
- PDFs over 50 pages are rejected
- No authentication or multi-user sharing
- Retrieval covers all **ready** documents in the current chat; mixed files can surface conflicting facts
- Queries that repeat a project/document name can rank overview chunks above more specific ones
- No reranking or hybrid search
- Gemini free-tier generate quota can temporarily return a friendly rate-limit message after repeated use; embeddings and retrieval may still succeed

## Time spent

Approximately 4.5 hours of implementation/debugging, starting around 9:30pm the previous evening.

## AI tools used

- Cursor
- ChatGPT

AI was used for implementation assistance and review. Architecture, retrieval/citation behavior, and production checks were verified against the running app, schema, and notes.

## Example of correcting AI-generated output

**Evidence provenance.** An approach that let the model emit evidence objects with filename, page, and excerpt was rejected: that metadata would be model-generated and could be fabricated. `presentEvidence` accepts only retrieved chunk IDs. The server checks them against the current retrieval set and resolves filename, page/section, and excerpt from Neon. Citation and evidence metadata are database data, not LLM-authored fields.

**Secondary: duplicate answer text.** `stopWhen: stepCountIs(2)` led Gemini to answer before `presentEvidence` and repeat the same sentence afterward, which persisted as two `text` parts. The fix stops after the first step that already has answer text, filters extra text from the UI stream, and composes parts at persist/load time. The renderer does not hide duplicates by string equality.

## Production verification

Against https://docchat-orcin.vercel.app:

- `/` loads and redirects into a visitor-owned chat
- `/api/health` reports a working Neon connection without leaking secrets
- Visitor cookie is HttpOnly, Secure, SameSite=Lax, Path=/
- PDF ingest reached Ready with a correct page count
- Grounded question “How often are backups performed?” streamed an answer of every eight hours with `[1]`
- `presentEvidence` ran; evidence resolved to `helios.pdf` · Page 4 with the backup sentence in the excerpt
- Reload kept the user message, assistant text, citation map, and evidence tool part
- A second visitor received 404 for the first visitor’s chat, chat POST, and document POST
- `POST /api/dev/retrieve` returns 404 in production

TXT and Markdown **ingestion** (and retrieval locators such as `Section 1` / `Database`) were exercised in production. Follow-up **generation** for those formats and an unsupported CEO question hit Gemini rate limits in that session and were not counted as successful live answers.
