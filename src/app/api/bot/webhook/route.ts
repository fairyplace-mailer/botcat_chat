import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/server/db";
import {
  mapBotCatAttachmentsArrayToDb,
  BotCatAttachmentJson,
} from "@/server/attachments/blob-mapper";
import { buildFinalJsonByChatName } from "@/lib/botcat-final-json";
import { buildTranscriptHtml } from "@/lib/transcript-html";
import { buildPdfFromHtml } from "@/lib/transcript-pdf";
import { uploadPdfToDrive } from "@/lib/google/drive";
import { sendTranscriptEmail } from "@/lib/email-sender";
import { generateWebpPreviewFromBlobUrl } from "@/server/attachments/preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BotCatMessageJson {
  messageId: string;
  role: "User" | "BotCat";
  contentOriginal_md: string;
  hasAttachments: boolean;
  hasLinks: boolean;
  isVoice: boolean;
  createdAt: string;
}

interface BotCatTranslatedMessageJson {
  messageId: string;
  role: "User" | "BotCat";
  contentTranslated_md: string;
}

interface BotCatFinalJsonIncoming {
  schemaVersion?: string | null;
  chatName: string;
  languageOriginal: string;
  messages: BotCatMessageJson[];
  translatedMessages: BotCatTranslatedMessageJson[];
  attachments: BotCatAttachmentJson[] | null | undefined;
  preamble_md: string;
  footerInternal_md: string;
  footerClient_md: string;
  sendToInternal: boolean;
}

function parseIsoDate(value: string, fieldName: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ISO date in field \"${fieldName}\": ${value}`);
  }
  return d;
}

function addDays(base: Date, days: number): Date {
  const msPerDay = 24 * 60 * 60 * 1000;
  return new Date(base.getTime() + days * msPerDay);
}

type ConversationMeta = {
  staticHtmlBlobUrl?: string;
  staticHtmlExpiresAt?: string;
  internalPdfDriveFileId?: string;
  publicHtmlBlobUrl?: string;
  publicHtmlExpiresAt?: string;
  publicPdfDriveFileId?: string;
};

function buildTranslatedMap(translatedMessages: BotCatTranslatedMessageJson[]) {
  const map = new Map<string, BotCatTranslatedMessageJson>();
  for (const tm of translatedMessages ?? []) {
    if (tm && typeof tm.messageId === "string" && tm.messageId.trim()) {
      map.set(tm.messageId, tm);
    }
  }
  return map;
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

  const toGenerate = attachments.filter(
    (a: { blob_url_original: string | null; blob_url_preview: string | null }) =>
      !!a.blob_url_original && !a.blob_url_preview
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
        // previews follow the same retention as originals
        expires_at: addDays(params.receivedAt, 30),
      },
    });
  }
}

