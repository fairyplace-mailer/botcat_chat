import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { openai, selectBotCatEmbeddingModel } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import type { BotCatAttachment } from "@/lib/botcat-attachment";
import { chooseBotCatImageModel, chooseBotCatModel } from "@/lib/model-router";
import { detectLanguageIso6391 } from "@/lib/language-detect";
import {
  formatReferenceContextBlock,
  formatWebContextBlock,
  retrieveRelevantReferenceChunks,
  retrieveRelevantWebSections,
} from "@/server/rag/retrieval";
import { updateSessionSummaryIfNeeded } from "@/server/rag/session-summary";
import { buildBotCatSystemPrompt } from "@/lib/botcat-chat-prompt";

const CONSENT_MARKER = "[[CONSENT_TRUE]]";

const CONSENT_SUCCESS_TEXT =
  "Your order has been successfully sent to FairyPlace\u2122 designers. The designers will contact you as soon as possible.";

const CONSENT_ERROR_TEXT =
  "Unfortunately, we could not forward your order to FairyPlace\u2122 designers. However, you can contact them directly via email at fairyplace.tm@gmail.com or via the contacts on the website www.fairyplace.biz.";

function sse(event: string, data: any) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function normalizeChatName(chatName: unknown): string | null {
  if (typeof chatName !== "string") return null;
  const t = chatName.trim();
  if (!t) return null;
  // avoid accidental path traversal in /t/<chatName>
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(t)) return null;
  return t;
}

function isImage(att: BotCatAttachment) {
  return Boolean(att.mimeType && att.mimeType.startsWith("image/"));
}

function isLikelyImageRequest(text: string): boolean {
  const t = (text || "").toLowerCase();
  const hints = [
    // EN
    "generate an image",
    "generate image",
    "create an image",
    "create image",
    "make an image",
    "make image",
    "draw",
    "illustrate",
    "render",
    "photorealistic",
    // RU
    "сгенерируй картин",
    "сгенерируй изображ",
    "сделай картин",
    "сделай изображ",
    "создай картин",
    "создай изображ",
    "нарисуй",
    "нарисуешь",
    "отрисуй",
    "иллюстрац",
    "рендер",
    "фотореалист",
    // UA
    "згенеруй зображ",
    "намалюй",
    "фотореаліст",
  ];
  return hints.some((h) => t.includes(h));
}

function buildExtractedDocumentsBlock(extractedDocuments: any[]): string {
  if (!Array.isArray(extractedDocuments) || extractedDocuments.length === 0) return "";

  const parts: string[] = [];
  for (const d of extractedDocuments) {
    if (!d || typeof d !== "object") continue;
    const fileName = typeof d.fileName === "string" ? d.fileName : "document";
    const text = typeof d.text === "string" ? d.text : "";
    if (!text.trim()) continue;
    parts.push(`---\nFILE: ${fileName}\n${text}\n`);
  }

  if (parts.length === 0) return "";

  return `\n\n[EXTRACTED DOCUMENTS]\n${parts.join("\n")}`;
}

function buildMessageId(prefix: "u" | "b"): string {
  const now = new Date();
  return `FP_${now.toISOString().slice(0, 19).replace(/[:T]/g, "-")}_${crypto
    .randomUUID()
    .slice(0, 6)}__${prefix}_001`;
}

function extractImageRequest(text: string): { cleanedText: string; prompt: string | null } {
  // New protocol: text model emits a marker without any base64.
  // It is intentionally simple and robust.
  //
  // [[GENERATE_IMAGE]]
  // prompt: ...
  // [[/GENERATE_IMAGE]]
  const START = "[[GENERATE_IMAGE]]";
  const END = "[[/GENERATE_IMAGE]]";

  const s = text.indexOf(START);
  if (s === -1) return { cleanedText: text, prompt: null };
  const e = text.indexOf(END, s + START.length);
  if (e === -1) return { cleanedText: text, prompt: null };

  const inside = text.slice(s + START.length, e).trim();
  const cleanedText = (text.slice(0, s) + text.slice(e + END.length)).trim();

  // Accept either "prompt: ..." or raw text.
  const m = inside.match(/prompt\s*:\s*([\s\S]+)/i);
  const prompt = (m?.[1] ?? inside).trim();

  return { cleanedText, prompt: prompt || null };
}

