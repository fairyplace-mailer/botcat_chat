/**
 * Есть ли в тексте ссылки (по исходному markdown).
 * Простейшая, но достаточная эвристика по URL.
 */
export function detectHasLinks(md: string): boolean {
  const text = md || "";
  const urlRegex =
    /(https?:\/\/[^\s)]+|\bwww\.[^\s)]+|\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i;

  return urlRegex.test(text);
}

/**
 * Является ли сообщение голосовым.
 * По ТЗ: STT добавляет префикс [voice].
 */
export function detectIsVoice(md: string): boolean {
  const text = (md || "").trimStart().toLowerCase();
  return text.startsWith("[voice]");
}
