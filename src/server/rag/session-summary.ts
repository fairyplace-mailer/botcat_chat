import { openai } from "@/lib/openai";
import { prisma } from "@/lib/prisma";

const DEFAULT_EVERY_N_MESSAGES = 4;

export type UpdateSessionSummaryResult =
  | { updated: false; reason: "not_needed" | "no_conversation" | "no_messages" }
  | { updated: true; summary: string };

function shouldUpdateSummary(messageCount: number, everyNMessages: number) {
  if (everyNMessages <= 0) return false;
  return messageCount % everyNMessages === 0;
}

function coerceString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function clampSummary(s: string): string {
  // Spec wants <= 500 tokens. We approximate with chars to keep it simple and cheap.
  // 2000 chars is a conservative cap.
  const t = s.trim();
  if (t.length <= 2000) return t;
  return t.slice(0, 2000).trim();
}

export async function updateSessionSummaryIfNeeded(opts: {
  chatName: string;
  everyNMessages?: number;
}): Promise<UpdateSessionSummaryResult> {
  const everyNMessages = opts.everyNMessages ?? DEFAULT_EVERY_N_MESSAGES;

  const convo = await prisma.conversation.findUnique({
    where: { chat_name: opts.chatName },
    select: { id: true, meta: true, message_count: true },
  });
  if (!convo) return { updated: false, reason: "no_conversation" };

  // Use message_count as lightweight trigger.
  if (!shouldUpdateSummary(convo.message_count, everyNMessages)) {
    return { updated: false, reason: "not_needed" };
  }

  const lastMessages = await prisma.message.findMany({
    where: { conversation_id: convo.id },
    orderBy: { sequence: "desc" },
    take: 20,
    select: { role: true, content_original_md: true },
  });

  if (lastMessages.length === 0) return { updated: false, reason: "no_messages" };

  const meta = (convo.meta ?? {}) as any;
  const oldSummary = coerceString(meta.sessionSummary);

  const transcript = lastMessages
    .slice()
    .reverse()
    .map((m) => `${m.role}: ${m.content_original_md}`)
    .join("\n\n");

  const system =
    "You are a summarizer. Update the session summary for a chat assistant. " +
    "Keep only stable facts about the user, their goals, constraints, preferences, and any collected order details. " +
    "Do NOT include raw message history, quotes, or excessive detail. Output plain text only.";

  const user =
    `Previous summary (may be empty):\n${oldSummary || "(empty)"}\n\n` +
    `Recent messages:\n${transcript}\n\n` +
    "Return updated summary (<= 500 tokens, concise).";

  const resp = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL_CHAT_STRONG ?? process.env.OPENAI_MODEL_CHAT ?? "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const summary = clampSummary(resp.choices?.[0]?.message?.content ?? "");

  await prisma.conversation.update({
    where: { id: convo.id },
    data: {
      meta: {
        ...(meta ?? {}),
        sessionSummary: summary,
      },
    },
  });

  return { updated: true, summary };
}
