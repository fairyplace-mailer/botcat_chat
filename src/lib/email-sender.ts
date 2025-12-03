import type { BotCatFinalJson } from "@/lib/botcat-final-json";
import type { UploadPdfResult } from "@/lib/google/drive";

/**
 * Тип письма:
 * - internal: для FairyPlace™ (MAIL_TO_INTERNAL)
 * - client: для пользователя (userEmails[])
 */
export type TranscriptEmailKind = "internal" | "client";

type SendTranscriptEmailParams = {
  kind: TranscriptEmailKind;
  to: string;
  finalJson: BotCatFinalJson;
  drive: UploadPdfResult;
};

type ResendSendResult = {
  id: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value.trim();
}

/**
 * Базовая отправка письма через Resend API.
 * Без вложений, только HTML и ссылки, как требует ТЗ.
 */
async function sendEmailWithResend(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<ResendSendResult> {
  const apiKey = requireEnv("RESEND_API_KEY");
  const from = requireEnv("MAIL_FROM");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend API error ${res.status}: ${text}`);
  }

  const data = (await res.json().catch(() => ({}))) as { id?: string };
  const id = data.id ?? "";
  if (!id) {
    throw new Error("Resend API did not return email id");
  }

  return { id };
}

/**
 * Строим ссылки для письма:
 * - HTML-страница: APP_BASE_URL/conversations/<chatName>
 * - PDF: ссылка на файл в Google Drive (по fileId / webViewLink)
 */
function buildTranscriptLinks(params: {
  finalJson: BotCatFinalJson;
  drive: UploadPdfResult;
}): { htmlUrl: string; pdfUrl: string } {
  const appBase = requireEnv("APP_BASE_URL"); // напр. http://localhost:3000 или https://fairyplace.net
  const chatName = params.finalJson.chatName;

  // SSR HTML по ТЗ: /conversations/[chatName]
  const htmlUrl = `${appBase}/conversations/${encodeURIComponent(chatName)}`;

  let pdfUrl: string;
  if (params.drive.webViewLink) {
    pdfUrl = params.drive.webViewLink;
  } else if (params.drive.fileId) {
    pdfUrl = `https://drive.google.com/file/d/${params.drive.fileId}/view?usp=sharing`;
  } else if (params.drive.webContentLink) {
    pdfUrl = params.drive.webContentLink;
  } else {
    // fallback: API-роут генерации PDF
    const base = appBase;
    pdfUrl = `${base}/api/conversations/${encodeURIComponent(chatName)}/pdf`;
  }

  return { htmlUrl, pdfUrl };
}

/**
 * Простейший brief: первые несколько сообщений, обрезанные до 400 символов.
 * Без пересказа, только выдержка из реального текста.
 */
function buildBrief(finalJson: BotCatFinalJson): string {
  const parts: string[] = [];

  for (const msg of finalJson.messages.slice(0, 4)) {
    parts.push(`${msg.role}: ${msg.contentOriginal_md}`);
  }

  const joined = parts.join(" ");
  if (joined.length <= 400) return joined;
  return joined.slice(0, 400) + "…";
}

/**
 * Общий HTML для internal/client-писем.
 */
function buildTranscriptEmailHtml(params: {
  kind: TranscriptEmailKind;
  to: string;
  finalJson: BotCatFinalJson;
  htmlUrl: string;
  pdfUrl: string;
}): string {
  const { finalJson, htmlUrl, pdfUrl, kind } = params;

  const headerUrl = "https://static.fairyplace.net/header.v3.png";

  const originalLanguage = finalJson.languageOriginal || "und";
  const brief = buildBrief(finalJson);

  const footer1Internal =
    finalJson.footerInternal_md?.trim() ||
    "Email with conversation materials. Links are valid for 30 days.";
  const footer1Client =
    finalJson.footerClient_md?.trim() ||
    "Email with conversation materials. Links are valid for 30 days.";

  const footer1 = kind === "internal" ? footer1Internal : footer1Client;

  const footer2Internal = "Sent by FairyPlace™ Mailer";
  const footer2Client =
    "Sent by FairyPlace™ Mailer at the client's request";

  const isInternal = kind === "internal";

  return `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f5f5f5;">
    <div style="max-width:600px;margin:0 auto;padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;">
        <img src="${headerUrl}" alt="FairyPlace header" style="max-width:100%;height:auto;" />
      </div>

      <h2 style="font-size:20px;margin:0 0 16px 0;">Conversation transcript</h2>

      <p style="margin:0 0 8px 0;">
        <strong>Chat name:</strong> ${finalJson.chatName}
      </p>
      <p style="margin:0 0 8px 0;">
        <strong>Original language:</strong> ${originalLanguage}
      </p>

      <h3 style="font-size:16px;margin:16px 0 8px 0;">Brief</h3>
      <p style="margin:0 0 16px 0;white-space:pre-wrap;">${brief}</p>

      <h3 style="font-size:16px;margin:16px 0 8px 0;">Links</h3>
      <ul style="margin:0 0 16px 20px;padding:0;">
        <li style="margin-bottom:8px;">
          <a href="${htmlUrl}" style="color:#2563eb;text-decoration:none;">Open HTML transcript</a>
        </li>
        <li style="margin-bottom:8px;">
          <a href="${pdfUrl}" style="color:#2563eb;text-decoration:none;">Download PDF transcript</a>
        </li>
      </ul>

      <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />

      <p style="font-size:12px;color:#6b7280;margin:0 0 4px 0;">
        ${footer1}
      </p>
      <p style="font-size:12px;color:#6b7280;margin:0;">
        ${isInternal ? footer2Internal : footer2Client}
      </p>
    </div>
  </body>
</html>
`.trim();
}

/**
 * Публичная точка: отправить письмо (internal/client) с материалами стенограммы.
 */
export async function sendTranscriptEmail(
  params: SendTranscriptEmailParams
): Promise<ResendSendResult> {
  const { finalJson, drive, kind, to } = params;

  const { htmlUrl, pdfUrl } = buildTranscriptLinks({ finalJson, drive });

  const subject =
    kind === "internal"
      ? `BotCat Transcript: ${finalJson.chatName}`
      : `Your BotCat Transcript: ${finalJson.chatName}`;

  const html = buildTranscriptEmailHtml({
    kind,
    to,
    finalJson,
    htmlUrl,
    pdfUrl,
  });

  return sendEmailWithResend({
    to,
    subject,
    html,
  });
}
