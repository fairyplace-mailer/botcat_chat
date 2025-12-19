import { NextResponse } from "next/server";

import crypto from "crypto";

import { z } from "zod";

import { prisma } from "@/server/db";
import { openai } from "@/server/openai";

import { BOTCAT_CHAT_PROMPT } from "@/lib/botcat-chat-prompt";

import type { BotCatAttachment } from "@/lib/botcat-attachment";
import { getChatName } from "@/server/chat-name";

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

type ClientMeta = {
  sessionId?: string;
  userAgent?: string;
};

const ChatRequestBodySchema = z.object({
  chatName: z.string().nullable().optional(),
  message: z.string().min(1),
  attachments: z.array(AttachmentSchema).optional().default([]),
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

  return {
    type: "input_file" as const,
    file_url: url,
  };
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
  const chatName = existingChatName ?? (await getChatName());

  const ip = getClientIpFromHeaders(request.headers);
  const ipHash = ip ? sha256HexShort(ip) : null;

  const now = new Date();
  const ttlDaysMs = 30 * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(now.getTime() + ttlDaysMs);

  const conversation = await prisma.conversation.upsert({
    where: { chat_name: chatName },
    create: {
      chat_name: chatName,
      language_original: "und",
      meta: {
        clientSessionId: body.client?.sessionId ?? null,
        userAgent: body.client?.userAgent ?? null,
        ipHash,
      },
    },
    update: {
      meta: {
        ...(typeof ({} as any) === "object" ? {} : {}),
        clientSessionId: body.client?.sessionId ?? null,
        userAgent: body.client?.userAgent ?? null,
        ipHash,
      },
    },
    select: {
      id: true,
      chat_name: true,
    },
  });

  // Create user message
  const userMessageId = `${chatName}__u_${"001"}`; // existing logic likely increments elsewhere

  const userMsg = await prisma.message.create({
    data: {
      conversation_id: conversation.id,
      message_id: userMessageId,
      role: "User",
      content_original_md: body.message,
      content_translated_md: null,
      has_attachments: body.attachments.length > 0,
      has_links: false,
      is_voice: false,
    },
  });

  if (body.attachments.length > 0) {
    await prisma.attachment.createMany({
      data: body.attachments.map((a) => {
        const externalUrl = a.originalUrl ?? null;
        const blobUrlOriginal = a.blobUrlOriginal ?? null;
        const kind = blobUrlOriginal ? "user_upload" : "external_url";

        return {
          conversation_id: conversation.id,
          message_id: userMsg.id,
          kind,
          file_name: a.fileName ?? null,
          mime_type: a.mimeType ?? null,
          file_size_bytes: a.fileSizeBytes ?? null,
          blob_url_original: blobUrlOriginal,
          blob_url_preview: a.blobUrlPreview ?? null,
          external_url: externalUrl,
          page_count: a.pageCount ?? null,
          expires_at: expiresAt,
        };
      }),
    });
  }

  const inputs = [
    { type: "input_text" as const, text: BOTCAT_CHAT_PROMPT },
    {
      type: "input_text" as const,
      text: body.message,
    },
    ...body.attachments
      .map((a) => toOpenAIInputFromAttachment(a as any))
      .filter(Boolean),
  ];

  const stream = await openai.responses.stream({
    model: "gpt-4.1-mini",
    input: inputs,
  });

  const encoder = new TextEncoder();

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          sseEvent("meta", {
            chatName,
            model: "gpt-4.1-mini",
            userMessageId,
          })
        )
      );

      let fullText = "";

      try {
        for await (const event of stream) {
          if ((event as any).type === "response.output_text.delta") {
            const delta = (event as any).delta as string;
            fullText += delta;
            controller.enqueue(
              encoder.encode(
                sseEvent("delta", {
                  delta,
                })
              )
            );
          }
        }

        const botMessageId = `${chatName}__b_${"001"}`;

        await prisma.message.create({
          data: {
            conversation_id: conversation.id,
            message_id: botMessageId,
            role: "BotCat",
            content_original_md: fullText,
            content_translated_md: null,
            has_attachments: false,
            has_links: false,
            is_voice: false,
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
              message: e?.message ?? "Unknown error",
            })
          )
        );
        controller.close();
      }
    },
  });

  return new Response(readable, { headers: sseHeaders() });
}