export async function POST(req: NextRequest) {
  const receivedAt = new Date();
  let rawPayload: unknown = null;
  let conversationId: string | null = null;

  try {
    const expectedSecret = process.env.BOTCAT_WEBHOOK_SECRET;
    if (expectedSecret) {
      const headerSecret = req.headers.get("x-botcat-secret");
      if (!headerSecret || headerSecret !== expectedSecret) {
        return NextResponse.json(
          { ok: false, error: "Unauthorized: invalid X-Botcat-Secret" },
          { status: 401 }
        );
      }
    }

    rawPayload = await req.json();
    const payload = rawPayload as BotCatFinalJsonIncoming;

    if (!payload || typeof payload !== "object") {
      return NextResponse.json(
        { ok: false, error: "ValidationError: payload must be an object" },
        { status: 400 }
      );
    }

    if (!payload.chatName || typeof payload.chatName !== "string") {
      return NextResponse.json(
        { ok: false, error: 'ValidationError: "chatName" is required string' },
        { status: 400 }
      );
    }

    if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'ValidationError: "messages" must be non-empty array',
        },
        { status: 400 }
      );
    }

    const sortedMessages = [...payload.messages].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    );
    const startedAt = parseIsoDate(
      sortedMessages[0].createdAt,
      "messages[0].createdAt"
    );
    const finishedAt = parseIsoDate(
      sortedMessages[sortedMessages.length - 1].createdAt,
      "messages[last].createdAt"
    );

    const conversation = await prisma.conversation.upsert({
      where: {
        chat_name: payload.chatName,
      },
      create: {
        chat_name: payload.chatName,
        user_id: null,
        status: "closed",
        language_original: payload.languageOriginal,
        send_to_internal: payload.sendToInternal,
        started_at: startedAt,
        finished_at: finishedAt,
        last_activity_at: finishedAt,
        message_count: payload.messages.length,
      },
      update: {
        status: "closed",
        language_original: payload.languageOriginal,
        send_to_internal: payload.sendToInternal,
        finished_at: finishedAt,
        last_activity_at: finishedAt,
        message_count: payload.messages.length,
      },
    });

    conversationId = conversation.id;

    const translatedById = buildTranslatedMap(payload.translatedMessages ?? []);

    const messagesData = payload.messages.map((msg, index) => {
      const translated = translatedById.get(msg.messageId);

      return {
        conversation_id: conversation.id,
        message_id: msg.messageId,
        role: msg.role,
        content_original_md: msg.contentOriginal_md,
        content_translated_md: translated?.contentTranslated_md ?? null,
        has_attachments: msg.hasAttachments,
        has_links: msg.hasLinks,
        is_voice: msg.isVoice,
        created_at: parseIsoDate(
          msg.createdAt,
          `messages[${index}].createdAt`
        ),
        sequence: index + 1,
      };
    });

    if (messagesData.length > 0) {
      await prisma.message.createMany({
        data: messagesData,
        skipDuplicates: true,
      });
    }

    const attachmentsData = mapBotCatAttachmentsArrayToDb({
      attachments: payload.attachments,
      conversationId: conversation.id,
      now: receivedAt,
    });

    if (attachmentsData.length > 0) {
      await prisma.attachment.createMany({
        data: attachmentsData,
      });
    }

    // Mandatory: generate image previews for transcript artifacts
    await ensureImagePreviews({
      conversationId: conversation.id,
      receivedAt,
    });

    /**
     * [post-processing]
     */
    try {
      const finalJson = await buildFinalJsonByChatName(payload.chatName);

      // 1) Generate HTML transcripts and publish to Blob
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

      // 2) Generate PDFs from HTML (Drive only)
      const [internalPdfBytes, publicPdfBytes] = await Promise.all([
        buildPdfFromHtml(htmlInternal),
        buildPdfFromHtml(htmlPublic),
      ]);

      const [internalDriveResult, publicDriveResult] = await Promise.all([
        uploadPdfToDrive({
          fileName: `${payload.chatName}.pdf`,
          pdfBuffer: Buffer.from(internalPdfBytes),
        }),
        uploadPdfToDrive({
          fileName: `${payload.chatName}.public.pdf`,
          pdfBuffer: Buffer.from(publicPdfBytes),
        }),
      ]);

      // Persist published URLs into Conversation.meta
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

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { meta: nextMeta as any },
      });

      if (finalJson.sendToInternal) {
        const internalTo =
          process.env.MAIL_TO_INTERNAL?.trim() || "fairyplace.tm@gmail.com";

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
    } catch (postProcessError: any) {
      throw new Error(
        `Post-processing failed (Blob/PDF/Drive/EmailLog/Resend): ${
          postProcessError?.message ?? String(postProcessError)
        }`
      );
    }

    await prisma.webhookLog.create({
      data: {
        conversation_id: conversation.id,
        payload: rawPayload as any,
        status_code: 200,
        error_message: null,
      },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
        ? error
        : "Unknown error";

    console.error("[Webhook] Error in /api/bot/webhook:", error);

    try {
      await prisma.webhookLog.create({
        data: {
          conversation_id: conversationId,
          payload: rawPayload as any,
          status_code: 500,
          error_message: message,
        },
      });
    } catch (logError) {
      console.error("[Webhook] Failed to write webhookLog:", logError);
    }

    return NextResponse.json(
      {
        ok: false,
        error: `InternalError: ${message}`,
      },
      { status: 500 }
    );
  }
}
