import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import {
  mapBotCatAttachmentsArrayToDb,
  BotCatAttachmentJson,
} from "@/server/attachments/blob-mapper";
import { buildFinalJsonByChatName } from "@/lib/botcat-final-json";
import { buildTranscriptPdf } from "@/lib/transcript-pdf";
import { uploadPdfToDrive } from "@/lib/google/drive";
import { sendTranscriptEmail } from "@/lib/email-sender";

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
  contentTranslated_md: string;
  language: string;
}

interface BotCatFinalJsonIncoming {
  schemaVersion?: string | null;
  chatName: string;
  languageOriginal: string;
  messages: BotCatMessageJson[];
  translatedMessages: Record<string, BotCatTranslatedMessageJson | undefined>;
  attachments: BotCatAttachmentJson[] | null | undefined;
  preamble_md: string;
  footerInternal_md: string;
  footerClient_md: string;
  sendToInternal: boolean;
  userEmails?: string[] | null;
}

function parseIsoDate(value: string, fieldName: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ISO date in field "${fieldName}": ${value}`);
  }
  return d;
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

    const messagesData = payload.messages.map((msg, index) => {
      const translated = payload.translatedMessages?.[msg.messageId];

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

    /**
     * Пост-обработка:
     * - финальный JSON из БД,
     * - генерация PDF,
     * - загрузка PDF в Google Drive,
     * - рассылка писем через Resend,
     * - запись EmailLog со статусами sent/failed.
     */
    try {
      const finalJson = await buildFinalJsonByChatName(payload.chatName);

      const pdfBytes = await buildTranscriptPdf(finalJson);
      const pdfBuffer = Buffer.from(pdfBytes);

      const driveResult = await uploadPdfToDrive({
        fileName: `${payload.chatName}.pdf`,
        pdfBuffer,
      });

      type EmailJob = {
        kind: "internal" | "client";
        to: string;
        subject: string;
      };

      const emailJobs: EmailJob[] = [];

      // Внутреннее письмо — если sendToInternal = true
      if (finalJson.sendToInternal) {
        const internalTo =
          process.env.MAIL_TO_INTERNAL?.trim() || "fairyplace.tm@gmail.com";

        emailJobs.push({
          kind: "internal",
          to: internalTo,
          subject: `BotCat Transcript: ${finalJson.chatName}`,
        });
      }

      // Письма клиенту — если BotCat передал userEmails[]
      const userEmails = Array.isArray(payload.userEmails)
        ? payload.userEmails.filter(
            (e): e is string => typeof e === "string" && e.trim().length > 0
          )
        : [];

      for (const email of userEmails) {
        emailJobs.push({
          kind: "client",
          to: email.trim(),
          subject: `Your BotCat Transcript: ${finalJson.chatName}`,
        });
      }

      for (const job of emailJobs) {
        try {
          const sendResult = await sendTranscriptEmail({
            kind: job.kind,
            to: job.to,
            finalJson,
            drive: driveResult,
          });

          await prisma.emailLog.create({
            data: {
              conversation_id: conversation.id,
              recipient_email: job.to,
              subject: job.subject,
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
              recipient_email: job.to,
              subject: job.subject,
              status: "failed",
              provider_message_id: null,
              error_message: msg,
            },
          });
        }
      }
    } catch (postProcessError: any) {
      throw new Error(
        `Post-processing failed (PDF/Drive/EmailLog/Resend): ${
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
