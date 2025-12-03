-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('active', 'closed');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('user_upload', 'bot_generated', 'external_url');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('queued', 'sent', 'failed');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "chat_name" TEXT NOT NULL,
    "user_id" TEXT,
    "status" "ConversationStatus" NOT NULL,
    "language_original" TEXT NOT NULL,
    "send_to_internal" BOOLEAN NOT NULL DEFAULT true,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "last_activity_at" TIMESTAMP(3) NOT NULL,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "meta" JSONB,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content_original_md" TEXT NOT NULL,
    "content_translated_md" TEXT,
    "has_attachments" BOOLEAN NOT NULL DEFAULT false,
    "has_links" BOOLEAN NOT NULL DEFAULT false,
    "is_voice" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "file_name" TEXT,
    "mime_type" TEXT,
    "file_size_bytes" INTEGER,
    "page_count" INTEGER,
    "blob_key_original" TEXT,
    "blob_url_original" TEXT,
    "blob_url_preview" TEXT,
    "external_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL,
    "provider_message_id" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookLog" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "payload" JSONB NOT NULL,
    "status_code" INTEGER NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyStats" (
    "date" TIMESTAMP(3) NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'web',
    "total_conversations" INTEGER NOT NULL DEFAULT 0,
    "total_messages" INTEGER NOT NULL DEFAULT 0,
    "total_attachments" INTEGER NOT NULL DEFAULT 0,
    "total_emails_sent" INTEGER NOT NULL DEFAULT 0,
    "total_tokens_prompt" BIGINT NOT NULL DEFAULT 0,
    "total_tokens_completion" BIGINT NOT NULL DEFAULT 0,
    "total_tokens_total" BIGINT NOT NULL DEFAULT 0,
    "total_uploaded_bytes" BIGINT NOT NULL DEFAULT 0,
    "total_blob_files" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyStats_pkey" PRIMARY KEY ("date","channel")
);

-- CreateTable
CREATE TABLE "CronLock" (
    "name" TEXT NOT NULL,
    "locked_at" TIMESTAMP(3) NOT NULL,
    "locked_until" TIMESTAMP(3) NOT NULL,
    "meta" JSONB,

    CONSTRAINT "CronLock_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "CleanupLog" (
    "id" TEXT NOT NULL,
    "task_name" TEXT NOT NULL,
    "run_started_at" TIMESTAMP(3) NOT NULL,
    "run_finished_at" TIMESTAMP(3),
    "deleted_attachments_count" INTEGER NOT NULL DEFAULT 0,
    "deleted_conversations_count" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,

    CONSTRAINT "CleanupLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_chat_name_key" ON "Conversation"("chat_name");

-- CreateIndex
CREATE INDEX "Conversation_user_id_started_at_idx" ON "Conversation"("user_id", "started_at");

-- CreateIndex
CREATE INDEX "Conversation_status_last_activity_at_idx" ON "Conversation"("status", "last_activity_at");

-- CreateIndex
CREATE UNIQUE INDEX "Message_message_id_key" ON "Message"("message_id");

-- CreateIndex
CREATE INDEX "Message_conversation_id_sequence_idx" ON "Message"("conversation_id", "sequence");

-- CreateIndex
CREATE INDEX "Message_conversation_id_created_at_idx" ON "Message"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "Attachment_conversation_id_idx" ON "Attachment"("conversation_id");

-- CreateIndex
CREATE INDEX "Attachment_message_id_idx" ON "Attachment"("message_id");

-- CreateIndex
CREATE INDEX "Attachment_expires_at_idx" ON "Attachment"("expires_at");

-- CreateIndex
CREATE INDEX "Attachment_kind_created_at_idx" ON "Attachment"("kind", "created_at");

-- CreateIndex
CREATE INDEX "EmailLog_conversation_id_created_at_idx" ON "EmailLog"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "EmailLog_status_created_at_idx" ON "EmailLog"("status", "created_at");

-- CreateIndex
CREATE INDEX "WebhookLog_conversation_id_created_at_idx" ON "WebhookLog"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "DailyStats_date_idx" ON "DailyStats"("date");

-- CreateIndex
CREATE INDEX "CleanupLog_task_name_run_started_at_idx" ON "CleanupLog"("task_name", "run_started_at");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "Message"("message_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookLog" ADD CONSTRAINT "WebhookLog_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
