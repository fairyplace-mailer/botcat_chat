// src/lib/botcat-attachment.ts

import { z } from "zod";

/**
 * Типы вложений BotCat → Backend.
 *
 * Эти данные приходят в webhook-пакете, и затем мы маппим их
 * в Prisma-модель Attachment.
 */

export const BotCatAttachmentKindSchema = z.enum([
  "user_upload",     // пользователь загрузил файл
  "bot_generated",   // файл создан BotCat
  "external_url",    // вложение — ссылка
]);

export const BotCatAttachmentSchema = z.object({
  attachmentId: z.string().min(1),  // уникальный ID вложения
  messageId: z.string().min(1),     // к какому сообщению относится
  kind: BotCatAttachmentKindSchema, // см. enum выше

  fileName: z.string().nullable(),       // имя файла
  mimeType: z.string().nullable(),       // MIME тип
  fileSizeBytes: z.number().int().nullable(), // размер или null
  pageCount: z.number().int().nullable(),     // если PDF — количество страниц

  originalUrl: z.string().nullable(),     // исходный URL (если был)
  blobUrlOriginal: z.string().nullable(), // URL blob original
  blobUrlPreview: z.string().nullable(),  // URL preview (если есть)
});

export type BotCatAttachment = z.infer<typeof BotCatAttachmentSchema>;
