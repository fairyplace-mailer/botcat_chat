export type DocumentExtractionLimits = {
  /** Max characters returned per file */
  maxChars: number;
  /** Max pages extracted for PDF */
  maxPdfPages: number;
};

export const DEFAULT_EXTRACTION_LIMITS: DocumentExtractionLimits = {
  maxChars: 20_000,
  maxPdfPages: 8,
};

function trimText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    // collapse 3+ newlines
    .replace(/\n{3,}/g, "\n\n")
    // collapse long spaces
    .replace(/[\t ]{2,}/g, " ")
    .trim();
}

export async function extractTextFromPlainTextFile(
  file: File,
  limits: DocumentExtractionLimits,
): Promise<string> {
  const raw = await file.text();
  return trimText(normalizeWhitespace(raw), limits.maxChars);
}

export async function extractTextFromDocx(
  file: File,
  limits: DocumentExtractionLimits,
): Promise<string> {
  const mammoth = await import("mammoth/mammoth.browser");
  const arrayBuffer = await file.arrayBuffer();

  const result = await mammoth.extractRawText({ arrayBuffer });
  const text = result.value ?? "";
  return trimText(normalizeWhitespace(text), limits.maxChars);
}

export async function extractTextFromPdf(
  file: File,
  limits: DocumentExtractionLimits,
): Promise<string> {
  // pdfjs-dist v4 supports ESM imports. Use legacy build for easier browser usage.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // Ensure worker is set (worker is bundled by Next; this path works in many setups).
  // If this path fails in runtime, we will need to ship a worker asset explicitly.
  // For now we keep it minimal and rely on bundler.
  try {
    // @ts-expect-error runtime field
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.mjs",
      import.meta.url,
    ).toString();
  } catch {
    // ignore; pdfjs may still work with fake worker in some bundlers
  }

  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const doc = await loadingTask.promise;

  const maxPages = Math.min(doc.numPages, limits.maxPdfPages);
  const parts: string[] = [];

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent();

    const items = (textContent.items ?? []) as Array<{ str?: string }>;
    const pageText = items.map((it) => it.str ?? "").join(" ");
    parts.push(`--- PAGE ${pageNum}/${doc.numPages} ---\n${pageText}`);

    // early cut if we already exceed max chars
    if (parts.join("\n\n").length > limits.maxChars) break;
  }

  const joined = parts.join("\n\n");
  return trimText(normalizeWhitespace(joined), limits.maxChars);
}

export function isNonImageExtractableMime(mime: string | null | undefined): boolean {
  if (!mime) return false;
  if (mime.startsWith("image/")) return false;
  return [
    "text/plain",
    "text/markdown",
    "application/json",
    "text/csv",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/rtf",
  ].includes(mime);
}
