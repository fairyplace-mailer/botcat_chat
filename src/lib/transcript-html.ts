import { marked } from "marked";
import { BotCatFinalJson } from "@/lib/botcat-final-json";

export type TranscriptMode = "internal" | "public";

/**
 * Генерация HTML-стенограммы в bubble-style.
 * mode:
 *  - "internal"  — только перевод на RU (для FairyPlace™)
 *  - "public"    — только оригинал (для клиента)
 */
export function buildTranscriptHtml(
  data: BotCatFinalJson,
  mode: TranscriptMode = "internal"
): string {
  const {
    chatName,
    preamble_md,
    messages,
    translatedMessages,
    attachments,
    languageOriginal,
  } = data;

  const style = `
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #111827;
    }

    .page {
      max-width: 900px;
      margin: 24px auto;
      padding: 24px;
      background: #ffffff;
    }

    .header {
      text-align: left;
      margin-bottom: 16px;
    }

    .header img {
      width: 100%;
      max-width: 100%;
      height: auto;
      display: block;
    }

    .title-block {
      margin-bottom: 12px;
      text-align: left;
    }

    .title-block h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 500;
      color: #111827;
      word-break: break-all;
    }

    .original-language {
      margin: 4px 0 8px 0;
      font-size: 12px;
      color: #6b7280;
    }

    .preamble {
      margin: 8px 0 16px 0;
      padding: 4px 6px;
      border-radius: 8px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      font-size: 12px;
      color: #111827;
    }

    .preamble p {
      margin: 0;
    }

    .chat {
      margin-top: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .msg-row {
      display: flex;
      width: 100%;
    }

    .msg-row.user {
      justify-content: flex-end;
    }

    .msg-row.bot {
      justify-content: flex-start;
    }

    .msg-bubble {
      width: 85%;
      max-width: 85%;
      padding: 10px 12px;
      border-radius: 16px;
      font-size: 14px;
      line-height: 1.5;
      border: 1px solid transparent;
    }

    /* WhatsApp-style: user = зелёный, bot = светло-серый */

    .msg-row.user .msg-bubble {
      background: #d9fdd3;
      border-color: #b7e4c7;
      color: #111827;
      border-bottom-right-radius: 4px;
    }

    .msg-row.bot .msg-bubble {
      background: #f0f0f0;
      border-color: #e5e7eb;
      color: #111827;
      border-bottom-left-radius: 4px;
    }

    .msg-meta {
      font-size: 11px;
      margin-bottom: 4px;
      opacity: 0.9;
      display: flex;
      justify-content: flex-start;
      gap: 8px;
    }

    .msg-meta .role {
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .msg-body {
      font-size: 14px;
    }

    .msg-body p {
      margin: 0 0 6px 0;
    }

    .msg-body p:last-child {
      margin-bottom: 0;
    }

    .attachments {
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px dashed rgba(148, 163, 184, 0.7);
      font-size: 12px;
    }

    .attachments-title {
      font-weight: 600;
      margin-bottom: 4px;
    }

    .attachment-item {
      margin-bottom: 4px;
    }

    .attachment-item span {
      display: inline-block;
    }

    .footer-block {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #4b5563;
    }

    .footer-block p {
      margin: 0 0 4px 0;
      text-align: left;
    }

    @media print {
      body {
        background: #ffffff;
      }
      .page {
        margin: 0;
        padding: 16px 24px;
      }
    }
  `;

  const md = (s: string) => marked.parse(s || "");

  // attachments по messageId
  const attachmentsByMessage: Record<string, typeof attachments> = {};
  for (const a of attachments) {
    if (!attachmentsByMessage[a.messageId]) {
      attachmentsByMessage[a.messageId] = [];
    }
    attachmentsByMessage[a.messageId].push(a);
  }

  const messageBlocks = messages
    .map((m) => {
      const isUser = m.role === "User";

      // INTERNAL: ВСЕГДА только перевод на RU
      // PUBLIC: только оригинал (на языке клиента)
      let bodySourceMd: string;
      if (mode === "internal") {
        const translated = translatedMessages[m.messageId];
        bodySourceMd =
          translated?.contentTranslated_md ?? m.contentOriginal_md;
      } else {
        bodySourceMd = m.contentOriginal_md;
      }

      const bodyHtml = md(bodySourceMd);

      const atts = attachmentsByMessage[m.messageId] || [];
      const attHtml = atts.length
        ? `
          <div class="attachments">
            <div class="attachments-title">Вложения:</div>
            ${atts
              .map(
                (a) => `
              <div class="attachment-item">
                <span>• ${a.fileName || "(без имени)"} — ${
                  a.mimeType || "?"
                }</span>
                ${
                  a.originalUrl
                    ? `<br /><span>URL: ${a.originalUrl}</span>`
                    : ""
                }
                ${
                  a.blobUrlOriginal
                    ? `<br /><span>Blob original: ${a.blobUrlOriginal}</span>`
                    : ""
                }
                ${
                  a.blobUrlPreview
                    ? `<br /><span>Blob preview: ${a.blobUrlPreview}</span>`
                    : ""
                }
              </div>
            `
              )
              .join("")}
          </div>
        `
        : "";

      return `
        <div class="msg-row ${isUser ? "user" : "bot"}">
          <div class="msg-bubble">
            <div class="msg-meta">
              <span class="role">${m.role}</span>
            </div>
            <div class="msg-body">
              ${bodyHtml}
            </div>
            ${attHtml}
          </div>
        </div>
      `;
    })
    .join("\n");

  const footerHtml =
    mode === "internal"
      ? `
      <div class="footer-block">
        <p>Email with conversation materials. Links are valid for 30 days.</p>
        <p>Sent by FairyPlace™ Mailer</p>
      </div>
    `
      : `
      <div class="footer-block">
        <p>Email with conversation materials. Links are valid for 30 days.</p>
        <p>Sent by FairyPlace™ Mailer at the client's request</p>
      </div>
    `;

  const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>${chatName}</title>
  <style>${style}</style>
</head>
<body>
  <div class="page">
    <div class="header">
      <img src="/header.v3.png" alt="FairyPlace header" />
    </div>

    <div class="title-block">
      <h2>${chatName}</h2>
      <p class="original-language">Original language: ${languageOriginal}</p>
    </div>

    <div class="preamble">
      ${md(preamble_md)}
    </div>

    <div class="chat">
      ${messageBlocks}
    </div>

    ${footerHtml}
  </div>
</body>
</html>
  `.trim();

  return html;
}
