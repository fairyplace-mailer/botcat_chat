import type { BotCatTextModelKind } from "@/lib/openai";
import { selectBotCatTextModel } from "@/lib/openai";

export type ChooseBotCatModelInput = {
  message: string;
  extractedDocumentsChars: number;
  hasImages: boolean;
  historyMessagesCount: number;
};

export type ChooseBotCatModelResult = {
  kind: BotCatTextModelKind;
  model: string;
  reason: string;
};

/**
 * Policy-only model router.
 *
 * Responsibilities:
 * - decide which *kind* of text model to use (chat/chat_strong/reasoning)
 * - provide an explainable reason (for logging/SSE meta)
 *
 * Non-responsibilities:
 * - calling OpenAI
 * - transforming messages into OpenAI API format
 */
export function chooseBotCatModel(input: ChooseBotCatModelInput): ChooseBotCatModelResult {
  const text = input.message;
  const lower = text.toLowerCase();
  const len = text.length;

  const reasoningHints = [
    "step by step",
    "reasoning",
    "prove",
    "обоснуй",
    "пошагово",
  ];

  // Heaviest bucket first.
  if (len > 2000 || reasoningHints.some((k) => lower.includes(k))) {
    const kind: BotCatTextModelKind = "reasoning";
    return {
      kind,
      model: selectBotCatTextModel(kind),
      reason: `reasoning: len=${len} hints=${reasoningHints.filter((k) => lower.includes(k)).join(",")}`,
    };
  }

  // Strong chat when input is large or includes documents/images.
  if (len > 800) {
    const kind: BotCatTextModelKind = "chat_strong";
    return {
      kind,
      model: selectBotCatTextModel(kind),
      reason: `chat_strong: len=${len} (>800)`,
    };
  }

  if (input.extractedDocumentsChars > 0) {
    const kind: BotCatTextModelKind = "chat_strong";
    return {
      kind,
      model: selectBotCatTextModel(kind),
      reason: `chat_strong: extractedDocumentsChars=${input.extractedDocumentsChars}`,
    };
  }

  if (input.hasImages) {
    const kind: BotCatTextModelKind = "chat_strong";
    return {
      kind,
      model: selectBotCatTextModel(kind),
      reason: `chat_strong: hasImages=true`,
    };
  }

  // Default.
  {
    const kind: BotCatTextModelKind = "chat";
    return {
      kind,
      model: selectBotCatTextModel(kind),
      reason: `chat: default (len=${len})`,
    };
  }
}
