import { NextRequest, NextResponse } from "next/server";
import { generateUploadUrl } from "@vercel/blob";

// --- Настройки и лимиты
const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  // Добавить другие разрешённые типы по необходимости
];
const MAX_FILE_SIZE_BYTES = 4.5 * 1024 * 1024; // 4.5MB
const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 дней

export async function POST(req: NextRequest) {
  try {
    const { fileName, mimeType, fileSizeBytes } = await req.json();
    
    // Простая валидация
    if (typeof fileName !== "string" || fileName.length < 2) {
      return NextResponse.json({ error: "Invalid fileName" }, { status: 400 });
    }
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json({ error: "Unsupported mimeType" }, { status: 400 });
    }
    if (
      typeof fileSizeBytes !== "number" ||
      fileSizeBytes <= 0 ||
      fileSizeBytes > MAX_FILE_SIZE_BYTES
    ) {
      return NextResponse.json({ error: "Invalid fileSizeBytes" }, { status: 400 });
    }

    // Генерация uploadUrl/метаданных через Vercel Blob SDK
    const { url: uploadUrl, token, blob } = await generateUploadUrl({
      filename: fileName,
      contentType: mimeType,
      expiresIn: DEFAULT_TTL_SECONDS,
    });

    return NextResponse.json({
      uploadUrl,
      token, // пригодится клиенту для authorization если потребуется
      blobUrl: blob.url,
      blobKey: blob.pathname.replace(/^\//, ""),
      expiresIn: DEFAULT_TTL_SECONDS,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
