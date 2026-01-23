-- Enable pgvector (safe if already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- ReferenceChunk: add pgvector embedding column
-- RAG spec: text-embedding-3-small => 1536 dims
ALTER TABLE "ReferenceChunk"
  ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

-- Section: add pgvector embedding column
ALTER TABLE "Section"
  ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

-- Page: add web-kb freshness/scheduling fields
ALTER TABLE "Page"
  ADD COLUMN IF NOT EXISTS "content_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "refresh_interval_hours" INTEGER NOT NULL DEFAULT 24;

-- Index to support selecting due pages per site
CREATE INDEX IF NOT EXISTS "Page_site_id_refresh_interval_hours_fetched_at_idx"
  ON "Page" ("site_id", "refresh_interval_hours", "fetched_at");

-- RAG spec: HNSW L2 index for pgvector similarity (<->)
CREATE INDEX IF NOT EXISTS "ReferenceChunk_embedding_hnsw_l2_idx"
  ON "ReferenceChunk" USING hnsw ("embedding" vector_l2_ops);

CREATE INDEX IF NOT EXISTS "Section_embedding_hnsw_l2_idx"
  ON "Section" USING hnsw ("embedding" vector_l2_ops);
