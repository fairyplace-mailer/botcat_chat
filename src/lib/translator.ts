import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type DetectAndTranslateResult = {
  language_original: string;
  translated_md: string;
};

/**
 * Определяет язык исходного текста и даёт перевод на русский.
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
Ты — сервис автоопределения языка и перевода текста.

1) Определи язык входного текста. Верни ISO-код:
   ru, en, de, es, fr, it, pt, zh, ja …
   Если язык не определить — "und".

2) Переведи текст на русский (если не русский). Markdown сохраняй.

3) ВЫВЕДИ СТРОГО ОДИН JSON-ОБЪЕКТ:
{
  "language_original": "ru | en | ...",
  "translated_md": "..."
}
БЕЗ каких-либо комментариев, текста до или после JSON.
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
    // без response_format и без text.format — обычный текстовый вывод
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
    // Если вдруг модель не уложилась в строгий JSON — подстраховка
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
