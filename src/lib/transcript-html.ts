import { marked } from "marked";
import { BotCatFinalJson } from "@/lib/botcat-final-json";

export type TranscriptMode = "internal" | "public";

function asTranslatedMap(
  data: BotCatFinalJson
): Record<string, { contentTranslated_md: string; role: "User" | "BotCat" }> {
  const map: Record<string, { contentTranslated_md: string; role: "User" | "BotCat" }> = {};
  for (const tm of data.translatedMessages ?? []) {
    map[tm.messageId] = { contentTranslated_md: tm.contentTranslated_md, role: tm.role };
  }
  return map;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function looksLikeImage(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  return (
    mimeType === "image/png" ||
    mimeType === "image/jpeg" ||
    mimeType === "image/webp"
  );
}

/**
 * Bubble-style transcript renderer.
 * mode:
 *  - "internal"  => use RU translation (unless languageOriginal === "ru")
 *  - "public"    => original only
 */
export function buildTranscriptHtml(
  data: BotCatFinalJson,
  mode: TranscriptMode = "internal"
): string {
  const { chatName, preamble_md, messages, attachments, languageOriginal } =
    data;

  // translatedMessages is an array per spec; build a quick lookup by messageId
  const translatedById = asTranslatedMap(data);

  const style = `
    * { box-sizing: border-box; }

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

    .header { text-align: left; margin-bottom: 16px; }

    .header img {
      width: 100%;
      max-width: 100%;
      height: auto;
      display: block;
    }

    .title-block { margin-bottom: 12px; text-align: left; }

    .title-block h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 500;
      color: #111827;
      word-break: break-all;
    }

    .original-language { margin: 4px 0 8px 0; font-size: 12px; color: #6b7280; }

    .preamble {
      margin: 8px 0 16px 0;
      padding: 8px 10px;
      border-radius: 10px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      font-size: 12px;
      color: #111827;
    }

    .preamble p { margin: 0; }

    .chat {
      margin-top: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .msg-row { display: flex; width: 100%; }
    .msg-row.user { justify-content: flex-end; }
    .msg-row.bot { justify-content: flex-start; }

    .msg-bubble {
      width: 85%;
      max-width: 85%;
      padding: 10px 12px;
      border-radius: 16px;
      font-size: 14px;
      line-height: 1.5;
      border: 1px solid transparent;
    }

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

    .msg-body { font-size: 14px; }

    .msg-body p { margin: 0 0 6px 0; }
    .msg-body p:last-child { margin-bottom: 0; }

    .attachments {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px dashed rgba(148, 163, 184, 0.7);
      font-size: 12px;
    }

    .attachments-title { font-weight: 600; margin-bottom: 6px; }

    .attachment-item { margin-bottom: 10px; }

    .attachment-preview {
      margin-top: 6px;
      max-width: 600px;
      border-radius: 10px;
      border: 1px solid #e5e7eb;
      overflow: hidden;
      background: #fff;
    }

    .attachment-preview img {
      display: block;
      width: 100%;
      height: auto;
    }

    .attachment-links {
      margin-top: 6px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      word-break: break-all;
    }

    .attachment-links a {
      color: #2563eb;
      text-decoration: none;
    }

    .attachment-links a:hover { text-decoration: underline; }

    .footer-block {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #4b5563;
    }

    .footer-block p { margin: 0 0 4px 0; text-align: left; }

    @media print {
      body { background: #ffffff; }
      .page { margin: 0; padding: 16px 24px; }
    }
  `;

  const md = (s: string) => marked.parse(s || "");

  // attachments by messageId
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

      // INTERNAL:
      // - if original language is ru -> use original as "translation" (old spec rule)
      // - else -> use translatedMessages by messageId (fallback to original)
      // PUBLIC: only original
      let bodySourceMd: string;
      if (mode === "internal") {
        if (languageOriginal === "ru") {
          bodySourceMd = m.contentOriginal_md;
        } else {
          const translated = translatedById[m.messageId];
          bodySourceMd = translated?.contentTranslated_md ?? m.contentOriginal_md;
        }
      } else {
        bodySourceMd = m.contentOriginal_md;
      }

      const bodyHtml = md(bodySourceMd);

      const atts = attachmentsByMessage[m.messageId] || [];
      const attHtml = atts.length
        ? `
          <div class="attachments">
            <div class="attachments-title">Attachments:</div>
            ${atts
              .map((a) => {
                const name = escapeHtml(a.fileName || "(no name)");
                const mime = escapeHtml(a.mimeType || "?");

                // IMPORTANT (TT requirement): For images we render ONLY the preview (<=80KB).
                // Never fallback to original image URLs in HTML/PDF.
                const previewUrl = a.blobUrlPreview || null;
                const isImg = looksLikeImage(a.mimeType);

                const previewBlock =
                  isImg && previewUrl
                    ? `
                      <div class="attachment-preview">
                        <img src="${escapeHtml(previewUrl)}" alt="${name}" />
                      </div>
                    `
                    : "";

                const links: { label: string; href: string }[] = [];
                if (a.originalUrl) links.push({ label: "Original URL", href: a.originalUrl });
                if (a.blobUrlOriginal) links.push({ label: "Blob (original)", href: a.blobUrlOriginal });
                if (a.blobUrlPreview) links.push({ label: "Blob (preview)", href: a.blobUrlPreview });

                const linksHtml = links.length
                  ? `
                      <div class="attachment-links">
                        ${links
                          .map(
                            (l) =>
                              `<a href="${escapeHtml(l.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.label)}</a>`
                          )
                          .join("")}
                      </div>
                    `
                  : "";

                return `
                  <div class="attachment-item">
                    <div><strong>${name}</strong></div>
                    <div>${mime}</div>
                    ${previewBlock}
                    ${linksHtml}
                  </div>
                `;
              })
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
            <div class="msg-body">${bodyHtml}</div>
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
  <title>${escapeHtml(chatName)}</title>
  <style>${style}</style>
</head>
<body>
  <div class="page">
    <div class="header">
      <img src="https://static.fairyplace.net/header.v3.png" alt="FairyPlace header" />
    </div>

    <div class="title-block">
      <h2>${escapeHtml(chatName)}</h2>
      <p class="original-language">Original language: ${escapeHtml(languageOriginal)}</p>
    </div>

    <div class="preamble">${md(preamble_md)}</div>

    <div class="chat">${messageBlocks}</div>

    ${footerHtml}
  </div>
</body>
</html>
  `.trim();

  return html;
}
