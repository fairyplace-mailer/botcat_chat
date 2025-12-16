// src/lib/botcat-final-json.ts

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  BotCatAttachmentSchema,
  BotCatAttachment,
} from "@/lib/botcat-attachment";

/**
 * Zod-схемы под итоговый JSON BotCat → backend.
 *
 * ВАЖНО: структура должна строго соответствовать актуальному ТЗ (docs/spec.md).
 */

// --- Базовые под-схемы ---

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
  contentTranslated_md: z.string(),
  language: z.string().min(2).max(5), // "ru" и пр.
});

export type BotCatTranslatedMessage = z.infer<typeof BotCatTranslatedMessageSchema>;

// --- Итоговый JSON ---

export const BotCatFinalJsonSchema = z.object({
  languageOriginal: z.string().min(2).max(5),

  messages: z.array(BotCatMessageSchema),

  translatedMessages: z.array(BotCatTranslatedMessageSchema),

  attachments: z.array(BotCatAttachmentSchema),

  preamble_md: z.string(),
  footerInternal_md: z.string(),
  footerClient_md: z.string(),

  sendToInternal: z.boolean(),
});

export type BotCatFinalJson = z.infer<typeof BotCatFinalJsonSchema>;

// --- Опции сборки финального JSON ---

export type BuildFinalJsonOptions = {
  preamble_md?: string;
  footerInternal_md?: string;
  footerClient_md?: string;
};

/**
 * Сборка итогового JSON по chatName из БД.
 *
 * Примечание: chatName используется только как ключ выборки, но НЕ входит в итоговый JSON.
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

  // messages[]
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

  // translatedMessages[]
  const translatedMessages: BotCatTranslatedMessage[] = (conversation.messages as any[]).map(
    (m) => {
      const translatedText = m.content_translated_md ?? m.content_original_md ?? "";

      return {
        messageId: m.message_id,
        contentTranslated_md: translatedText,
        language: "ru",
      };
    }
  );

  // attachments[]
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
    languageOriginal,

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
