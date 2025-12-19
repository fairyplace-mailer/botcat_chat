import { NextRequest } from "next/server";
import OpenAI from "openai";
import crypto from "node:crypto";
import { BOTCAT_CHAT_PROMPT } from "@/lib/botcat-chat-prompt";
import { prisma } from "@/lib/prisma";
import { generateChatName, generateMessageId } from "@/lib/chat-ids";
import { detectAndTranslate } from "@/lib/translator";
import { detectHasLinks, detectIsVoice } from "@/lib/message-flags";
import { BotCatAttachmentSchema, type BotCatAttachment } from "@/lib/botcat-attachment";

type ChatRequestBody = {
  chatName?: string | null;
  message?: string;
  attachments?: BotCatAttachment[];
  client?: {
    sessionId?: string;
    userAgent?: string;
  };
};

function sse(data: unknown, event?: string) {
  const lines: string[] = [];
  if (event) lines.push(`event: ${event}`);
  lines.push(`data: ${JSON.stringify(data)}`);
  return lines.join("\n") + "\n\n";
}

function toOpenAIInputFromAttachments(attachments: BotCatAttachment[]) {
  // Stage v1.0: We only send what the OpenAI API can consume directly.
  // - images as input_image
  // - pdf/csv/text/json as input_file
  // Anything else is ignored (still stored in our transcript later if needed).
  const parts: Array<any> = [];

  for (const a of attachments) {
    const url = a.blobUrlOriginal ?? a.originalUrl;
    const mime = a.mimeType ?? "";
    if (!url) continue;

    if (mime.startsWith("image/")) {
      parts.push({ type: "input_image", image_url: url });
      continue;
    }

    // OpenAI supports input_file with a URL for certain types (pdf, etc.).
    parts.push({
      type: "input_file",
      filename: a.fileName ?? "attachment",
      file_url: url,
    });
  }

  return parts;
}

function extractIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xRealIp = req.headers.get("x-real-ip");
  if (xRealIp) return xRealIp.trim();
  return "";
}

