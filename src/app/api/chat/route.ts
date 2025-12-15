import { NextRequest } from "next/server";
import OpenAI from "openai";
import { BOTCAT_SYSTEM_PROMPT } from "@/lib/botcat-system";
import { prisma } from "@/lib/prisma";
import { generateChatName, generateMessageId } from "@/lib/chat-ids";
import { detectAndTranslate } from "@/lib/translator";
import { detectHasLinks, detectIsVoice } from "@/lib/message-flags";

type ChatRequestBody = {
  chatName?: string | null;
  message?: string;
};

function sse(data: unknown, event?: string) {
  const lines: string[] = [];
  if (event) lines.push(`event: ${event}`);
  lines.push(`data: ${JSON.stringify(data)}`);
  return lines.join("\n") + "\n\n";
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
      // Новый диалог: генерируем chatName и создаём Conversation
      chatName = generateChatName(now);

      conversation = await prisma.conversation.create({
        data: {
          chat_name: chatName,
          status: "active",
          language_original: languageOriginal, // автоопределённый язык первого сообщения
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
        has_attachments: false,
        has_links: userHasLinks,
        is_voice: userIsVoice,
        created_at: now,
        sequence: userSequence,
      },
    });

    // Обновляем conversation (last_activity + счётчик)
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        last_activity_at: now,
        message_count: userSequence,
      },
    });

    // 3. SSE stream from OpenAI
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // (stage 1) Keep existing model selection logic: default gpt-4.1-mini.
    // We'll centralize it later when we wire full UI contract.
    const model = "gpt-4.1-mini";

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
            {
              type: "input_text",
              text: message,
            },
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
            sse({ ok: true, chatName, model, userMessageId }, "meta")
          )
        );

        (async () => {
          try {
            for await (const event of stream) {
              // OpenAI SDK emits a variety of event types. We only forward deltas.
              if (event.type === "response.output_text.delta") {
                const delta = event.delta ?? "";
                if (delta) {
                  fullReply += delta;
                  controller.enqueue(
                    encoder.encode(sse({ delta }, "delta"))
                  );
                }
              }

              if (event.type === "response.completed") {
                break;
              }
            }

            // Ensure stream is fully consumed
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
                sse(
                  {
                    ok: false,
                    error: "Internal Server Error",
                  },
                  "error"
                )
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
