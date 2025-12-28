import { franc } from "franc-min";
import iso6393To1 from "iso-639-3-to-1";

/**
 * Best-effort language detection.
 * Returns ISO-639-1 code (e.g. "en", "uk", "ru"), or null if unknown.
 */
export function detectLanguageIso6391(text: string): string | null {
  const input = typeof text === "string" ? text.trim() : "";
  if (input.length < 12) return null;

  const iso6393 = franc(input, { minLength: 12 });
  if (!iso6393 || iso6393 === "und") return null;

  const iso1 = iso6393To1(iso6393);
  if (!iso1 || typeof iso1 !== "string") return null;

  const out = iso1.trim().toLowerCase();
  if (!out) return null;

  return out;
}
