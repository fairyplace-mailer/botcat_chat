import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

/**
 * PDF generation must be based on HTML content (not remote URLs) to guarantee
 * full identity between HTML and PDF and to avoid APP_BASE_URL dependency.
 */
export async function buildPdfFromHtml(html: string): Promise<Uint8Array> {
  if (!html || !html.trim()) {
    throw new Error("buildPdfFromHtml: html is empty");
  }

  // Vercel serverless/edge environments don't ship a system Chrome.
  // Use a bundled Chromium compatible with serverless runtimes.
  const executablePath = await chromium.executablePath();

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: chromium.headless,
  });

  try {
    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: "networkidle0",
    });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "20mm",
        right: "15mm",
        bottom: "20mm",
        left: "15mm",
      },
    });

    return new Uint8Array(pdfBuffer);
  } finally {
    await browser.close();
  }
}
