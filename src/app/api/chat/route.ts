import { NextResponse } from "next/server";

import crypto from "crypto";

import { z } from "zod";

import { prisma } from "@/server/db";

import { BOTCAT_CHAT_PROMPT } from "@/lib/botcat-chat-prompt";

import type { BotCatAttachment } from "@/lib/botcat-attachment";
import { generateChatName, generateMessageId } from "@/lib/chat-ids";
import {
  openai,
  selectBotCatEmbeddingModel,
  selectBotCatTextModel,
  type BotCatTextModelKind,
} from "@/lib/openai";
import { mapBotCatAttachmentsArrayToDb } from "@/server/attachments/blob-mapper";

function sha256HexShort(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 32);
}

function getClientIpFromHeaders(headers: Headers): string | null {
  const xfwd = headers.get("x-forwarded-for");
  if (xfwd) {
    const first = xfwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const xreal = headers.get("x-real-ip");
  if (xreal) return xreal.trim();
  return null;
}

const AttachmentSchema = z.object({
  attachmentId: z.string(),
  messageId: z.string(),
  kind: z.enum(["user_upload", "bot_generated", "external_url"]),
  fileName: z.string().nullable(),
  mimeType: z.string().nullable(),
  fileSizeBytes: z.number().nullable(),
  pageCount: z.number().nullable(),
  originalUrl: z.string().url().nullable(),
  blobUrlOriginal: z.string().url().nullable(),
  blobUrlPreview: z.string().url().nullable(),
});

type ExtractedDocument = {
  attachmentId: string;
  fileName: string | null;
  mimeType: string | null;
  text: string;
};

const ExtractedDocumentSchema = z.object({
  attachmentId: z.string(),
  fileName: z.string().nullable(),
  mimeType: z.string().nullable(),
  text: z.string().min(1),
});

const ChatRequestBodySchema = z.object({
  chatName: z.string().nullable().optional(),
  message: z.string().min(1),
  attachments: z.array(AttachmentSchema).optional().default([]),
  extractedDocuments: z.array(ExtractedDocumentSchema).optional().default([]),
  client: z
    .object({
      sessionId: z.string().optional(),
      userAgent: z.string().optional(),
    })
    .optional(),
});

type ChatRequestBody = z.infer<typeof ChatRequestBodySchema>;

function toOpenAIInputFromAttachment(a: BotCatAttachment) {
  const url = a.blobUrlOriginal ?? a.originalUrl;
  if (!url) return null;

  const mime = a.mimeType ?? "";
  if (mime.startsWith("image/")) {
    return {
      type: "input_image" as const,
      image_url: url,
    };
  }

  // IMPORTANT (per docs/spec.md): non-image files are NOT passed to LLM by URL.
  return null;
}

function formatExtractedDocuments(docs: ExtractedDocument[]): string {
  if (!docs.length) return "";

  // Keep it explicit and easy to trim/debug.
  // UI is responsible for limiting size.
  return docs
    .map((d, idx) => {
      const name = d.fileName ?? `document_${idx + 1}`;
      const mime = d.mimeType ?? "unknown";
      return [
        `--- EXTRACTED_DOCUMENT ${idx + 1} ---`,
        `fileName: ${name}`,
        `mimeType: ${mime}`,
        "",
        d.text,
      ].join("\n");
    })
    .join("\n\n");
}

function sseHeaders() {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  } as const;
}

function sseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function chooseTextModelKind(params: {
  message: string;
  extractedDocuments: ExtractedDocument[];
  attachments: BotCatAttachment[];
}): BotCatTextModelKind {
  const { message, extractedDocuments, attachments } = params;

  const len = message.length;
  const hasDocsText = extractedDocuments.some((d) => d.text && d.text.length > 0);
  const hasImages = attachments.some((a) => (a.mimeType ?? "").startsWith("image/"));

  const lower = message.toLowerCase();
  const reasoningHints = [
    "step by step",
    "reasoning",
    "prove",
    "обоснуй",
    "пошагово",
  ];

  if (len > 2000 || reasoningHints.some((k) => lower.includes(k))) return "reasoning";

  if (len > 800 || hasDocsText || hasImages) return "chat_strong";

  return "chat";
}

async function createEmbeddingForUserMessage(params: {
  messageId: string;
  text: string;
}) {
  const model = selectBotCatEmbeddingModel();
  const res = await openai.embeddings.create({
    model,
    input: params.text,
  });

  const vec = res.data?.[0]?.embedding;
  if (!vec || !Array.isArray(vec)) return;

  await prisma.messageEmbedding.create({
    data: {
      message_id: params.messageId,
      model,
      vector: vec as unknown as object,
      dims: vec.length,
    },
  });
}

