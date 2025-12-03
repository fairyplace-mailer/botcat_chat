import OpenAI from "openai";
import { BOTCAT_SYSTEM_PROMPT } from "@/lib/botcat-system";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type BotcatChatParams = {
  chatName: string | null;
  message: string;
};

export type BotcatChatResult = {
  reply: string;
  model: string;
};

/**
 * Простая эвристика выбора модели по ТЗ:
 * - gpt-4.1-mini — дефолт, все обычные диалоги.
 * - gpt-4.1 — сложные/длинные экспертные запросы.
 * - o3-mini — тяжёлое reasoning, очень длинные и аналитические блоки.
 */
function selectModelForMessage(message: string): {
  model: string;
  reasoningEffort?: "low" | "medium" | "high";
} {
  const text = message.toLowerCase();
  const length = message.length;

  // Очень длинные и "reasoning" запросы → o3-mini
  const reasoningKeywords = [
    "логическая цепочка",
    "пошагово",
    "step by step",
    "сложный анализ",
    "докажи",
    "обоснуй",
    "reasoning",
  ];

  if (
    length > 2000 ||
    reasoningKeywords.some((kw) => text.includes(kw))
  ) {
    return {
      model: "o3-mini",
      reasoningEffort: "medium",
    };
  }

  // Усиленная экспертиза → gpt-4.1
  const expertKeywords = [
    "сложный",
    "глубокий анализ",
    "аналитика",
    "moodboard",
    "мудборд",
    "print-concept",
    "print concept",
    "таблица",
    "структура данных",
  ];

  if (length > 800 || expertKeywords.some((kw) => text.includes(kw))) {
    return {
      model: "gpt-4.1",
    };
  }

  // Основной режим
  return {
    model: "gpt-4.1-mini",
  };
}

/**
 * Основная функция диалога BotCat.
 * Возвращает текст ответа и фактическую модель.
 */
export async function botcatChat(
  params: BotcatChatParams
): Promise<BotcatChatResult> {
  const { message } = params;

  const { model, reasoningEffort } = selectModelForMessage(message);

  const response = await client.responses.create({
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
    ...(model === "o3-mini"
      ? {
          reasoning: {
            effort: reasoningEffort ?? "medium",
          },
        }
      : {}),
  });

  const reply = (response.output_text ?? "").toString();

  return {
    reply,
    model,
  };
}
