import puppeteer from "puppeteer";

/**
 * PDF generation must be based on HTML content (not remote URLs) to guarantee
 * full identity between HTML and PDF and to avoid APP_BASE_URL dependency.
 */
export async function buildPdfFromHtml(html: string): Promise<Uint8Array> {
  if (!html || !html.trim()) {
    throw new Error("buildPdfFromHtml: html is empty");
  }

  const browser = await puppeteer.launch({
    headless: true,
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
