import { NextRequest, NextResponse } from "next/server";
import { parse } from "url";
import { put } from "@vercel/blob";

// Допустимые MIME-типы (на основании ТЗ)
const ALLOWED_MIME_TYPES = [
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "audio/mpeg", "audio/ogg", "audio/wav",
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain"
];
const MAX_FILE_SIZE_BYTES = 4.5 * 1024 * 1024; // 4.5MB
const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 дней по умолчанию

export async function POST(req: NextRequest) {
  try {
    const { fileName, mimeType, fileSizeBytes } = await req.json();

    // Проверка полей
    if (!fileName || typeof fileName !== "string") {
      return NextResponse.json({ error: "Missing or invalid fileName" }, { status: 400 });
    }
    if (!mimeType || typeof mimeType !== "string" || !ALLOWED_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json({ error: "MimeType not allowed" }, { status: 400 });
    }
    if (!fileSizeBytes || typeof fileSizeBytes !== "number" || fileSizeBytes > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: "File too large" }, { status: 400 });
    }

    // Генерация upload токена через @vercel/blob SDK
    // put() сам хранит файл, поэтому здесь только эмуляция: используем generateUploadUrl
    // В Vercel Blob v2 upload делается через runtime API, пример:
    // const { url, blob } = await put(fileName, file, { access: "public", contentType: mimeType, addRandomSuffix: true, token });
    // Но для получения signed uploadUrl надо использовать REST API (fetch) или custom logic (см. https://vercel.com/docs/storage/vercel-blob/direct-upload)
    
    // Так как SDK put() vs REST upload разный:
    // Здесь client ожидает url + ключ; придётся эмулировать выдачу URL (иначе использовать REST-обёртку)
    return NextResponse.json({
      error: "Not implemented: Для поддержки прямого upload используйте REST API / direct upload через generateUploadUrl по документации Vercel."
    }, { status: 501 });
  } catch (err) {
    return NextResponse.json({ error: "Server error", detail: String(err) }, { status: 500 });
  }
}
