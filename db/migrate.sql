-- Stage 4: allow chunks to be stored before embeddings exist.
-- Dimension stays 768. Stage 5 will populate embedding values.
ALTER TABLE chunks
  ALTER COLUMN embedding DROP NOT NULL;

-- Stage 4 test docs may be ready with NULL embeddings. Demote them rather than backfilling.
UPDATE documents
SET status = 'error',
    error_message = 'Re-upload required to generate embeddings.'
WHERE status = 'ready'
  AND EXISTS (
    SELECT 1
    FROM chunks
    WHERE chunks.document_id = documents.id
      AND chunks.embedding IS NULL
  );
