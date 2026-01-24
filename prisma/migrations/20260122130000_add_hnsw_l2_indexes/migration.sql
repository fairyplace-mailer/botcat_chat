-- Add HNSW (L2) indexes for embedding vectors per docs/rag_spec.md
-- This migration must be safe to run in production with existing data.
-- pgvector HNSW doesn't support > 2000 dimensions, while we standardize on 1536
-- (text-embedding-3-small) for Vercel Hobby performance.

-- 1) Normalize any incompatible embeddings before creating indexes.
-- If the database previously stored 3072-dim vectors, we must clear them.
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

-- 2) Enforce vector(1536) column types.
-- (This will fail if incompatible data remains; the UPDATE above prevents that.)
ALTER TABLE "Section"
  ALTER COLUMN "embedding" TYPE vector(1536)
  USING "embedding"::vector(1536);

ALTER TABLE "ReferenceChunk"
  ALTER COLUMN "embedding" TYPE vector(1536)
  USING "embedding"::vector(1536);

-- 3) (Re)create HNSW L2 indexes.
-- Use DROP IF EXISTS to handle partial previous attempts safely.
DROP INDEX IF EXISTS "ReferenceChunk_embedding_hnsw_l2_idx";
DROP INDEX IF EXISTS "Section_embedding_hnsw_l2_idx";

CREATE INDEX "ReferenceChunk_embedding_hnsw_l2_idx"
  ON "ReferenceChunk" USING hnsw ("embedding" vector_l2_ops);

CREATE INDEX "Section_embedding_hnsw_l2_idx"
  ON "Section" USING hnsw ("embedding" vector_l2_ops);
