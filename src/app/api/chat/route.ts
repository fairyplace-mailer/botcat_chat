import { NextRequest } from "next/server";
import OpenAI from "openai";
import { BOTCAT_SYSTEM_PROMPT } from "@/lib/botcat-system";
import { prisma } from "@/lib/prisma";
import { generateChatName, generateMessageId } from "@/lib/chat-ids";
import { detectAndTranslate } from "@/lib/translator";
import { detectHasLinks, detectIsVoice } from "@/lib/message-flags";
import { BotCatAttachmentSchema, type BotCatAttachment } from "@/lib/botcat-attachment";

type ChatRequestBody = {
  chatName?: string | null;
  message?: string;
  attachments?: BotCatAttachment[];
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

    const now = new Date();
    let chatName = rawChatName ?? null;

    // 0. Автоопределение языка + перевод сообщения пользователя на RU
    const userTranslation = await detectAndTranslate(message);
    const languageOriginal =
      userTranslation.language_original && userTranslation.language_original.trim()
        ? userTranslation.language_original.trim()
        : "und";
    const userTranslatedMd = userTranslation.translated_md ?? "";

    const userHasLinks = detectHasLinks(message);
    const userIsVoice = detectIsVoice(message);

    // 1. Находим или создаём Conversation
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
        },
      });
    }

    // 2. Сохраняем сообщение пользователя
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
              text: BOTCAT_SYSTEM_PROMPT,
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

            // 3.1. Перевод ответа BotCat на RU
            const botTranslation = await detectAndTranslate(fullReply);
            const botTranslatedMd = botTranslation.translated_md ?? "";

            const botHasLinks = detectHasLinks(fullReply);
            const botIsVoice = detectIsVoice(fullReply);

            // 4. Сохраняем ответ BotCat
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