type OpenAiImageSize = "1024x1024" | "1024x1536" | "1536x1024" | "auto";

function chooseImageSize(_quality: "standard" | "high"): OpenAiImageSize {
  // Supported: 1024x1024, 1024x1536, 1536x1024, auto.
  // Keep Stage 1 stable: always 1024x1024.
  return "1024x1024";
}

async function generateBotImagePng(prompt: string): Promise<{
  fileName: string;
  mimeType: string;
  bytes: Buffer;
  quality: "standard" | "high";
  model: string;
  modelReason: string;
}> {
  const { quality, model, reason } = chooseBotCatImageModel({ prompt });

  const result: any = await (openai as any).images.generate({
    model,
    prompt,
    size: chooseImageSize(quality),
  });

  const b64 = result?.data?.[0]?.b64_json;
  if (!b64 || typeof b64 !== "string") {
    throw new Error("OpenAI image generation returned no b64_json");
  }

  const bytes = Buffer.from(b64, "base64");
  const fileName = `bot_generated/${quality === "high" ? "high" : "std"}_${crypto
    .randomUUID()
    .slice(0, 6)}.png`;

  return { fileName, mimeType: "image/png", bytes, quality, model, modelReason: reason };
}

async function requestImageMarkerFromTextModel(opts: {
  model: string;
  userText: string;
  userLang: string;
}): Promise<string | null> {
  // Fallback: force the model to output ONLY the marker block.
  // Keep it strict to avoid polluting the chat reply.
  const resp: any = await openai.chat.completions.create({
    model: opts.model,
    stream: false,
    messages: [
      {
        role: "system",
        content:
          "You must output ONLY a single image generation marker block, and nothing else.\n" +
          "Format must be exactly:\n" +
          "[[GENERATE_IMAGE]]\n" +
          "prompt: <short, precise image description in the user's language>\n" +
          "[[/GENERATE_IMAGE]]\n" +
          "Rules: no extra text, no code fences, no JSON, no base64, no URLs.\n" +
          `Language: write the prompt in ${opts.userLang}.`,
      },
      { role: "user", content: opts.userText },
    ],
  });

  const text = resp?.choices?.[0]?.message?.content;
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed.includes("[[GENERATE_IMAGE]]") || !trimmed.includes("[[/GENERATE_IMAGE]]")) {
    return null;
  }
  return trimmed;
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const incomingChatName = normalizeChatName(body?.chatName);

  const message = typeof body?.message === "string" ? body.message : "";
  const attachments: BotCatAttachment[] = Array.isArray(body?.attachments) ? body.attachments : [];
  const extractedDocuments = Array.isArray(body?.extractedDocuments) ? body.extractedDocuments : [];

  if (!message.trim() && attachments.length === 0) {
    return NextResponse.json({ ok: false, error: "Empty message" }, { status: 400 });
  }

  const now = new Date();

  // Create/ensure conversation
  const chatName = incomingChatName ?? `chat_${crypto.randomUUID().slice(0, 8)}`;

  const detectedLang = detectLanguageIso6391(message);

  const conversation = await prisma.conversation.upsert({
    where: { chat_name: chatName },
    create: {
      chat_name: chatName,
      user_id: null,
      status: "active",
      send_to_internal: true,
      started_at: now,
      finished_at: null,
      last_activity_at: now,
      message_count: 0,
      language_original: detectedLang ?? "und",
      meta: {},
    },
    update: {
      status: "active",
      last_activity_at: now,
      ...(detectedLang
        ? {
            language_original: detectedLang,
          }
        : {}),
    },
  });

  // Persist user message
  const userMessageId = buildMessageId("u");

  await prisma.message.create({
    data: {
      conversation_id: conversation.id,
      message_id: userMessageId,
      role: "User",
      content_original_md: message,
      content_translated_md: null,
      has_attachments: attachments.length > 0,
      has_links: false,
      is_voice: false,
      created_at: now,
      sequence: conversation.message_count + 1,
    },
  });

  // Keep message_count in sync (used by session summary trigger)
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      message_count: { increment: 1 },
      last_activity_at: now,
    },
  });

  // Attachments (best-effort)
  if (attachments.length > 0) {
    const attachmentRows = attachments.map((a) => ({
      conversation_id: conversation.id,
      message_id: userMessageId,
      kind: a.kind,
      file_name: a.fileName ?? null,
      mime_type: a.mimeType ?? null,
      file_size_bytes: a.fileSizeBytes ?? null,
      page_count: a.pageCount ?? null,
      external_url: a.originalUrl ?? null,
      blob_url_original: a.blobUrlOriginal ?? null,
      blob_url_preview: a.blobUrlPreview ?? null,
      expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      deleted_at: null,
    }));

    try {
      await prisma.attachment.createMany({ data: attachmentRows, skipDuplicates: true });
    } catch {
      // ignore
    }
  }

  // Embedding best-effort
  let messageEmbedding: number[] | null = null;
  try {
    const embeddingModel = selectBotCatEmbeddingModel();
    const emb = await openai.embeddings.create({ model: embeddingModel, input: message });
    const vec = emb.data?.[0]?.embedding;
    if (vec && Array.isArray(vec) && vec.length > 0) {
      messageEmbedding = vec as number[];
      await prisma.messageEmbedding.upsert({
        where: { message_id: userMessageId },
        create: {
          message_id: userMessageId,
          model: embeddingModel,
          vector: vec as any,
          dims: vec.length,
        },
        update: {
          model: embeddingModel,
          vector: vec as any,
          dims: vec.length,
        },
      });
    }
  } catch (err: any) {
    try {
      await prisma.webhookLog.create({
        data: {
          conversation_id: conversation.id,
          payload: {
            type: "embedding_failed",
            messageId: userMessageId,
            model: (() => {
              try {
                return selectBotCatEmbeddingModel();
              } catch {
                return null;
              }
            })(),
          },
          status_code: 200,
          error_message: String(err?.message ?? err),
        },
      });
    } catch {
      // ignore
    }
  }

  // Session summary update (best-effort)
  let sessionSummaryText = "";
  try {
    const res = await updateSessionSummaryIfNeeded({ chatName, everyNMessages: 4 });
    if (res.updated) sessionSummaryText = res.summary;
    else {
      const meta = (conversation.meta ?? {}) as any;
      if (typeof meta.sessionSummary === "string") sessionSummaryText = meta.sessionSummary;
    }
  } catch (err: any) {
    try {
      await prisma.webhookLog.create({
        data: {
          conversation_id: conversation.id,
          payload: { type: "session_summary_failed", messageId: userMessageId },
          status_code: 200,
          error_message: String(err?.message ?? err),
        },
      });
    } catch {
      // ignore
    }
  }

  const sessionSummaryBlock = sessionSummaryText
    ? `[SESSION SUMMARY]\n${sessionSummaryText}\n[/SESSION SUMMARY]`
    : "";

  // RAG retrieval (best-effort)
  let referenceContextBlock = "";
  let webContextBlock = "";

  if (messageEmbedding) {
    // Reference docs
    try {
      const chunks = await retrieveRelevantReferenceChunks({
        queryEmbedding: messageEmbedding,
        topK: 5,
      });
      referenceContextBlock = formatReferenceContextBlock(chunks);
    } catch (err: any) {
      try {
        await prisma.webhookLog.create({
          data: {
            conversation_id: conversation.id,
            payload: {
              type: "rag_retrieval_failed",
              messageId: userMessageId,
              scope: "reference",
            },
            status_code: 200,
            error_message: String(err?.message ?? err),
          },
        });
      } catch {
        // ignore
      }
    }

    // Web KB (bagsoflove + spoonflower)
    try {
      const sections = await retrieveRelevantWebSections({
        queryEmbedding: messageEmbedding,
        topK: 5,
        domains: ["www.bagsoflove.com", "www.spoonflower.com"],
      });
      webContextBlock = formatWebContextBlock(sections);
    } catch (err: any) {
      try {
        await prisma.webhookLog.create({
          data: {
            conversation_id: conversation.id,
            payload: {
              type: "rag_retrieval_failed",
              messageId: userMessageId,
              scope: "web_kb",
            },
            status_code: 200,
            error_message: String(err?.message ?? err),
          },
        });
      } catch {
        // ignore
      }
    }
  }

  const imageInstructionBlock =
    "If you need to generate an image, emit ONLY the following block (no base64, no URLs):\n" +
    "[[GENERATE_IMAGE]]\n" +
    "prompt: <one concise prompt describing the image to generate>\n" +
    "[[/GENERATE_IMAGE]]";

  const systemPrompt = buildBotCatSystemPrompt({
    sessionSummaryBlock,
    referenceContextBlock,
    webContextBlock,
    imageInstructionBlock,
  });

  // Read history
  const history = await prisma.message.findMany({
    where: { conversation_id: conversation.id },
    orderBy: { sequence: "asc" },
    take: 30,
  });

  const historyAttachments = await prisma.attachment.findMany({
    where: {
      conversation_id: conversation.id,
      deleted_at: null,
      mime_type: { startsWith: "image/" },
      blob_url_original: { not: null },
    },
    select: {
      message_id: true,
      blob_url_original: true,
      blob_url_preview: true,
      external_url: true,
      mime_type: true,
    },
    orderBy: { created_at: "asc" },
    take: 50,
  });

  const imagesByMessageId = new Map<string, Array<{ url: string; mimeType: string | null }>>();

  for (const a of historyAttachments) {
    const url = a.blob_url_original ?? a.external_url;
    if (!url) continue;
    const arr = imagesByMessageId.get(a.message_id) ?? [];
    arr.push({ url, mimeType: a.mime_type });
    imagesByMessageId.set(a.message_id, arr);
  }

  const extractedBlock = buildExtractedDocumentsBlock(extractedDocuments);

  const { model, reason } = chooseBotCatModel({
    lastUserMessage: message,
    hasUserAttachments: attachments.length > 0,
  });

  const messages: any[] = [
    {
      role: "system",
      content: systemPrompt,
    },
  ];

  for (const m of history) {
    if (m.role === "User") {
      const imgs = imagesByMessageId.get(m.message_id) ?? [];
      if (imgs.length === 0) {
        messages.push({ role: "user", content: m.content_original_md });
      } else {
        messages.push({
          role: "user",
          content: [
            { type: "text", text: m.content_original_md },
            ...imgs.map((img) => ({ type: "image_url", image_url: { url: img.url } })),
          ],
        });
      }
    }

    if (m.role === "BotCat") {
      messages.push({ role: "assistant", content: m.content_original_md });
    }
  }

  // Current user message with extracted docs + newly uploaded images
  const userContentParts: any[] = [];
  userContentParts.push({ type: "text", text: `${message}${extractedBlock}` });

  for (const a of attachments) {
    if (!isImage(a)) continue;
    const url = a.blobUrlOriginal ?? a.originalUrl;
    if (!url) continue;
    userContentParts.push({ type: "image_url", image_url: { url } });
  }

  messages.push({ role: "user", content: userContentParts });

  const stream = await openai.chat.completions.create({
    model,
    stream: true,
    messages,
  });

  let assistantText = "";

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();

      controller.enqueue(enc.encode(sse("meta", { chatName, model, modelReason: reason })));

      try {
        for await (const chunk of stream) {
          const delta = chunk.choices?.[0]?.delta?.content ?? "";
          if (typeof delta === "string" && delta.length > 0) {
            assistantText += delta;
            controller.enqueue(enc.encode(sse("delta", { delta })));
          }
        }

        // Consent marker handling
        const hasConsent = assistantText.includes(CONSENT_MARKER);
        if (hasConsent) {
          assistantText = assistantText.split(CONSENT_MARKER).join("").trimEnd();

          try {
            const { finalizeConversationByChatName } = await import(
              "@/server/finalization/finalizeConversation"
            );
            await finalizeConversationByChatName({
              chatName,
              reason: "consent_true",
            });

            const reply = `${assistantText}\n\n${CONSENT_SUCCESS_TEXT}`.trim();
            controller.enqueue(enc.encode(sse("final", { reply, closeChat: true })));
            controller.close();
            return;
          } catch {
            const reply = `${assistantText}\n\n${CONSENT_ERROR_TEXT}`.trim();
            controller.enqueue(
              enc.encode(sse("final", { reply, closeChat: false, consentOk: false }))
            );
            controller.close();
            return;
          }
        }

        // Image generation (if requested by the text model)
        let { cleanedText, prompt } = extractImageRequest(assistantText);

        // Fallback: if user clearly asked for an image but the model didn't emit the marker.
        if (!prompt && isLikelyImageRequest(message)) {
          try {
            const userLang = detectedLang ?? "the user's language";
            const markerText = await requestImageMarkerFromTextModel({
              model,
              userText: message,
              userLang,
            });
            if (markerText) {
              const extracted = extractImageRequest(markerText);
              cleanedText = extracted.cleanedText;
              prompt = extracted.prompt;
            }
          } catch {
            // ignore fallback failures, proceed with normal text reply
          }
        }

        if (prompt) {
          const botMessageId = buildMessageId("b");
          const attachmentId = crypto.randomUUID();

          // Ensure message exists for FK, then create attachment.
          const last = await prisma.message.findFirst({
            where: { conversation_id: conversation.id },
            orderBy: { sequence: "desc" },
            select: { sequence: true },
          });
          const nextSeq = (last?.sequence ?? 0) + 1;

          const img = await generateBotImagePng(prompt);

          const uploaded = await put(
            `bot_generated/${conversation.id}/${img.fileName}`,
            img.bytes,
            {
              access: "public",
              contentType: img.mimeType,
              addRandomSuffix: true,
            }
          );

          await prisma.message.create({
            data: {
              conversation_id: conversation.id,
              message_id: botMessageId,
              role: "BotCat",
              content_original_md: cleanedText || "(bot generated image)",
              content_translated_md: null,
              has_attachments: true,
              has_links: false,
              is_voice: false,
              created_at: new Date(),
              sequence: nextSeq,
            },
          });

          // Increment message_count for bot message
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              message_count: { increment: 1 },
              last_activity_at: new Date(),
            },
          });

          await prisma.attachment.create({
            data: {
              id: attachmentId,
              conversation_id: conversation.id,
              message_id: botMessageId,
              kind: "bot_generated",
              file_name: img.fileName,
              mime_type: img.mimeType,
              file_size_bytes: img.bytes.length,
              page_count: null,
              external_url: null,
              blob_url_original: uploaded.url,
              blob_url_preview: null,
              expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              deleted_at: null,
            },
          });

          const botAttachment: BotCatAttachment = {
            attachmentId,
            messageId: botMessageId,
            kind: "bot_generated",
            fileName: img.fileName,
            mimeType: img.mimeType,
            fileSizeBytes: img.bytes.length,
            pageCount: null,
            originalUrl: uploaded.url,
            blobUrlOriginal: uploaded.url,
            blobUrlPreview: null,
          };

          controller.enqueue(
            enc.encode(
              sse("final", {
                reply: cleanedText,
                attachments: [botAttachment],
                imageModel: img.model,
                imageModelReason: img.modelReason,
                imageQuality: img.quality,
              })
            )
          );
          controller.close();
          return;
        }

        const lastSeq = await prisma.message.findFirst({
          where: { conversation_id: conversation.id },
          orderBy: { sequence: "desc" },
          select: { sequence: true },
        });
        const nextSeq = (lastSeq?.sequence ?? 0) + 1;

        await prisma.message.create({
          data: {
            conversation_id: conversation.id,
            message_id: buildMessageId("b"),
            role: "BotCat",
            content_original_md: assistantText,
            content_translated_md: null,
            has_attachments: false,
            has_links: false,
            is_voice: false,
            created_at: new Date(),
            sequence: nextSeq,
          },
        });

        // Increment message_count for bot message
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            message_count: { increment: 1 },
            last_activity_at: new Date(),
          },
        });

        controller.enqueue(enc.encode(sse("final", { reply: assistantText })));
        controller.close();
      } catch (e: any) {
        controller.enqueue(enc.encode(sse("error", { error: e?.message || "Stream error" })));
        controller.close();
      }
    },
  });

  return new NextResponse(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
