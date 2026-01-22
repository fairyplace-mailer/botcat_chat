-- Fix pgvector embedding dimensionality to 1536 (text-embedding-3-small) per docs/rag_spec.md.
-- Note: existing embeddings are not preserved (safe for environments where embeddings can be regenerated).
-- This migration should be applied before creating HNSW indexes.

-- ReferenceChunk.embedding
ALTER TABLE "ReferenceChunk"
  ALTER COLUMN "embedding" TYPE vector(1536) USING NULL;

UPDATE "ReferenceChunk" SET "dims" = 1536;

-- Section.embedding
ALTER TABLE "Section"
  ALTER COLUMN "embedding" TYPE vector(1536) USING NULL;

UPDATE "Section" SET "dims" = 1536;
