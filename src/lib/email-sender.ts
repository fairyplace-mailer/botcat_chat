import type { BotCatFinalJson } from "@/lib/botcat-final-json";

function getResend() {
  // Import lazily to prevent build-time failures when env is not present.
  // Next.js may evaluate modules during build/page-data collection.
  // Runtime requests will still require RESEND_API_KEY.
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing API key. Set RESEND_API_KEY to send emails via Resend."
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Resend } = require("resend") as typeof import("resend");
  return new Resend(apiKey);
}

function buildTranscriptLinks(chatName: string) {
  const staticBaseUrl = (process.env.STATIC_BASE_URL ?? "").replace(/\/$/, "");

  if (!staticBaseUrl) {
    return {
      htmlUrl: "",
      pdfUrl: "",
    };
  }

  return {
    htmlUrl: `${staticBaseUrl}/t/${encodeURIComponent(chatName)}/html`,
    pdfUrl: `${staticBaseUrl}/t/${encodeURIComponent(chatName)}/pdf`,
  };
}

function buildBrief(finalJson: BotCatFinalJson) {
  const brief = (finalJson.preamble_md ?? "").trim();
  if (brief) return brief;

  // Fallback (should be rare): show first 400 chars of dialog
  const firstText = finalJson.messages.map((m) => m.contentOriginal_md).join("\n");
  return firstText.slice(0, 400);
}

export async function sendTranscriptEmail(params: {
  kind: "internal" | "client";
  to: string;
  finalJson: BotCatFinalJson;
}) {
  const { kind, to, finalJson } = params;

  const resend = getResend();

  const { htmlUrl, pdfUrl } = buildTranscriptLinks(finalJson.chatName);
  const brief = buildBrief(finalJson);

  const headerUrl = "https://static.fairyplace.net/header.v3.png";

  const footerInternalLines = [
    "Email with conversation materials. Links are valid for 30 days",
    "Sent by FairyPlace\u0016\u0019 Mailer",
  ];

  const footerClientLines = [
    "Email with conversation materials. Links are valid for 30 days",
    "Sent by FairyPlace\u0016\u0019 Mailer",
  ];

  const footerLines = kind === "internal" ? footerInternalLines : footerClientLines;

  const subject =
    kind === "internal"
      ? `BotCat Transcript: ${finalJson.chatName}`
      : `Your BotCat Transcript: ${finalJson.chatName}`;

  const html = `
  <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; line-height:1.4">
    <div><img src="${headerUrl}" alt="FairyPlace" style="max-width:100%;height:auto" /></div>

    <h2 style="margin:16px 0 8px 0">BotCat Transcript</h2>

    <div style="margin:8px 0"><b>Original Language:</b> ${finalJson.languageOriginal}</div>

    <div style="margin:12px 0">
      <b>Brief:</b>
      <div style="white-space:pre-wrap">${escapeHtml(brief)}</div>
    </div>

    <div style="margin:12px 0">
      <b>Transcript HTML:</b>
      <div><a href="${htmlUrl}">${htmlUrl}</a></div>
    </div>

    <div style="margin:12px 0">
      <b>Transcript PDF:</b>
      <div><a href="${pdfUrl}">${pdfUrl}</a></div>
    </div>

    <hr style="margin:16px 0" />

    <div style="color:#444">
      ${footerLines.map((l) => `<div>${escapeHtml(l)}</div>`).join("\n")}
    </div>
  </div>
  `;

  const res = await resend.emails.send({
    from: process.env.MAIL_FROM ?? "FairyPlace BotCat <no-reply@fairyplace.net>",
    to,
    subject,
    html,
  });

  if (res.error) {
    throw new Error(res.error.message);
  }

  return res.data;
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
