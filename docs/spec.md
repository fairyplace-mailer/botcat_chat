# BOTCAT™ CONSULTANT

**Version:** 1.0 (Stage 1: web chat v1.0)

---

## 0. Context and scope

This repository contains BotCat Consultant – a web chat (Next.js) with a backend on Vercel. The backend integrates with OpenAI, persists transcripts, and (when finalized by the orchestrator) generates internal transcript artifacts and sends an internal notification email.

### 0.1 Stages

**Stage 1 – Web chat (v1.0): https://fairyplace.net/chat**

- One chat.
- Chat history is stored **only in UI memory** (lost on page reload).
- Button **New Chat** resets the current chat without reloading the page.
- Backend `/api/chat` responds via **SSE**.
- PWA.
- Attachments: user uploads go **UI → Blob directly**.

**Stage 2 – Social integrations** (bots in FairyPlace™ social channels).

**Stage 3 – Web chat PRO (v2.0): https://fairyplace.net/chat_pro**

- One chat.
- Chat history is stored **only in UI memory** (lost on page reload).
- Requires registration/auth (details before Stage 3 implementation).
- UI includes a “sidebar/tab” like ChatGPT:
  - logo
  - New Chat
  - links/buttons to download previous PDFs
  - auth menu

---

## 1. Website routes (public)

- `https://fairyplace.net` – **main landing page** (logo, English info, buttons/links). *(Implementation later)*
- `https://fairyplace.net/chat` – BotCat Consultant v1.0 UI.
- `https://fairyplace.net/chat_pro` – BotCat Consultant v2.0 UI. *(Implementation later)*

Static domain:
- `STATIC_BASE_URL = https://static.fairyplace.net`

---

## 2. Transcript lifecycle (important)

- `chatName` is **mandatory** and must be globally unique in DB.
- BotCat never decides when to finalize a transcript. Finalization is triggered by the **orchestrator**.

When conversation ends (user left or 1h+ inactive), orchestrator triggers finalization by calling `/api/bot/webhook`.

---

## 3. Attachments & previews

### 3.1 User uploads

- UI uploads files directly to Vercel Blob via `/api/blob/upload`.
- Backend receives only Blob URLs in `/api/chat` and stores them.

### 3.2 Previews (MANDATORY)

For images included into transcripts (HTML/PDF/email):
- preview width: **600px**
- target size: **≤ 80KB**
- preview format: **webp** (fallback to jpeg when needed)

Previews are generated on server during finalization (webhook), based on **Blob original URL**.

---

## 4. Backend API

### 4.1 POST `/api/chat` (SSE)

- Request JSON includes `chatName | null`, `message`, optional `attachments[]`, and client metadata.
- Response is `text/event-stream` with incremental deltas and a final event.

---

## 5. Transcript artifacts (HTML/PDF) – internal vs original

### 5.1 Artifact types

The system supports **two transcript views**:

- **Internal (RU translated)** – used for internal team workflows and internal email.
- **Original** – in the original conversation language (no translation).

For each chat we support 4 artifacts:

1) `HTML_internal_ru`
2) `PDF_internal_ru`
3) `HTML_original`
4) `PDF_original`

### 5.2 Storage rules (current)

- **HTML artifacts** may be stored/published via Blob and accessible from `STATIC_BASE_URL`.
- **PDF artifacts are stored ONLY in Google Drive** (no PDF in Blob) to avoid Blob quota issues.

### 5.3 Stage enablement

**Stage 1 (v1.0) – enabled:**
- Send **1 internal email** to `fairyplace.tm@gmail.com`.
- Provide links to:
  - **1 HTML (internal RU)**
  - **1 PDF (internal RU)**

**Stage 2/3 (v2.0) – enabled:**
- Send **1 internal email** to `fairyplace.tm@gmail.com` with links to:
  - **HTML_internal_ru** (in email)
  - **PDF_internal_ru** (in email)
- UI provides access (like ChatGPT links/buttons) to:
  - **HTML_original**
  - **PDF_original**

### 5.4 Public routes for accessing artifacts

We use project routes under the static domain:

- HTML internal: `GET ${STATIC_BASE_URL}/t/<chatName>/html`
- PDF internal: `GET ${STATIC_BASE_URL}/t/<chatName>/pdf`

Notes:
- `.../t/<chatName>/pdf` returns the PDF from **Google Drive** (stream/redirect), but PDF is stored in Drive.

(When Stage 2/3 is implemented we will add:
- `GET ${STATIC_BASE_URL}/t/<chatName>/html/original`
- `GET ${STATIC_BASE_URL}/t/<chatName>/pdf/original`
)

---

## 6. Internal email (FairyPlace™)

Internal email must include:
- header image: `https://static.fairyplace.net/header.v3.png`
- Original language (ISO 639-1)
- optional fields (company/name/contact) only if provided
- brief: `preamble_md`
- link to internal HTML transcript
- link to internal PDF transcript
- footer:
  - “Email with conversation materials. Links are valid for 30 days”
  - “Sent by FairyPlace™ Mailer”

---

## Appendix: Final JSON contract

```json
{
  "chatName": "FP_2025-01-01_12-00-01_abc123",
  "languageOriginal": "en",
  "language": "ru",
  "preamble_md": "...",
  "footerInternal_md": "...",
  "footerClient_md": "...",
  "sendToInternal": true,
  "messages": [
    {
      "messageId": "...",
      "role": "User",
      "contentOriginal_md": "...",
      "hasAttachments": false,
      "hasLinks": false,
      "isVoice": false,
      "createdAt": "2025-01-01T12:00:00.000Z"
    }
  ],
  "translatedMessages": [
    {
      "messageId": "...",
      "role": "User",
      "contentTranslated_md": "..."
    }
  ],
  "attachments": [
    {
      "attachmentId": "...",
      "messageId": "...",
      "kind": "user_upload",
      "fileName": "plan.pdf",
      "mimeType": "application/pdf",
      "fileSizeBytes": 123456,
      "pageCount": null,
      "externalUrl": null
    }
  ]
}
```

Rules:
- `chatName` is mandatory and unique.
- `language` is always `"ru"` (internal transcript language).
- If `languageOriginal === "ru"`, then translated content equals original content (no translation).
