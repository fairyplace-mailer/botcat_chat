/**
 * Срез attachment из итогового JSON BotCat.
 * Подгоняй под точные поля твоего BotCatFinalJson, если нужно.
 */
export interface BotCatAttachmentJson {
  attachmentId: string;
  messageId: string;
  kind: 'user_upload' | 'bot_generated' | 'external_url';
  fileName?: string | null;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
  pageCount?: number | null;
  originalUrl?: string | null;
  blobUrlOriginal?: string | null;
  blobUrlPreview?: string | null;
}

/**
 * Целевой shape для вставки в таблицу attachments (Prisma).
 * Названия полей в snake_case — как в нашей БД.
 */
export interface AttachmentCreateInput {
  conversation_id: string;
  message_id: string;
  kind: 'user_upload' | 'bot_generated' | 'external_url';
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  page_count: number | null;
  blob_key_original: string | null;
  blob_url_original: string | null;
  blob_url_preview: string | null;
  external_url: string | null;
  created_at: Date;
  expires_at: Date;
}

/**
 * TTL по умолчанию: 30 дней.
 */
const DEFAULT_BLOB_TTL_DAYS = 30;

function addDays(base: Date, days: number): Date {
  const msPerDay = 24 * 60 * 60 * 1000;
  return new Date(base.getTime() + days * msPerDay);
}

/**
 * Извлекает blobKey из URL Vercel Blob.
 *
 * Примеры:
 * - https://xyz.public.blob.vercel-storage.com/uploads/file.png?foo=bar
 *   → uploads/file.png
 * - https://project.vercel.app/api/blob/uploads/file.png?foo=bar
 *   → uploads/file.png
 */
export function extractBlobKeyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const u = new URL(url);

    // Вариант 1: public.blob.vercel-storage.com/<key>
    if (u.hostname.includes('blob.vercel-storage.com')) {
      const key = u.pathname.startsWith('/') ? u.pathname.slice(1) : u.pathname;
      return key || null;
    }

    // Вариант 2: /api/blob/<key>
    const apiBlobPrefix = '/api/blob/';
    const idx = u.pathname.indexOf(apiBlobPrefix);
    if (idx !== -1) {
      const key = u.pathname.slice(idx + apiBlobPrefix.length);
      return key || null;
    }

    // Фоллбэк: просто pathname без ведущего /
    const fallback = u.pathname.startsWith('/') ? u.pathname.slice(1) : u.pathname;
    return fallback || null;
  } catch {
    return null;
  }
}

/**
 * Маппинг одного BotCat attachment → данные для таблицы attachments.
 *
 * Использование:
 *   const now = new Date();
 *   const data = mapBotCatAttachmentToDb({ attachment, conversationId, now });
 *   await prisma.attachment.create({ data });
 */
export function mapBotCatAttachmentToDb(params: {
  attachment: BotCatAttachmentJson;
  conversationId: string;
  now?: Date;
  ttlDays?: number;
}): AttachmentCreateInput {
  const { attachment, conversationId } = params;
  const now = params.now ?? new Date();
  const ttlDays = params.ttlDays ?? DEFAULT_BLOB_TTL_DAYS;

  const expiresAt = addDays(now, ttlDays);
  const blobKeyOriginal = extractBlobKeyFromUrl(attachment.blobUrlOriginal ?? undefined);

  return {
    conversation_id: conversationId,
    message_id: attachment.messageId,
    kind: attachment.kind,
    file_name: attachment.fileName ?? null,
    mime_type: attachment.mimeType ?? null,
    file_size_bytes: attachment.fileSizeBytes ?? null,
    page_count: attachment.pageCount ?? null,
    blob_key_original: blobKeyOriginal,
    blob_url_original: attachment.blobUrlOriginal ?? null,
    blob_url_preview: attachment.blobUrlPreview ?? null,
    external_url: attachment.originalUrl ?? null,
    created_at: now,
    expires_at: expiresAt,
  };
}

/**
 * Удобная обёртка: маппинг целого массива attachments JSON → массив insert-ов.
 */
export function mapBotCatAttachmentsArrayToDb(params: {
  attachments: BotCatAttachmentJson[] | null | undefined;
  conversationId: string;
  now?: Date;
  ttlDays?: number;
}): AttachmentCreateInput[] {
  const { attachments, conversationId, now, ttlDays } = params;
  if (!attachments || attachments.length === 0) return [];

  return attachments.map((att) =>
    mapBotCatAttachmentToDb({ attachment: att, conversationId, now, ttlDays }),
  );
}
