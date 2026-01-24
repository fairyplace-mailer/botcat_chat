export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function stripHtmlToText(html: string): string {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");

  s = s.replace(
    /<(br|\/p|\/div|\/li|\/h\d|\/tr|\/section|\/article)>/gi,
    "\n"
  );
  s = s.replace(/<[^>]+>/g, " ");

  s = s
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'");

  return normalizeWhitespace(s);
}

export function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  return normalizeWhitespace(stripHtmlToText(m[1]));
}

export function extractMainContentHtml(html: string): string {
  const tryTag = (tag: string): string | null => {
    const re = new RegExp(
      `<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`,
      "i"
    );
    const m = html.match(re);
    return m?.[1] ? String(m[1]) : null;
  };

  const main = tryTag("main");
  if (main && main.length > 200) return main;

  const article = tryTag("article");
  if (article && article.length > 200) return article;

  const sectionRe = /<section\b[^>]*>([\s\S]*?)<\/section>/gi;
  let best: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = sectionRe.exec(html))) {
    const body = m[1] ?? "";
    if (!best || body.length > best.length) best = body;
  }
  if (best && best.length > 200) return best;

  return html;
}

export function htmlToMarkdownishForHash(
  html: string,
  title: string | null
): string {
  // NOTE: This is intentionally a fast deterministic HTML->text approach.
  // We treat the output as markdown-ish content (stable for hashing and chunking).
  const mainHtml = extractMainContentHtml(html);
  const text = stripHtmlToText(mainHtml);
  if (title) return `# ${title}\n\n${text}`;
  return text;
}
