import type { BotCatFinalJson } from "@/lib/botcat-final-json";
import type { UploadPdfResult } from "@/lib/google/drive";

/**
 * 243 3334333:
 * - internal: 333 FairyPlace23 (MAIL_TO_INTERNAL)
 * - client: 333 333333333333333333 (userEmails[])
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
 * 133333 33333 333333 333 Resend API.
 * 13 3333333333, 433433 HTML 3 43433333, 333 443434343 21.
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
 * 243333 434333 333 333333 333 22:
 * - HTML: https://static.fairyplace.net/<chatName>.html
 * - PDF:  https://static.fairyplace.net/<chatName>.pdf
 */
function buildTranscriptLinks(params: {
  finalJson: BotCatFinalJson;
}): { htmlUrl: string; pdfUrl: string } {
  const staticBase = requireEnv("STATIC_BASE_URL"); // e.g. https://static.fairyplace.net
  const chatName = params.finalJson.chatName;

  const safe = encodeURIComponent(chatName);
  const htmlUrl = `${staticBase}/${safe}.html`;
  const pdfUrl = `${staticBase}/${safe}.pdf`;

  return { htmlUrl, pdfUrl };
}

function buildBrief(finalJson: BotCatFinalJson): string {
  const preamble = finalJson.preamble_md?.trim();
  if (preamble) return preamble;
  return "";
}

/**
 * 133333 HTML 333 internal/client-3333.
 * 2 22 4333333 333333 33333.
 */
function buildTranscriptEmailHtml(params: {
  kind: TranscriptEmailKind;
  finalJson: BotCatFinalJson;
  htmlUrl: string;
  pdfUrl: string;
}): string {
  const { finalJson, htmlUrl, pdfUrl, kind } = params;

  const headerUrl = "https://static.fairyplace.net/header.v3.png";

  const originalLanguage = finalJson.languageOriginal || "und";
  const brief = buildBrief(finalJson);

  const isInternal = kind === "internal";

  // TT: fixed internal footer
  const footer1Internal = "Email with conversation materials. Links are valid for 30 days";
  const footer2Internal = "Sent by FairyPlace23 Mailer";

  // keep client footer (not used in stage 1, but module can stay)
  const footer1Client = "Email with conversation materials. Links are valid for 30 days";
  const footer2Client = "Sent by FairyPlace23 Mailer at the client's request";

  const footer1 = isInternal ? footer1Internal : footer1Client;
  const footer2 = isInternal ? footer2Internal : footer2Client;

  return `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f5f5f5;">
    <div style="max-width:600px;margin:0 auto;padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;">
        <img src="${headerUrl}" alt="FairyPlace header" style="max-width:100%;height:auto;" />
      </div>

      <p style="margin:0 0 8px 0;"><strong>Original Language</strong>: ${originalLanguage}</p>

      ${brief ? `<p style="margin:0 0 16px 0;white-space:pre-wrap;">${brief}</p>` : ""}

      <p style="margin:0 0 8px 0;">
        <a href="${htmlUrl}" style="color:#2563eb;text-decoration:none;">HTML transcript</a>
      </p>
      <p style="margin:0 0 16px 0;">
        <a href="${pdfUrl}" style="color:#2563eb;text-decoration:none;">PDF transcript</a>
      </p>

      <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />

      <p style="font-size:12px;color:#6b7280;margin:0 0 4px 0;">${footer1}</p>
      <p style="font-size:12px;color:#6b7280;margin:0;">${footer2}</p>
    </div>
  </body>
</html>
`.trim();
}

export async function sendTranscriptEmail(
  params: SendTranscriptEmailParams
): Promise<ResendSendResult> {
  const { finalJson, kind, to } = params;

  const { htmlUrl, pdfUrl } = buildTranscriptLinks({ finalJson });

  const subject =
    kind === "internal"
      ? `BotCat Transcript: ${finalJson.chatName}`
      : `Your BotCat Transcript: ${finalJson.chatName}`;

  const html = buildTranscriptEmailHtml({
    kind,
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
