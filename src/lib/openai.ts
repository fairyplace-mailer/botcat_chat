import OpenAI from "openai";
import { env } from "./env";

if (!env.OPENAI_API_KEY) {
  console.warn("[BotCat] OPENAI_API_KEY is not set in environment variables.");
}

export const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

export type BotCatModelKind = "chat" | "reasoning" | "finalize";

/**
 * Выбор модели по типу задачи (Dynamic Model Selection).
 * Логика согласована с ТЗ: gpt-4.1-mini — основной, o3-mini — reasoning.
 */
export function selectBotCatModel(kind: BotCatModelKind): string {
  switch (kind) {
    case "reasoning":
      return env.OPENAI_MODEL_REASONING || "o3-mini";
    case "finalize":
      // Для финального JSON всегда gpt-4.1-mini
      return "gpt-4.1-mini";
    case "chat":
    default:
      return env.OPENAI_MODEL_CHAT || "gpt-4.1-mini";
  }
}
