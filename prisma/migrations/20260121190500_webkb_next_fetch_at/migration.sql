-- Add deterministic scheduling for web KB pages

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "Page"
ADD COLUMN IF NOT EXISTS "next_fetch_at" TIMESTAMP(3);

-- Backfill next_fetch_at for existing pages:
-- If never fetched -> due now
-- Else -> fetched_at + refresh_interval_hours
UPDATE "Page"
SET "next_fetch_at" = CASE
  WHEN "next_fetch_at" IS NOT NULL THEN "next_fetch_at"
  WHEN "fetched_at" IS NULL THEN NOW()
  ELSE "fetched_at" + ("refresh_interval_hours" || ' hours')::interval
END
WHERE "site_id" IN (SELECT id FROM "Site" WHERE type = 'external');

CREATE INDEX IF NOT EXISTS "Page_site_id_next_fetch_at_idx"
ON "Page"("site_id", "next_fetch_at");
