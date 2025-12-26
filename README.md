# BotCat Consultant

> This repository hosts **BotCat Consultant** (Stage 1 web chat) running on **Next.js (App Router)** + Vercel.

## Quick regression test (Stage 1 finalization)

These commands validate the end-to-end Stage 1 pipeline:
- `POST /api/bot/webhook` accepts a finalization payload
- generates **4 artifacts** (internal/public HTML + internal/public PDF)
- publishes HTML via Blob (temporary)
- stores PDFs in Google Drive
- sends **internal email** with stable links under `STATIC_BASE_URL`

### Preconditions

- You have a **Vercel Deployment Protection bypass token** (if preview/prod is protected).
- You know `BOTCAT_WEBHOOK_SECRET` (if enabled).

### Variables

Replace the placeholders below:

- `<DEPLOY_DOMAIN>`: e.g. `botcat-chat-xxxx.vercel.app` (or `fairyplace.net`)
- `<BYPASS_TOKEN>`: Vercel protection bypass token
- `<BOTCAT_WEBHOOK_SECRET>`: value of `BOTCAT_WEBHOOK_SECRET`
- `<CHAT_NAME>`: unique chat name, e.g. `e2e-prod-noatt-001`

### 1) Get bypass cookie (only if protected)

```bash
curl -i -L -c /tmp/vercel_cookies.txt \
  'https://<DEPLOY_DOMAIN>/?x-vercel-set-bypass-cookie=true&x-vercel-protection-bypass=<BYPASS_TOKEN>'
```

### 2) Finalize a transcript (no attachments)

```bash
curl -i -L \
  -c /tmp/vercel_cookies.txt -b /tmp/vercel_cookies.txt \
  -X POST 'https://<DEPLOY_DOMAIN>/api/bot/webhook?x-vercel-set-bypass-cookie=true&x-vercel-protection-bypass=<BYPASS_TOKEN>' \
  -H 'content-type: application/json' \
  -H 'x-botcat-secret: <BOTCAT_WEBHOOK_SECRET>' \
  --data-raw '{
    "chatName": "<CHAT_NAME>",
    "sendToInternal": true,
    "userAgent": "curl-e2e",
    "summary_en": "Test summary",
    "languageOriginal": "en",
    "messages": [
      { "messageId": "m1", "createdAt": "2025-12-25T00:00:00.000Z", "role": "user", "content": "Hello! Test.", "attachments": [] },
      { "messageId": "m2", "createdAt": "2025-12-25T00:00:01.000Z", "role": "assistant", "content": "OK. Test response.", "attachments": [] }
    ],
    "translatedMessages": [
      { "messageId": "m1", "role": "user", "contentTranslated_md": "! ." },
      { "messageId": "m2", "role": "assistant", "contentTranslated_md": ".  ." }
    ]
  }'
```

### 3) Verify artifact routes (internal + public)

Internal:

```bash
curl -I -L -c /tmp/vercel_cookies.txt -b /tmp/vercel_cookies.txt \
  'https://<DEPLOY_DOMAIN>/t/<CHAT_NAME>/html?x-vercel-set-bypass-cookie=true&x-vercel-protection-bypass=<BYPASS_TOKEN>'

curl -I -L -c /tmp/vercel_cookies.txt -b /tmp/vercel_cookies.txt \
  'https://<DEPLOY_DOMAIN>/t/<CHAT_NAME>/pdf?x-vercel-set-bypass-cookie=true&x-vercel-protection-bypass=<BYPASS_TOKEN>'
```

Public (original):

```bash
curl -I -L -c /tmp/vercel_cookies.txt -b /tmp/vercel_cookies.txt \
  'https://<DEPLOY_DOMAIN>/t/<CHAT_NAME>/public/html?x-vercel-set-bypass-cookie=true&x-vercel-protection-bypass=<BYPASS_TOKEN>'

curl -I -L -c /tmp/vercel_cookies.txt -b /tmp/vercel_cookies.txt \
  'https://<DEPLOY_DOMAIN>/t/<CHAT_NAME>/public/pdf?x-vercel-set-bypass-cookie=true&x-vercel-protection-bypass=<BYPASS_TOKEN>'
```

### 4) Verify stable links under static domain

```bash
curl -I -L 'https://static.fairyplace.net/t/<CHAT_NAME>/html'
curl -I -L 'https://static.fairyplace.net/t/<CHAT_NAME>/pdf'
```

---

## Dev

```bash
npm run dev
```

Open http://localhost:3000.
