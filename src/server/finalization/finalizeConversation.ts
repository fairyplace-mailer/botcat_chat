import { put } from "@vercel/blob";
import { prisma } from "@/server/db";
import { buildFinalJsonByChatName } from "@/lib/botcat-final-json";
import { buildTranscriptHtml } from "@/lib/transcript-html";
import { buildPdfFromHtml } from "@/lib/transcript-pdf";
import { uploadPdfToDrive } from "@/lib/google/drive";
import { sendTranscriptEmail } from "@/lib/email-sender";
import { generateWebpPreviewFromBlobUrl } from "@/server/attachments/preview";
import { translateMessagesToRu } from "@/lib/translator";

type ConversationMeta = {
  staticHtmlBlobUrl?: string;
  staticHtmlExpiresAt?: string;
  internalPdfDriveFileId?: string;
  publicHtmlBlobUrl?: string;
  publicHtmlExpiresAt?: string;
  publicPdfDriveFileId?: string;
};

type AttachmentPreviewCandidate = {
  id: string;
  blob_url_original: string | null;
  blob_url_preview: string | null;
};

function addDays(base: Date, days: number): Date {
  const msPerDay = 24 * 60 * 60 * 1000;
  return new Date(base.getTime() + days * msPerDay);
}

async function ensureImagePreviews(params: {
  conversationId: string;
  receivedAt: Date;
}) {
  const attachments = await prisma.attachment.findMany({
    where: {
      conversation_id: params.conversationId,
      mime_type: { startsWith: "image/" },
      deleted_at: null,
    },
    select: {
      id: true,
      blob_url_original: true,
      blob_url_preview: true,
    },
  });

  const toGenerate = (attachments as AttachmentPreviewCandidate[]).filter(
    (a: AttachmentPreviewCandidate) => !!a.blob_url_original && !a.blob_url_preview
  );

  for (const att of toGenerate) {
    const originalUrl = att.blob_url_original;
    if (!originalUrl) continue;

    const preview = await generateWebpPreviewFromBlobUrl({
      blobUrlOriginal: originalUrl,
    });

    const previewBlob = await put(
      `previews/${params.conversationId}/${att.id}.webp`,
      preview.buffer,
      {
        access: "public",
        contentType: preview.contentType,
        addRandomSuffix: true,
      }
    );

    await prisma.attachment.update({
      where: { id: att.id },
      data: {
        blob_url_preview: previewBlob.url,
        expires_at: addDays(params.receivedAt, 30),
      },
    });
  }
}

async function ensureTranslatedMessagesInDb(params: {
  chatName: string;
}): Promise<void> {
  const convo = await prisma.conversation.findUnique({
    where: { chat_name: params.chatName },
    select: {
      id: true,
      language_original: true,
      messages: {
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          message_id: true,
          role: true,
          content_original_md: true,
          content_translated_md: true,
        },
      },
    },
  });

  if (!convo) return;

  const languageOriginal = String(convo.language_original).trim();

  // Only fill missing translations; do not overwrite existing.
  const missing = convo.messages.filter((m) => m.content_translated_md == null);
  if (missing.length === 0) return;

  // TZ: if languageOriginal==ru, translatedMessages must equal original for all messageId.
  // We only fill missing, but the resulting set is still complete.
  if (languageOriginal === "ru") {
    await prisma.$transaction(
      missing.map((m) =>
        prisma.message.update({
          where: { id: m.id },
          data: { content_translated_md: m.content_original_md },
        })
      )
    );
    return;
  }

  // Translate missing messages to RU.
  const translated = await translateMessagesToRu({
    languageOriginal,
    messages: missing.map((m) => ({
      messageId: m.message_id,
      role: m.role as "User" | "BotCat",
      contentOriginal_md: m.content_original_md,
    })),
  });

  const byMessageId = new Map(translated.map((t) => [t.messageId, t] as const));

  await prisma.$transaction(
    missing.map((m) => {
      const t = byMessageId.get(m.message_id);
      if (!t) {
        // Hard fail: per TZ translatedMessages must be complete.
        throw new Error(
          `ensureTranslatedMessagesInDb: missing translation for message_id=${m.message_id}`
        );
      }

      return prisma.message.update({
        where: { id: m.id },
        data: { content_translated_md: t.contentTranslated_md },
      });
    })
  );
}

