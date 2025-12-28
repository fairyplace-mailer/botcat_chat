import { selectBotCatTextModel, selectBotCatImageModel } from "@/lib/openai";

export type BotCatTextModelKind = "chat" | "chat_strong" | "reasoning";
export type BotCatImageQuality = "standard" | "high";

export function chooseBotCatModel(opts: {
  lastUserMessage: string;
  hasUserAttachments: boolean;
}): { kind: BotCatTextModelKind; model: string; reason: string } {
  const text = (opts.lastUserMessage || "").toLowerCase();

  // Policy (Stage 1): keep reasoning only for explicit cases.
  // NOTE: keywords include RU/UA to match real prompts.
  const reasoningHints = [
    "step by step",
    "chain of thought",
    "обоснуй",
    "пошагово",
    "поясни ход",
    "логика",
  ];

  const strongHints = [
    "contract",
    "legal",
    "compliance",
    "policy",
    "spec",
    "тз",
    "договор",
  ];

  if (reasoningHints.some((h) => text.includes(h))) {
    return {
      kind: "reasoning",
      model: selectBotCatTextModel("reasoning"),
      reason: "explicit reasoning keywords",
    };
  }

  if (opts.hasUserAttachments || strongHints.some((h) => text.includes(h))) {
    return {
      kind: "chat_strong",
      model: selectBotCatTextModel("chat_strong"),
      reason: opts.hasUserAttachments
        ? "user has attachments"
        : "strong keywords",
    };
  }

  return {
    kind: "chat",
    model: selectBotCatTextModel("chat"),
    reason: "default",
  };
}

export function chooseBotCatImageModel(opts: {
  prompt: string;
}): { quality: BotCatImageQuality; model: string; reason: string } {
  const p = (opts.prompt || "").toLowerCase();

  const highHints = [
    "moodboard",
    "mood board",
    "photorealistic",
    "key visual",
    "client",
    "мудборд",
    "фотореалістич",
    "фотореалист",
    "ключевой визуал",
    "для клиента",
  ];

  const quality: BotCatImageQuality = highHints.some((h) => p.includes(h))
    ? "high"
    : "standard";

  return {
    quality,
    model: selectBotCatImageModel(quality),
    reason: quality === "high" ? "high-quality keywords" : "default",
  };
}
