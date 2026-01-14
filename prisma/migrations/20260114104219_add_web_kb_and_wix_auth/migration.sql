-- CreateEnum
CREATE TYPE "SiteType" AS ENUM ('wix', 'external');

-- CreateEnum
CREATE TYPE "ContentSource" AS ENUM ('cms', 'page');

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "type" "SiteType" NOT NULL,
    "wix_site_id" TEXT,
    "wix_instance_id" TEXT,
    "meta" JSONB,
    "primary_language" TEXT NOT NULL DEFAULT 'en',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WixAuthToken" (
    "site_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WixAuthToken_pkey" PRIMARY KEY ("site_id")
);

-- CreateTable
CREATE TABLE "Page" (
    "id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "source" "ContentSource" NOT NULL,
    "fetched_at" TIMESTAMP(3),
    "canonical_url" TEXT,
    "http_status" INTEGER,
    "excluded_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "source" "ContentSource" NOT NULL,
    "embedding_model" TEXT,
    "vector" JSONB,
    "dims" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Image" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt_text" TEXT,
    "source" "ContentSource" NOT NULL,

    CONSTRAINT "Image_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Site_domain_key" ON "Site"("domain");

-- CreateIndex
CREATE INDEX "Site_type_idx" ON "Site"("type");

-- CreateIndex
CREATE INDEX "Site_created_at_idx" ON "Site"("created_at");

-- CreateIndex
CREATE INDEX "WixAuthToken_expires_at_idx" ON "WixAuthToken"("expires_at");

-- CreateIndex
CREATE INDEX "Page_site_id_fetched_at_idx" ON "Page"("site_id", "fetched_at");

-- CreateIndex
CREATE INDEX "Page_site_id_http_status_idx" ON "Page"("site_id", "http_status");

-- CreateIndex
CREATE INDEX "Page_created_at_idx" ON "Page"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "Page_site_id_url_key" ON "Page"("site_id", "url");

-- CreateIndex
CREATE INDEX "Section_page_id_idx" ON "Section"("page_id");

-- CreateIndex
CREATE INDEX "Section_created_at_idx" ON "Section"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "Section_page_id_content_hash_key" ON "Section"("page_id", "content_hash");

-- CreateIndex
CREATE INDEX "Image_page_id_idx" ON "Image"("page_id");

-- AddForeignKey
ALTER TABLE "WixAuthToken" ADD CONSTRAINT "WixAuthToken_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
