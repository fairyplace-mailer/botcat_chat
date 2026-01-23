-- Change pgvector embedding dimensionality to 1536 (text-embedding-3-small) per docs/rag_spec.md
-- This migration changes only schema (no data updates). If the DB contains existing 3072-dim vectors,
-- the ALTER TYPE will fail unless embeddings are cleared/rebuilt operationally.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "ReferenceChunk"
  ALTER COLUMN "embedding" TYPE vector(1536);

ALTER TABLE "Section"
  ALTER COLUMN "embedding" TYPE vector(1536);