export async function POST(request: Request) {
  const parsed = ChatRequestBodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const body: ChatRequestBody = parsed.data;

  const existingChatName = body.chatName ?? null;
  const chatName = existingChatName ?? generateChatName();

  const ip = getClientIpFromHeaders(request.headers);
  const ipHash = ip ? sha256HexShort(ip) : null;

  const now = new Date();

  // TTL is defined in docs/spec.md as 30 days.
  const ttlDaysMs = 30 * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(now.getTime() + ttlDaysMs);

  // Upsert conversation and atomically compute sequences.
  const { conversationId, userMessageId, botMessageId, userSequence, botSequence } =
    await prisma.$transaction(async (tx: Parameters<typeof prisma.$transaction>[0] extends (arg: infer A) => any ? A : never) => {
      const conv = await tx.conversation.upsert({
        where: { chat_name: chatName },
        create: {
          chat_name: chatName,
          user_id: null,
          status: "active",
          language_original: "und",
          started_at: now,
          last_activity_at: now,
          meta: {
            clientSessionId: body.client?.sessionId ?? null,
            userAgent: body.client?.userAgent ?? null,
            ipHash,
          },
        },
        update: {
          last_activity_at: now,
          meta: {
            clientSessionId: body.client?.sessionId ?? null,
            userAgent: body.client?.userAgent ?? null,
            ipHash,
          },
        },
        select: {
          id: true,
          message_count: true,
        },
      });

      const userSeq = conv.message_count + 1;
      const botSeq = conv.message_count + 2;

      const uMid = generateMessageId(chatName, "u", userSeq);
      const bMid = generateMessageId(chatName, "b", botSeq);

      await tx.message.create({
        data: {
          conversation_id: conv.id,
          message_id: uMid,
          role: "User",
          content_original_md: body.message,
          content_translated_md: null,
          has_attachments: body.attachments.length > 0,
          has_links: false,
          is_voice: false,
          created_at: now,
          sequence: userSeq,
        },
      });

      const attachmentRows = mapBotCatAttachmentsArrayToDb({
        attachments: (body.attachments ?? []).map((a) => ({
          attachmentId: a.attachmentId,
          messageId: uMid,
          kind: a.kind,
          fileName: a.fileName ?? null,
          mimeType: a.mimeType ?? null,
          fileSizeBytes: a.fileSizeBytes ?? null,
          pageCount: a.pageCount ?? null,
          originalUrl: a.originalUrl ?? null,
          blobUrlOriginal: a.blobUrlOriginal ?? null,
          blobUrlPreview: a.blobUrlPreview ?? null,
        })),
        conversationId: conv.id,
        now,
      });

      if (attachmentRows.length > 0) {
        // Ensure expires_at is correct (mapper already sets it), but we keep spec TTL in sync here.
        await tx.attachment.createMany({
          data: attachmentRows.map((r) => ({
            ...r,
            expires_at: expiresAt,
          })),
        });
      }

      await tx.conversation.update({
        where: { id: conv.id },
        data: {
          message_count: { increment: 2 },
          last_activity_at: now,
        },
      });

      return {
        conversationId: conv.id,
        userMessageId: uMid,
        botMessageId: bMid,
        userSequence: userSeq,
        botSequence: botSeq,
      };
    });

  // Create embedding for the user message (Stage 1 requirement).
  // We include extracted docs in the embedding input so future search works better.
  const extractedTextBlock = formatExtractedDocuments(body.extractedDocuments ?? []);
  const embeddingText = extractedTextBlock
    ? `${body.message}\n\n${extractedTextBlock}`
    : body.message;

  // Best-effort: embedding failure must not break chat.
  createEmbeddingForUserMessage({ messageId: userMessageId, text: embeddingText }).catch((e) => {
    console.warn("[api/chat] embedding failed", e);
  });

  // Build model input with DB history.
  const historyLimit = 40;
  const history = await prisma.message.findMany({
    where: { conversation_id: conversationId },
    orderBy: { sequence: "desc" },
    take: historyLimit,
    select: {
      role: true,
      content_original_md: true,
      sequence: true,
    },
  });

  const historyAsc = history.slice().reverse();

  const textModelKind = chooseTextModelKind({
    message: body.message,
    extractedDocuments: body.extractedDocuments ?? [],
    attachments: body.attachments as any,
  });
  const model = selectBotCatTextModel(textModelKind);

  const extractedDocsForLLM = extractedTextBlock ? `\n\n${extractedTextBlock}` : "";

  const inputs: any[] = [
    { type: "input_text" as const, text: BOTCAT_CHAT_PROMPT },

    ...historyAsc.map((m) => ({
      type: "input_text" as const,
      text: `${m.role}:\n${m.content_original_md}`,
    })),

    {
      type: "input_text" as const,
      text: `${body.message}${extractedDocsForLLM}`,
    },

    ...((body.attachments ?? [])
      .map((a) => toOpenAIInputFromAttachment(a as any))
      .filter(Boolean)),
  ];

  const stream = await openai.responses.stream({
    model,
    input: inputs,
  });

  const encoder = new TextEncoder();

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          sseEvent("meta", {
            chatName,
            model,
            mode: textModelKind,
            userMessageId,
            userSequence,
            usedHistoryCount: historyAsc.length,
          })
        )
      );

      let fullText = "";

      try {
        for await (const event of stream) {
          if ((event as any).type === "response.output_text.delta") {
            const delta = (event as any).delta as string;
            fullText += delta;
            controller.enqueue(encoder.encode(sseEvent("delta", { delta })));
          }
        }

        await prisma.message.create({
          data: {
            conversation_id: conversationId,
            message_id: botMessageId,
            role: "BotCat",
            content_original_md: fullText,
            content_translated_md: null,
            has_attachments: false,
            has_links: false,
            is_voice: false,
            created_at: new Date(),
            sequence: botSequence,
          },
        });

        controller.enqueue(
          encoder.encode(
            sseEvent("final", {
              chatName,
              reply: fullText,
              botMessageId,
            })
          )
        );

        controller.close();
      } catch (e: any) {
        controller.enqueue(
          encoder.encode(
            sseEvent("error", {
              error: e?.message ?? "Unknown error",
            })
          )
        );
        controller.close();
      }
    },
  });

  return new Response(readable, { headers: sseHeaders() });
}
