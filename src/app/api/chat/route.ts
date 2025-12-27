import { NextResponse } from "next/server";
import { openai, selectBotCatEmbeddingModel } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import type { BotCatAttachment } from "@/lib/botcat-attachment";
import { chooseBotCatModel } from "@/lib/model-router";

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

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const incomingChatName = normalizeChatName(body?.chatName);

  const message = typeof body?.message === "string" ? body.message : "";
  const attachments: BotCatAttachment[] = Array.isArray(body?.attachments)
    ? body.attachments
    : [];
  const extractedDocuments = Array.isArray(body?.extractedDocuments)
    ? body.extractedDocuments
    : [];

  if (!message.trim() && attachments.length === 0) {
    return NextResponse.json({ ok: false, error: "Empty message" }, { status: 400 });
  }

  const userAgent = typeof body?.client?.userAgent === "string" ? body.client.userAgent : null;
  const sessionId = typeof body?.client?.sessionId === "string" ? body.client.sessionId : null;

  const now = new Date();

  // Create/ensure conversation
  const chatName = incomingChatName ?? `chat_${crypto.randomUUID().slice(0, 8)}`;

  const conversation = await prisma.conversation.upsert({
    where: { chat_name: chatName },
    create: {
      chat_name: chatName,
      // IMPORTANT: sessionId is NOT a User.id. user_id is a FK to User table.
      // Stage 1 uses anonymous sessions, so keep user_id null.
      user_id: null,
      status: "active",
      send_to_internal: true,
      started_at: now,
      finished_at: null,
      last_activity_at: now,
      message_count: 0,
      language_original: "en",
      meta: {},
    },
    update: {
      status: "active",
      last_activity_at: now,
    },
  });

  // Persist user message
  const userMessageId = `FP_${now.toISOString().slice(0, 19).replace(/[:T]/g, "-")}_${crypto.randomUUID().slice(0, 6)}__u_001`;

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

  // Attachments (best-effort)
  if (attachments.length > 0) {
    const attachmentRows = attachments.map((a) => ({
      conversation_id: conversation.id,
      message_id: userMessageId,
      attachment_id: a.attachmentId,
      kind: a.kind,
      file_name: a.fileName ?? null,
      mime_type: a.mimeType ?? null,
      file_size_bytes: a.fileSizeBytes ?? null,
      page_count: a.pageCount ?? null,
      original_url: a.originalUrl ?? null,
      blob_url_original: a.blobUrlOriginal ?? null,
      blob_url_preview: a.blobUrlPreview ?? null,
      expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    }));

    try {
      await prisma.attachment.createMany({ data: attachmentRows, skipDuplicates: true });
    } catch {
      // ignore
    }
  }

  // Embedding best-effort
  try {
    const embeddingModel = selectBotCatEmbeddingModel();
    const emb = await openai.embeddings.create({ model: embeddingModel, input: message });
    const vec = emb.data?.[0]?.embedding;
    if (vec && Array.isArray(vec)) {
      await prisma.messageEmbedding.upsert({
        where: { message_id: userMessageId },
        create: {
          message_id: userMessageId,
          model: embeddingModel,
          embedding: vec as any,
        },
        update: { model: embeddingModel, embedding: vec as any },
      });
    }
  } catch {
    // ignore
  }

  // Read history (simple)
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
      original_url: true,
      mime_type: true,
    },
    orderBy: { created_at: "asc" },
    take: 50,
  });

  const imagesByMessageId = new Map<
    string,
    Array<{ url: string; mimeType: string | null }>
  >();

  for (const a of historyAttachments) {
    const url = a.blob_url_original ?? a.original_url;
    if (!url) continue;
    const arr = imagesByMessageId.get(a.message_id) ?? [];
    arr.push({ url, mimeType: a.mime_type });
    imagesByMessageId.set(a.message_id, arr);
  }

  const extractedBlock = buildExtractedDocumentsBlock(extractedDocuments);

  const systemPrompt =
    "You are BotCat\u0019, a helpful FairyPlace\u0019 consultant. Answer concisely and ask clarifying questions when needed.";

  const extractedDocumentsChars = Array.isArray(extractedDocuments)
    ? extractedDocuments.reduce((sum: number, d: any) => {
        const t = typeof d?.text === "string" ? d.text : "";
        return sum + t.length;
      }, 0)
    : 0;

  const { model, reason } = chooseBotCatModel({
    message,
    extractedDocumentsChars,
    hasImages: attachments.some(isImage) || historyAttachments.length > 0,
    historyMessagesCount: history.length,
  });

  const messages: any[] = [{ role: "system", content: systemPrompt }];

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
            // finalize immediately
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
