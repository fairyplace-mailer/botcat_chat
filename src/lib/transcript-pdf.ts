import type { BotCatFinalJson } from "@/lib/botcat-final-json";
import puppeteer from "puppeteer";

/**
 * Генерация PDF строго ИЗ HTML-страницы /conversations/[chatName].
 */
export async function buildTranscriptPdf(
  data: BotCatFinalJson
): Promise<Uint8Array> {
  const appBaseUrl = process.env.APP_BASE_URL;

  if (!appBaseUrl || !appBaseUrl.trim()) {
    throw new Error("APP_BASE_URL is not set");
  }

  const chatName = data.chatName;
  const htmlUrl = `${appBaseUrl.replace(/\/$/, "")}/conversations/${encodeURIComponent(
    chatName
  )}`;

  const browser = await puppeteer.launch({
    headless: true,
  });

  try {
    const page = await browser.newPage();

    await page.goto(htmlUrl, {
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
