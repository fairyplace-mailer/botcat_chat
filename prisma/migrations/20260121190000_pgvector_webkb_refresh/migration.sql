-- Enable pgvector (safe if already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- ReferenceChunk: add pgvector embedding column
ALTER TABLE "ReferenceChunk"
  ADD COLUMN IF NOT EXISTS "embedding" vector(3072);

-- Section: add pgvector embedding column
ALTER TABLE "Section"
  ADD COLUMN IF NOT EXISTS "embedding" vector(3072);

-- Page: add web-kb freshness/scheduling fields
ALTER TABLE "Page"
  ADD COLUMN IF NOT EXISTS "content_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "refresh_interval_hours" INTEGER NOT NULL DEFAULT 480;

-- Index to support selecting due pages per site
CREATE INDEX IF NOT EXISTS "Page_site_id_refresh_interval_hours_fetched_at_idx"
  ON "Page" ("site_id", "refresh_interval_hours", "fetched_at");
