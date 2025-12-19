import type { BotCatAttachment } from "@/lib/botcat-attachment";

export type ExtractedDocument = {
  attachmentId: string;
  fileName: string | null;
  mimeType: string | null;
  text: string;
};

export type DocumentExtractionLimits = {
  maxChars: number;
  maxPdfPages: number;
};

export const DEFAULT_EXTRACTION_LIMITS: DocumentExtractionLimits = {
  maxChars: 20_000,
  maxPdfPages: 8,
};

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function trimToMaxChars(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[TRIMMED]";
}

export async function extractDocxText(
  file: File,
  limits: DocumentExtractionLimits,
): Promise<string> {
  const mammoth = await import("mammoth/mammoth.browser");
  const arrayBuffer = await file.arrayBuffer();

  const result = await mammoth.extractRawText({ arrayBuffer });
  const text = normalizeWhitespace(result.value || "");
  return trimToMaxChars(text, limits.maxChars);
}

export async function extractPdfText(
  file: File,
  limits: DocumentExtractionLimits,
): Promise<string> {
  // pdfjs-dist works in the browser. We intentionally keep worker configuration minimal
  // to avoid bundler-specific paths; Next/Turbopack can handle it.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const arrayBuffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;

  const pages = Math.min(doc.numPages, limits.maxPdfPages);
  const parts: string[] = [];

  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();

    // pdf.js types are a bit loose here; normalize to string.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = (content as any).items || [];
    const pageText = items
      .map((it) => (typeof it?.str === "string" ? it.str : ""))
      .join(" ");

    parts.push(pageText);
  }

  const text = normalizeWhitespace(parts.join("\n\n"));
  return trimToMaxChars(text, limits.maxChars);
}

export async function extractTextFromTextLikeFile(
  file: File,
  limits: DocumentExtractionLimits,
): Promise<string> {
  const raw = await file.text();
  const text = normalizeWhitespace(raw);
  return trimToMaxChars(text, limits.maxChars);
}

export function isImageAttachment(att: BotCatAttachment): boolean {
  return Boolean(att.mimeType?.startsWith("image/"));
}

export function isDocxAttachment(att: BotCatAttachment): boolean {
  const mt = att.mimeType?.toLowerCase();
  if (mt === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return true;
  return Boolean(att.fileName?.toLowerCase().endsWith(".docx"));
}

export function isPdfAttachment(att: BotCatAttachment): boolean {
  const mt = att.mimeType?.toLowerCase();
  if (mt === "application/pdf") return true;
  return Boolean(att.fileName?.toLowerCase().endsWith(".pdf"));
}

export function isTextLikeAttachment(att: BotCatAttachment): boolean {
  const mt = att.mimeType?.toLowerCase();
  if (!mt) return false;
  return (
    mt.startsWith("text/") ||
    mt === "application/json" ||
    mt === "text/csv" ||
    mt === "application/xml" ||
    mt === "application/x-yaml" ||
    mt === "application/yaml"
  );
}
