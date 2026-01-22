import OpenAI from "openai";
import { env } from "./env";

if (!env.OPENAI_API_KEY) {
  console.warn("[BotCat] OPENAI_API_KEY is not set in environment variables.");
}

export const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

export type BotCatTextModelKind = "chat" | "chat_strong" | "reasoning";

/**
 * Dynamic Model Selection (text).
 * Source of truth: src/lib/env.ts
 */
export function selectBotCatTextModel(kind: BotCatTextModelKind): string {
  switch (kind) {
    case "chat_strong":
      return env.OPENAI_MODEL_CHAT_STRONG;
    case "reasoning":
      return env.OPENAI_MODEL_REASONING;
    case "chat":
    default:
      return env.OPENAI_MODEL_CHAT;
  }
}

/**
 * RAG spec: embeddings must be fixed to text-embedding-3-small (1536 dims).
 * Do not make this dynamic via env.
 */
export function selectBotCatEmbeddingModel(): string {
  return "text-embedding-3-small";
}

export function selectBotCatImageModel(quality: "standard" | "high" = "standard"): string {
  return quality === "high" ? env.OPENAI_MODEL_IMAGE_HIGH : env.OPENAI_MODEL_IMAGE;
}