export async function finalizeConversationByChatName(params: {
  chatName: string;
  reason: string;
}): Promise<{ ok: true; status: "finalized" | "noop" }> {
  const receivedAt = new Date();

  const conversation = await prisma.conversation.findUnique({
    where: { chat_name: params.chatName },
    select: { id: true, status: true, send_to_internal: true, meta: true },
  });

  if (!conversation) {
    // Nothing to finalize.
    return { ok: true, status: "noop" };
  }

  if (conversation.status === "closed") {
    return { ok: true, status: "noop" };
  }

  // Mandatory: generate previews before building HTML/PDF.
  await ensureImagePreviews({
    conversationId: conversation.id,
    receivedAt,
  });

  // TZ (docs/spec.md + docs/spec_initial.md): internal transcript must be RU.
  // Ensure translatedMessages (content_translated_md) exist in DB before building artifacts.
  await ensureTranslatedMessagesInDb({ chatName: params.chatName });

  const finalJson = await buildFinalJsonByChatName(params.chatName);

  // 1) Generate HTML transcripts
  const htmlInternal = buildTranscriptHtml(finalJson, "internal");
  const htmlPublic = buildTranscriptHtml(finalJson, "public");

  const [internalBlob, publicBlob] = await Promise.all([
    put(`transcripts/internal/${finalJson.chatName}.html`, htmlInternal, {
      access: "public",
      contentType: "text/html; charset=utf-8",
      addRandomSuffix: true,
    }),
    put(`transcripts/public/${finalJson.chatName}.html`, htmlPublic, {
      access: "public",
      contentType: "text/html; charset=utf-8",
      addRandomSuffix: true,
    }),
  ]);

  // 2) Generate PDFs from HTML and upload to Drive (Drive only)
  const [internalPdfBytes, publicPdfBytes] = await Promise.all([
    buildPdfFromHtml(htmlInternal),
    buildPdfFromHtml(htmlPublic),
  ]);

  const [internalDriveResult, publicDriveResult] = await Promise.all([
    uploadPdfToDrive({
      fileName: `${finalJson.chatName}.pdf`,
      pdfBuffer: Buffer.from(internalPdfBytes),
    }),
    uploadPdfToDrive({
      fileName: `${finalJson.chatName}.public.pdf`,
      pdfBuffer: Buffer.from(publicPdfBytes),
    }),
  ]);

  // 3) Persist meta (30 days)
  const prevMeta = (conversation.meta ?? {}) as ConversationMeta;
  const expiresAtIso = addDays(receivedAt, 30).toISOString();

  const nextMeta: ConversationMeta = {
    ...prevMeta,
    staticHtmlBlobUrl: internalBlob.url,
    staticHtmlExpiresAt: expiresAtIso,
    internalPdfDriveFileId: internalDriveResult.fileId,
    publicHtmlBlobUrl: publicBlob.url,
    publicHtmlExpiresAt: expiresAtIso,
    publicPdfDriveFileId: publicDriveResult.fileId,
  };

  // 4) Mark conversation closed
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      status: "closed",
      finished_at: receivedAt,
      meta: nextMeta as any,
    },
  });

  // 5) Send internal email (if enabled)
  if (finalJson.sendToInternal && conversation.send_to_internal) {
    const internalTo = process.env.MAIL_TO_INTERNAL?.trim() || "fairyplace.tm@gmail.com";

    try {
      const sendResult = await sendTranscriptEmail({
        to: internalTo,
        finalJson,
      });

      await prisma.emailLog.create({
        data: {
          conversation_id: conversation.id,
          recipient_email: internalTo,
          subject: `BotCat Transcript: ${finalJson.chatName}`,
          status: "sent",
          provider_message_id: sendResult.id,
          error_message: null,
        },
      });
    } catch (sendError: any) {
      const msg =
        sendError instanceof Error
          ? sendError.message
          : typeof sendError === "string"
          ? sendError
          : "Unknown send error";

      await prisma.emailLog.create({
        data: {
          conversation_id: conversation.id,
          recipient_email: internalTo,
          subject: `BotCat Transcript: ${finalJson.chatName}`,
          status: "failed",
          provider_message_id: null,
          error_message: msg,
        },
      });
    }
  }

  // Optional: store a lightweight audit marker in meta
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      meta: {
        ...(nextMeta as any),
        finalizedBy: params.reason,
        finalizedAt: receivedAt.toISOString(),
      },
    },
  });

  return { ok: true, status: "finalized" };
}
