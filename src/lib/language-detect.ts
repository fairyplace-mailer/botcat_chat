import { franc } from "franc-min";

const ISO3_TO_ISO1: Record<string, string> = {
  eng: "en",
  rus: "ru",
  ukr: "uk",
  deu: "de",
  fra: "fr",
  spa: "es",
  ita: "it",
  por: "pt",
  nld: "nl",
  pol: "pl",
  ces: "cs",
  slk: "sk",
  hun: "hu",
  ron: "ro",
  bul: "bg",
  ell: "el",
  tur: "tr",
  ara: "ar",
  heb: "he",
  hin: "hi",
  ben: "bn",
  urd: "ur",
  ind: "id",
  vie: "vi",
  tha: "th",
  jpn: "ja",
  kor: "ko",
  zho: "zh",
  cmn: "zh",
};

/**
 * Best-effort language detection.
 * Returns ISO-639-1 code (e.g. "en", "uk", "ru"), or null if unknown.
 */
export function detectLanguageIso6391(text: string): string | null {
  const input = typeof text === "string" ? text.trim() : "";
  if (input.length < 12) return null;

  const iso3 = franc(input, { minLength: 12 });
  if (!iso3 || iso3 === "und") return null;

  const iso1 = ISO3_TO_ISO1[iso3];
  if (!iso1) return null;

  return iso1;
}
