-- CreateTable
CREATE TABLE "WebSeedCursor" (
    "source_id" TEXT NOT NULL,
    "queue" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebSeedCursor_pkey" PRIMARY KEY ("source_id")
);
