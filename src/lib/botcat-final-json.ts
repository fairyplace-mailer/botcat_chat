// src/lib/botcat-final-json.ts

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  BotCatAttachmentSchema,
  BotCatAttachment,
} from "@/lib/botcat-attachment";

/**
 * Zod-   BotCat  backend.
 *
 * :      (docs/spec.md).
 */

// --- - ---

export const BotCatMessageRoleSchema = z.enum(["User", "BotCat"]);

export const BotCatMessageSchema = z.object({
  messageId: z.string().min(1),
  role: BotCatMessageRoleSchema,
  contentOriginal_md: z.string(),
  hasAttachments: z.boolean(),
  hasLinks: z.boolean(),
  isVoice: z.boolean(),
  createdAt: z.string().datetime(), // ISO 8601
});

export type BotCatMessage = z.infer<typeof BotCatMessageSchema>;

export const BotCatTranslatedMessageSchema = z.object({
  messageId: z.string().min(1),
  role: BotCatMessageRoleSchema,
  contentTranslated_md: z.string(),
});

export type BotCatTranslatedMessage = z.infer<typeof BotCatTranslatedMessageSchema>;

// ---  JSON ---

export const BotCatFinalJsonSchema = z.object({
  // IMPORTANT: chatName        /.
  chatName: z.string().min(1),

  languageOriginal: z.string().min(2).max(5),
  // Per MANDATORY: language is always "ru" (language of translatedMessages).
  language: z.literal("ru"),

  messages: z.array(BotCatMessageSchema),
  translatedMessages: z.array(BotCatTranslatedMessageSchema),
  attachments: z.array(BotCatAttachmentSchema),

  preamble_md: z.string(),
  footerInternal_md: z.string(),
  footerClient_md: z.string(),

  sendToInternal: z.boolean(),
});

export type BotCatFinalJson = z.infer<typeof BotCatFinalJsonSchema>;

// ---    JSON ---

export type BuildFinalJsonOptions = {
  preamble_md?: string;
  footerInternal_md?: string;
  footerClient_md?: string;
};

/**
 *   JSON  chatName  .
 */
export async function buildFinalJsonByChatName(
  chatName: string,
  options: BuildFinalJsonOptions = {}
): Promise<BotCatFinalJson> {
  const conversation = await prisma.conversation.findUnique({
    where: { chat_name: chatName },
    include: {
      messages: {
        orderBy: { sequence: "asc" },
      },
      attachments: true,
    },
  });

  if (!conversation) {
    throw new Error(`Conversation with chatName="${chatName}" not found`);
  }

  const messages: BotCatMessage[] = (conversation.messages as any[]).map((m) => ({
    messageId: m.message_id,
    role: m.role as BotCatMessage["role"],
    contentOriginal_md: m.content_original_md,
    hasAttachments: m.has_attachments,
    hasLinks: m.has_links,
    isVoice: m.is_voice,
    createdAt: m.created_at.toISOString(),
  }));

  const languageOriginal =
    (conversation.language_original || "und").trim() || "und";

  const translatedMessages: BotCatTranslatedMessage[] = (conversation.messages as any[]).map(
    (m) => {
      const translatedText = m.content_translated_md ?? m.content_original_md ?? "";

      return {
        messageId: m.message_id,
        role: m.role as BotCatMessage["role"],
        contentTranslated_md: translatedText,
      };
    }
  );

  const attachments: BotCatAttachment[] = (conversation.attachments as any[]).map(
    (a) => ({
      attachmentId: a.id,
      messageId: a.message_id,
      kind: a.kind as BotCatAttachment["kind"],

      fileName: a.file_name,
      mimeType: a.mime_type,
      fileSizeBytes: typeof a.file_size_bytes === "number" ? a.file_size_bytes : null,
      pageCount: typeof a.page_count === "number" ? a.page_count : null,

      originalUrl: a.external_url,
      blobUrlOriginal: a.blob_url_original,
      blobUrlPreview: a.blob_url_preview,
    })
  );

  const preamble_md = options.preamble_md ?? "";
  const footerInternal_md = options.footerInternal_md ?? "";
  const footerClient_md = options.footerClient_md ?? "";
  const sendToInternal = conversation.send_to_internal;

  const draft: BotCatFinalJson = {
    chatName,

    languageOriginal,
    language: "ru",

    messages,
    translatedMessages,
    attachments,

    preamble_md,
    footerInternal_md,
    footerClient_md,

    sendToInternal,
  };

  return draft;
}
