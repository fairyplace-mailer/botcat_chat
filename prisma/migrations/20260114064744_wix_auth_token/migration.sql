-- Add meta to Site
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "meta" JSONB;

-- Create WixAuthToken table
CREATE TABLE IF NOT EXISTS "WixAuthToken" (
  "site_id" TEXT NOT NULL,
  "access_token" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WixAuthToken_pkey" PRIMARY KEY ("site_id"),
  CONSTRAINT "WixAuthToken_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "WixAuthToken_expires_at_idx" ON "WixAuthToken"("expires_at");
