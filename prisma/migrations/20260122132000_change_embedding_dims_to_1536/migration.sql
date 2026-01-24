-- Change pgvector embedding dimensionality to 1536 (text-embedding-3-small) per docs/rag_spec.md
--
-- IMPORTANT (Vercel Hobby): We intentionally use text-embedding-3-small (1536 dims).
-- Some databases may already contain older 3072-dim vectors (e.g. from text-embedding-3-large).
-- pgvector cannot change the column type to vector(1536) while incompatible vectors exist.
--
-- Therefore this migration:
--  1) clears any non-1536 embeddings (so they can be rebuilt by the ingest pipeline)
--  2) changes column types to vector(1536)
--
-- We DO NOT attempt to truncate/convert vectors, because that would be incorrect.

CREATE EXTENSION IF NOT EXISTS vector;

-- Clear incompatible embeddings before narrowing the vector dimension.
UPDATE "Section"
SET "embedding" = NULL,
    "dims" = NULL,
    "embedding_model" = NULL
WHERE "embedding" IS NOT NULL
  AND "dims" IS NOT NULL
  AND "dims" <> 1536;

UPDATE "ReferenceChunk"
SET "embedding" = NULL,
    "dims" = NULL,
    "embedding_model" = NULL
WHERE "embedding" IS NOT NULL
  AND "dims" IS NOT NULL
  AND "dims" <> 1536;

ALTER TABLE "ReferenceChunk"
  ALTER COLUMN "embedding" TYPE vector(1536);

ALTER TABLE "Section"
  ALTER COLUMN "embedding" TYPE vector(1536);
