-- CreateTable
CREATE TABLE "ReferenceDoc" (
    "id" TEXT NOT NULL,
    "source_path" TEXT NOT NULL,
    "title" TEXT,
    "source_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferenceDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferenceChunk" (
    "id" TEXT NOT NULL,
    "doc_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content_md" TEXT NOT NULL,
    "token_estimate" INTEGER,
    "embedding_model" TEXT NOT NULL,
    "vector" JSONB NOT NULL,
    "dims" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferenceChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceDoc_source_path_key" ON "ReferenceDoc"("source_path");

-- CreateIndex
CREATE INDEX "ReferenceDoc_created_at_idx" ON "ReferenceDoc"("created_at");

-- CreateIndex
CREATE INDEX "ReferenceChunk_doc_id_idx" ON "ReferenceChunk"("doc_id");

-- CreateIndex
CREATE INDEX "ReferenceChunk_created_at_idx" ON "ReferenceChunk"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceChunk_doc_id_chunk_index_key" ON "ReferenceChunk"("doc_id", "chunk_index");

-- AddForeignKey
ALTER TABLE "ReferenceChunk" ADD CONSTRAINT "ReferenceChunk_doc_id_fkey" FOREIGN KEY ("doc_id") REFERENCES "ReferenceDoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
