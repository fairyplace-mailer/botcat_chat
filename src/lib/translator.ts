import OpenAI from "openai";
import { env } from "@/lib/env";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type DetectAndTranslateResult = {
  language_original: string;
  translated_md: string;
};

/**
 *  LEGACY 
 * Used in early versions. Kept for backward compatibility.
 */
export async function detectAndTranslate(
  content_original_md: string
): Promise<DetectAndTranslateResult> {
  const trimmed = content_original_md.trim();

  if (!trimmed) {
    return {
      language_original: "und",
      translated_md: "",
    };
  }

  const instructions = `
  LEGACY  


 

  LEGACY prompt.

Return STRICTLY one JSON object:
{
  "language_original": "ru | en | ... | und",
  "translated_md": "..."
}
`;

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    instructions,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: trimmed }],
      },
    ],
  });

  const output = (response.output_text ?? "").toString().trim();

  if (!output) {
    return {
      language_original: "und",
      translated_md: "",
    };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(output);
  } catch {
    return {
      language_original: "und",
      translated_md: trimmed,
    };
  }

  const language_original =
    typeof parsed.language_original === "string" &&
    parsed.language_original.trim() !== ""
      ? parsed.language_original.trim()
      : "und";

  const translated_md =
    typeof parsed.translated_md === "string" ? parsed.translated_md : "";

  return {
    language_original,
    translated_md,
  };
}

export type MessageForTranslation = {
  messageId: string;
  role: "User" | "BotCat";
  contentOriginal_md: string;
};

export type TranslatedMessageResult = {
  messageId: string;
  role: "User" | "BotCat";
  contentTranslated_md: string;
  language: "ru";
};

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

/**
 * Build translatedMessages per TZ (docs/spec.md + docs/spec_initial.md).
 *
 * Rules:
 * - If languageOriginal === "ru"  do NOT translate, copy original.
 * - Else translate ALL messages to RU.
 * - Never translate proper names, numbers, code, URLs.
 * - Preserve markdown structure.
 */
export async function translateMessagesToRu(params: {
  languageOriginal: string;
  messages: MessageForTranslation[];
}): Promise<TranslatedMessageResult[]> {
  const languageOriginal = String(params.languageOriginal || "").trim();

  // TZ: if ru, translation = original for all messageId.
  if (languageOriginal === "ru") {
    return params.messages.map((m) => ({
      messageId: m.messageId,
      role: m.role,
      contentTranslated_md: m.contentOriginal_md,
      language: "ru" as const,
    }));
  }

  const messages = params.messages
    .map((m) => ({
      messageId: m.messageId,
      role: m.role,
      contentOriginal_md: String(m.contentOriginal_md ?? ""),
    }))
    .filter((m) => m.messageId && m.contentOriginal_md.trim() !== "");

  if (messages.length === 0) {
    return [];
  }

  const instructions = `
You translate a chat transcript to Russian.

INPUT: JSON array of items { messageId, role, contentOriginal_md }.
OUTPUT: JSON array of items { messageId, role, contentTranslated_md }.

Rules (MANDATORY):
- Translate to Russian.
- Preserve Markdown formatting and structure.
- NEVER translate: proper names, brand names, product names, numbers, code, URLs.
- Keep messageId and role unchanged.
- Return STRICTLY a JSON array. No extra text.
`;

  const response = await client.responses.create({
    model: env.OPENAI_MODEL_CHAT,
    instructions,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: JSON.stringify(messages) }],
      },
    ],
  });

  const output = (response.output_text ?? "").toString().trim();
  const parsed = safeJsonParse<
    Array<{ messageId: string; role: "User" | "BotCat"; contentTranslated_md: string }>
  >(output);

  if (!parsed) {
    throw new Error("translateMessagesToRu: model did not return valid JSON");
  }

  const byId: Record<string, { role: "User" | "BotCat"; contentTranslated_md: string }> = {};
  for (const item of parsed) {
    if (!item?.messageId || typeof item.contentTranslated_md !== "string") continue;
    byId[item.messageId] = {
      role: item.role,
      contentTranslated_md: item.contentTranslated_md,
    };
  }

  // Ensure all input messages present.
  const result: TranslatedMessageResult[] = [];
  for (const m of messages) {
    const t = byId[m.messageId];
    if (!t) {
      throw new Error(
        `translateMessagesToRu: missing translation for messageId=${m.messageId}`
      );
    }

    result.push({
      messageId: m.messageId,
      role: m.role,
      contentTranslated_md: t.contentTranslated_md,
      language: "ru" as const,
    });
  }

  return result;
}