function hashIp(ip: string): string {
  if (!ip) return "";
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as ChatRequestBody | null;

    if (!body || typeof body !== "object") {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid JSON body" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { chatName: rawChatName = null, message } = body;

    if (!message || typeof message !== "string") {
      return new Response(
        JSON.stringify({ ok: false, error: "Field 'message' is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const attachmentsRaw = Array.isArray(body.attachments) ? body.attachments : [];
    const parsedAttachments: BotCatAttachment[] = [];
    for (const item of attachmentsRaw) {
      const parsed = BotCatAttachmentSchema.safeParse(item);
      if (parsed.success) parsedAttachments.push(parsed.data);
    }

    const clientSessionId = body.client?.sessionId?.trim() || null;
    const clientUserAgent = body.client?.userAgent?.trim() || null;
    const ipHash = hashIp(extractIp(req)) || null;

    const now = new Date();
    let chatName = rawChatName ?? null;

    // 0.
    // NOTE: translation/detection will be removed from /api/chat in a later step;
    // we keep current behavior for now.
    const userTranslation = await detectAndTranslate(message);
    const languageOriginal =
      userTranslation.language_original && userTranslation.language_original.trim()
        ? userTranslation.language_original.trim()
        : "und";
    const userTranslatedMd = userTranslation.translated_md ?? "";

    const userHasLinks = detectHasLinks(message);
    const userIsVoice = detectIsVoice(message);

    // 1. Find or create Conversation
    let conversation = null as Awaited<
      ReturnType<typeof prisma.conversation.findUnique>
    > | null;

    if (chatName) {
      conversation = await prisma.conversation.findUnique({
        where: { chat_name: chatName },
      });
    }

    if (!conversation) {
      chatName = generateChatName(now);

      conversation = await prisma.conversation.create({
        data: {
          chat_name: chatName,
          status: "active",
          language_original: languageOriginal,
          send_to_internal: true,
          started_at: now,
          last_activity_at: now,
          message_count: 0,
          meta: {
            clientSessionId,
            userAgent: clientUserAgent,
            ipHash,
          },
        },
      });
    } else if (clientSessionId || clientUserAgent || ipHash) {
      // Persist client metadata on existing conversation if we have new values.
      const nextMeta = {
        ...(typeof conversation.meta === "object" && conversation.meta ? conversation.meta : {}),
        ...(clientSessionId ? { clientSessionId } : {}),
        ...(clientUserAgent ? { userAgent: clientUserAgent } : {}),
        ...(ipHash ? { ipHash } : {}),
      };

      conversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: { meta: nextMeta },
      });
    }

    // 2. Save user message
    const userSequence = conversation.message_count + 1;
    const userMessageId = generateMessageId(chatName!, "u", userSequence);

    await prisma.message.create({
      data: {
        conversation_id: conversation.id,
        message_id: userMessageId,
        role: "User",
        content_original_md: message,
        content_translated_md: userTranslatedMd,
        has_attachments: parsedAttachments.length > 0,
        has_links: userHasLinks,
        is_voice: userIsVoice,
        created_at: now,
        sequence: userSequence,
      },
    });

    // 2a. Persist attachments
    if (parsedAttachments.length > 0) {
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      await prisma.attachment.createMany({
        data: parsedAttachments.map((a) => {
          const blobUrlOriginal = a.blobUrlOriginal ?? null;
          const externalUrl = a.originalUrl ?? null;

          const kind = blobUrlOriginal
            ? "user_upload"
            : externalUrl
              ? "external_url"
              : "external_url";

          return {
            conversation_id: conversation!.id,
            message_id: userMessageId,
            kind,
            file_name: a.fileName ?? null,
            mime_type: a.mimeType ?? null,
            file_size_bytes: a.fileSizeBytes ?? null,
            blob_key_original: a.blobKeyOriginal ?? null,
            blob_url_original: blobUrlOriginal,
            blob_url_preview: a.blobUrlPreview ?? null,
            external_url: externalUrl,
            expires_at: expiresAt,
          };
        }),
      });
    }

    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        last_activity_at: now,
        message_count: userSequence,
      },
    });

    // 3. SSE stream from OpenAI
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const model = "gpt-4.1-mini";

    const attachmentParts = toOpenAIInputFromAttachments(parsedAttachments);

    const stream = await client.responses.stream({
      model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: BOTCAT_CHAT_PROMPT,
            },
          ],
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: message },
            ...attachmentParts,
          ],
        },
      ],
    });

    const encoder = new TextEncoder();

    let fullReply = "";

    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            sse(
              {
                ok: true,
                chatName,
                model,
                userMessageId,
                attachmentsCount: parsedAttachments.length,
              },
              "meta"
            )
          )
        );

        (async () => {
          try {
            for await (const event of stream) {
              if (event.type === "response.output_text.delta") {
                const delta = event.delta ?? "";
                if (delta) {
                  fullReply += delta;
                  controller.enqueue(encoder.encode(sse({ delta }, "delta")));
                }
              }

              if (event.type === "response.completed") {
                break;
              }
            }

            await stream.done();

            // Translation will be removed from /api/chat in a later step.
            const botTranslation = await detectAndTranslate(fullReply);
            const botTranslatedMd = botTranslation.translated_md ?? "";

            const botHasLinks = detectHasLinks(fullReply);
            const botIsVoice = detectIsVoice(fullReply);

            // 4. Save BotCat response
            const botSequence = conversation!.message_count + 1;
            const botMessageId = generateMessageId(chatName!, "b", botSequence);

            await prisma.message.create({
              data: {
                conversation_id: conversation!.id,
                message_id: botMessageId,
                role: "BotCat",
                content_original_md: fullReply,
                content_translated_md: botTranslatedMd,
                has_attachments: false,
                has_links: botHasLinks,
                is_voice: botIsVoice,
                created_at: new Date(),
                sequence: botSequence,
              },
            });

            await prisma.conversation.update({
              where: { id: conversation!.id },
              data: {
                last_activity_at: new Date(),
                message_count: botSequence,
              },
            });

            controller.enqueue(
              encoder.encode(
                sse(
                  {
                    ok: true,
                    chatName,
                    model,
                    botMessageId,
                    reply: fullReply,
                  },
                  "final"
                )
              )
            );
            controller.close();
          } catch (e) {
            controller.enqueue(
              encoder.encode(
                sse({ ok: false, error: "Internal Server Error" }, "error")
              )
            );
            controller.close();
          }
        })();
      },
      cancel() {
        try {
          stream.abort();
        } catch {
          // ignore
        }
      },
    });

    return new Response(readable, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[/api/chat] Unexpected error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: "Internal Server Error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
