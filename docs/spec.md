# BOTCAT2 CONSULTANT

**Version:** 1.0 (Stage 1: web chat v1.0)

---

## 0. Context and scope

This repository contains BotCat Consultant  a web chat (Next.js) with a backend on Vercel. The backend integrates with OpenAI, persists transcripts, and (when finalized by the orchestrator) generates internal transcript artifacts and sends an internal notification email.

### 0.1 Product versions

**BotCat v1.0** corresponds to **Stage 1** + **Stage 2**.

**BotCat v2.0** corresponds to **Stage 3** (Web chat PRO).

### 0.2 Stages

**Stage 1  Web chat (BotCat v1.0): https://fairyplace.net/chat**

- One chat.
- Chat history is stored **only in UI memory** (lost on page reload).
- Button **New Chat** resets the current chat without reloading the page.
- Backend `/api/chat` responds via **SSE**.
- PWA.
- Attachments: user uploads go **UI  Blob directly**.
- **Embeddings are enabled (Stage 1)**: every user message is embedded and stored in DB.

**Stage 2  Social integrations (BotCat v1.0)**

Bots in FairyPlace2 social channels.

**Stage 3  Web chat PRO (BotCat v2.0): https://fairyplace.net/chat_pro**

Stage 3 (v2.0) differs from Stage 1 (v1.0) by:
- usage of OpenAI models of the latest generation (exact list to be defined before Stage 3);
- mandatory user registration/auth;
- ability for the user to download PDF files of previous dialogs.

Also for Stage 3 UI:
- One chat.
- Chat history is stored **only in UI memory** (lost on page reload).
- UI includes a sidebar/tab like ChatGPT:
  - logo
  - New Chat
  - links/buttons to download previous PDFs
  - auth menu

---

## 1. Website routes (public)

- `https://fairyplace.net`  **main landing page** (logo, English info, buttons/links). *(Implementation later)*
- `https://fairyplace.net/chat`  BotCat Consultant v1.0 UI.
- `https://fairyplace.net/chat_pro`  BotCat Consultant v2.0 UI. *(Implementation later)*

Static domain:
- `STATIC_BASE_URL = https://static.fairyplace.net`

---

## 2. Transcript lifecycle (important)

- `chatName` is **mandatory** and must be globally unique in DB.
- BotCat never decides when to finalize a transcript. Finalization is triggered by the **orchestrator**.

When conversation ends (user left or 1h+ inactive), orchestrator triggers finalization by calling `/api/bot/webhook`.

---

## 3. Attachments, LLM inputs & previews

### 3.1 User uploads (storage)

- UI uploads files directly to Vercel Blob via `/api/blob/upload`.
- Backend receives only Blob URLs in `/api/chat` and stores them.

Blob URLs are used for:
- UI display/download
- transcript artifacts generation during finalization (server fetch of Blob URLs)

### 3.2 LLM input rules (IMPORTANT)

**Blob = storage, not an LLM input source.**

We assume:
- OpenAI does **not** read Vercel Blob URLs for arbitrary documents.
- Vercel Hobby limits do not allow heavy server-side document parsing.

Therefore:

- **Images (png/jpg/webp)**: may be passed to OpenAI as vision input (`input_image`) using their Blob URL.
- **PDF/DOCX/XLSX/CSV/JSON/TXT/MD/ZIP**: must NOT be passed to OpenAI as `file_url`.
  - If the user attaches such a file, the UI extracts a limited text representation in the browser (see 3.3) and sends it to `/api/chat` as text.

### 3.3 Client-side extraction for documents

For PDF/DOCX and other non-image attachments, Stage 1 uses **client-side extraction**:
- PDF  `pdf.js`
- DOCX  `mammoth`

The UI sends extracted text to `/api/chat` as `extractedDocuments[]`.

The UI must limit extracted text volume (pages/blocks/characters) to control latency and token usage.

### 3.4 Previews (MANDATORY)

For images included into transcripts (HTML/PDF/email):
- preview width: **600px**
- target size: ** 80KB**
- preview format: **webp** (fallback to jpeg when needed)

Previews are generated on server during finalization (webhook), based on **Blob original URL**.

---

## 4. Backend API

### 4.1 POST `/api/chat` (SSE)

- Request JSON includes `chatName | null`, `message`, optional `attachments[]`, optional `extractedDocuments[]`, and client metadata.
- Response is `text/event-stream` with incremental deltas and a final event.

The backend may use DB history for model context.

---

## 5. Transcript artifacts (HTML/PDF)  internal vs original

### 5.1 Artifact types

The system supports **two transcript views**:

- **Internal (RU translated)**  used for internal team workflows and internal email.
- **Original**  in the original conversation language (no translation).

For each chat we support 4 artifacts:

1) `HTML_internal_ru`
2) `PDF_internal_ru`
3) `HTML_original`
4) `PDF_original`

### 5.2 Storage rules (current)

- **HTML artifacts** may be stored/published via Blob and accessible from `STATIC_BASE_URL`.
- **PDF artifacts are stored ONLY in Google Drive** (no PDF in Blob) to avoid Blob quota issues.

### 5.3 Stage enablement

**Stage 1 (v1.0)  enabled:**
- Send **1 internal email** to `fairyplace.tm@gmail.com`.
- Provide links to:
  - **1 HTML (internal RU)**
  - **1 PDF (internal RU)**

**Stage 2/3 (v2.0)  enabled:**
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

## 6. Blob TTL / retention (MANDATORY)

Blob storage is limited (Vercel Hobby). Therefore **all Blob objects are temporary**.

**TTL: 30 days** applies to ALL files stored in Blob:
- user-upload originals
- preview images
- published HTML transcripts

After 30 days Blob links may stop working.
This is explicitly mentioned in the internal email footer.

Cleanup runs automatically via Vercel Cron (hourly trigger, daily execution at local midnight Asia/Jerusalem).

---

## 7. Internal email (FairyPlace2)

Internal email must include:
- header image: `https://static.fairyplace.net/header.v3.png`
- Original language (ISO 639-1)
- optional fields (company/name/contact) only if provided
- brief: `preamble_md`
- link to internal HTML transcript
- link to internal PDF transcript
- footer:
  - Email with conversation materials. Links are valid for 30 days
  - Sent by FairyPlace2 Mailer

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
