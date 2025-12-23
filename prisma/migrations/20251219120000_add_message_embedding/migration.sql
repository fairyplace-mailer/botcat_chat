-- CreateTable
CREATE TABLE "MessageEmbedding" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "vector" JSONB NOT NULL,
    "dims" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageEmbedding_message_id_key" ON "MessageEmbedding"("message_id");

-- CreateIndex
CREATE INDEX "MessageEmbedding_created_at_idx" ON "MessageEmbedding"("created_at");

-- AddForeignKey
ALTER TABLE "MessageEmbedding" ADD CONSTRAINT "MessageEmbedding_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "Message"("message_id") ON DELETE CASCADE ON UPDATE CASCADE;
