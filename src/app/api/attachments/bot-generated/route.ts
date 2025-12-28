import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { generateWebpPreviewFromBlobUrl } from "@/server/attachments/preview";

function normalizeChatName(chatName: unknown): string | null {
  if (typeof chatName !== "string") return null;
  const t = chatName.trim();
  if (!t) return null;
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(t)) return null;
  return t;
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const chatName = normalizeChatName(body?.chatName);
  const messageId = typeof body?.messageId === "string" ? body.messageId : null;
  const fileName = typeof body?.fileName === "string" ? body.fileName : null;
  const mimeType = typeof body?.mimeType === "string" ? body.mimeType : null;
  const fileSizeBytes =
    typeof body?.fileSizeBytes === "number" ? body.fileSizeBytes : null;
  const blobUrlOriginal =
    typeof body?.blobUrlOriginal === "string" ? body.blobUrlOriginal : null;

  if (!chatName || !messageId || !blobUrlOriginal) {
    return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
  }

  const conversation = await prisma.conversation.findUnique({
    where: { chat_name: chatName },
    select: { id: true },
  });

  if (!conversation) {
    return NextResponse.json(
      { ok: false, error: "Conversation not found" },
      { status: 404 }
    );
  }

  const now = new Date();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  // Ensure the referenced message exists to satisfy FK Attachment_message_id_fkey.
  // We keep content minimal; the UI owns the visible transcript.
  const last = await prisma.message.findFirst({
    where: { conversation_id: conversation.id },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });
  const nextSeq = (last?.sequence ?? 0) + 1;

  await prisma.message.upsert({
    where: { message_id: messageId },
    create: {
      conversation_id: conversation.id,
      message_id: messageId,
      role: "BotCat",
      content_original_md: "(bot generated image)",
      content_translated_md: null,
      has_attachments: true,
      has_links: false,
      is_voice: false,
      created_at: now,
      sequence: nextSeq,
    },
    update: {
      has_attachments: true,
    },
  });

  const created = await prisma.attachment.create({
    data: {
      conversation_id: conversation.id,
      message_id: messageId,
      kind: "bot_generated",
      file_name: fileName,
      mime_type: mimeType,
      file_size_bytes: fileSizeBytes,
      page_count: null,
      external_url: null,
      blob_url_original: blobUrlOriginal,
      blob_url_preview: null,
      expires_at: expiresAt,
      deleted_at: null,
    },
    select: { id: true },
  });

  // TZ: image previews are mandatory. Best-effort: generate preview immediately.
  try {
    const preview = await generateWebpPreviewFromBlobUrl({
      blobUrlOriginal,
    });

    const previewBlob = await put(
      `previews/${conversation.id}/${created.id}.webp`,
      preview.buffer,
      {
        access: "public",
        contentType: preview.contentType,
        addRandomSuffix: true,
      }
    );

    await prisma.attachment.update({
      where: { id: created.id },
      data: {
        blob_url_preview: previewBlob.url,
        expires_at: expiresAt,
      },
    });
  } catch (err: any) {
    // If original image is corrupted, don't fail the whole request.
    // But DO log it (per TZ: structured logs).
    try {
      await prisma.webhookLog.create({
        data: {
          conversation_id: conversation.id,
          payload: {
            type: "bot_generated_preview_failed",
            attachmentId: created.id,
            blobUrlOriginal,
            fileName,
            mimeType,
          },
          status_code: 200,
          error_message: String(err?.message ?? err),
        },
      });
    } catch {
      // avoid cascading failures
    }
  }

  return NextResponse.json({ ok: true });
}
