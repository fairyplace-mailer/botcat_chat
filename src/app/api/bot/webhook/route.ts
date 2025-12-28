import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import {
  mapBotCatAttachmentsArrayToDb,
  BotCatAttachmentJson,
} from "@/server/attachments/blob-mapper";
import { finalizeConversationByChatName } from "@/server/finalization/finalizeConversation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IncomingRole =
  | "user"
  | "assistant"
  | "User"
  | "BotCat"
  | "system"
  | "tool";

function normalizeIncomingRoleForDb(role: unknown): "User" | "BotCat" {
  const r = typeof role === "string" ? role : "";
  if (r === "user" || r === "User") return "User";
  if (r === "assistant" || r === "BotCat") return "BotCat";
  // Be safe: default to BotCat (non-user) to avoid rendering everything as User
  return "BotCat";
}

interface BotCatMessageJson {
  messageId: string;
  role: IncomingRole;
  // canonical per docs/spec.md
  content?: string;
  // legacy / older naming
  contentOriginal_md?: string;
  hasAttachments?: boolean;
  hasLinks?: boolean;
  isVoice?: boolean;
  createdAt: string;
  attachments?: unknown;
}

interface BotCatTranslatedMessageJson {
  messageId: string;
  role: IncomingRole;
  contentTranslated_md: string;
}

interface BotCatFinalJsonIncoming {
  schemaVersion?: string | null;
  chatName: string;
  /**
   * Canonical field name per docs/spec.md
   */
  languageOriginal?: string;
  /**
   * Legacy alias observed in existing integrations/tests
   */
  userLanguage?: string;
  messages: BotCatMessageJson[];
  translatedMessages: BotCatTranslatedMessageJson[];
  attachments: BotCatAttachmentJson[] | null | undefined;
  preamble_md: string;
  footerInternal_md: string;
  footerClient_md: string;
  sendToInternal: boolean;
}

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function parseIsoDate(value: string, fieldName: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new ValidationError(`Invalid ISO date in field "${fieldName}": ${value}`);
  }
  return d;
}

function normalizeLanguageOriginal(payload: BotCatFinalJsonIncoming): string {
  const lang =
    (typeof payload.languageOriginal === "string" && payload.languageOriginal) ||
    (typeof payload.userLanguage === "string" && payload.userLanguage) ||
    "";

  const normalized = lang.trim();
  if (!normalized) {
    throw new ValidationError(
      '"languageOriginal" is required (or legacy "userLanguage")'
    );
  }
  return normalized;
}

function normalizeMessageContent(msg: BotCatMessageJson): string {
  const c = typeof msg.content === "string" ? msg.content : "";
  const legacy =
    typeof msg.contentOriginal_md === "string" ? msg.contentOriginal_md : "";
  const value = (c || legacy).trim();
  if (!value) {
    // Prisma requires content_original_md; use a visible marker instead of undefined
    return "[EMPTY]";
  }
  return value;
}

function isValidationError(e: unknown): e is ValidationError {
  return e instanceof ValidationError;
}

function buildTranslatedMap(translatedMessages: BotCatTranslatedMessageJson[]) {
  const map = new Map<string, BotCatTranslatedMessageJson>();
  for (const tm of translatedMessages ?? []) {
    if (tm && typeof tm.messageId === "string" && tm.messageId.trim()) {
      map.set(tm.messageId, tm);
    }
  }
  return map;
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

    const languageOriginal = normalizeLanguageOriginal(payload);

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

    // upsert conversation (webhook is a finalization channel, hence `closed`)
    const conversation = await prisma.conversation.upsert({
      where: {
        chat_name: payload.chatName,
      },
      create: {
        chat_name: payload.chatName,
        user_id: null,
        status: "closed",
        language_original: languageOriginal,
        send_to_internal: payload.sendToInternal,
        started_at: startedAt,
        finished_at: finishedAt,
        last_activity_at: finishedAt,
        message_count: payload.messages.length,
      },
      update: {
        status: "closed",
        language_original: languageOriginal,
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
        role: normalizeIncomingRoleForDb(msg.role),
        content_original_md: normalizeMessageContent(msg),
        content_translated_md: translated?.contentTranslated_md ?? null,
        has_attachments: !!msg.hasAttachments,
        has_links: !!msg.hasLinks,
        is_voice: !!msg.isVoice,
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

    // shared finalization pipeline (HTML/PDF/Drive/email)
    try {
      await finalizeConversationByChatName({
        chatName: payload.chatName,
        reason: "webhook",
      });
    } catch (postProcessError: any) {
      throw new Error(
        `Post-processing failed: ${
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
    const isValidation = isValidationError(error);
    const status = isValidation ? 400 : 500;
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
        ? error
        : "Unknown error";

    if (!isValidation) {
      console.error("[Webhook] Error in /api/bot/webhook:", error);
    }

    try {
      await prisma.webhookLog.create({
        data: {
          conversation_id: conversationId,
          payload: rawPayload as any,
          status_code: status,
          error_message: message,
        },
      });
    } catch (logError) {
      console.error("[Webhook] Failed to write webhookLog:", logError);
    }

    return NextResponse.json(
      {
        ok: false,
        error: `${isValidation ? "ValidationError" : "InternalError"}: ${message}`,
      },
      { status }
    );
  }
}
