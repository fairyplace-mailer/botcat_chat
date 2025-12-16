#   

BOTCAT CONSULTANT

**:** 1.0 (   1: web chat v1.0)

---

## 0.  

### 0.1.  

    BotCat Consultant    .

### 0.2.   ()

** 1  Web chat (v1.0): https://fairyplace.net/chat**

-  .
-    **   UI** (   1).
-     ****.
-     **New Chat** (    ).
-   OpenAI  backend `/api/chat`  **SSE**.
-  PWA.
-  OpenAI   1  **,     ** (env.ts).

** 2     FairyPlace**

- WhatsApp
- Instagram
- Telegram
- Messenger
- Viber

** 3  Web chat PRO (v2.0): https://fairyplace.net/chat_pro**

-  .
-    **   UI**.
-     ****.
-    / (  ChatGPT).  :
  - ;
  -  **New Chat**;
  -  **Download PDF** ( PDF  );
  -     (   ChatGPT).
-   **  /**.
-   3  **  OpenAI** (    3).

   3        .

---

## 1.   https://fairyplace.net ()

   :

- ;
-    **;
-    :
  - v1.0 : `/chat`
  - v2.0 : `/chat_pro`
-     : https://fairyplace.biz
-   :
  - `order@fairyplace.net`
  - `support@fairyplace.net`
-     FairyPlace.

---

## 2.  

BotCat Consultant  AI, :

-    `fairyplace.net`;
-    (  skills);
-   backend (Vercel)  OpenAI;
-  PWA;
-     Vercel Blob.

---

## 3.   (   1)

 ** 1**  :

- UI (Next.js)
- Backend API (Next.js route handlers)
- OpenAI
- Vercel Blob
- PWA

  /HTML/PDF///Drive          1**,       .

---

## 4. Backend API specification

### 4.1. POST /api/chat ( SSE)

:  endpoint    BotCat  OpenAI (SSE stream).

**Request**

- Method: POST
- Headers: `Content-Type: application/json`

Body ():

```json
{
  "chatName": null,
  "message": "  ...",
  "attachments": [
    {
      "blobKey": "uploads/...",
      "fileName": "plan.pdf",
      "mimeType": "application/pdf",
      "fileSizeBytes": 123456,
      "blobUrl": "https://..."
    }
  ],
  "client": {
    "sessionId": "c7f3d5c0-6f0c-4c5a-9f3b-2f3e...",
    "userAgent": "Mozilla/5.0 ...",
    "ipHash": "sha256:..."
  }
}
```

:

- `chatName`: `string | null`
  - `null`    ;
  -      .
- `message`: `string` ()
- `attachments[]`:  , **   Blob** (.  5)
- `client`:  

**Response**

- Status: `200 OK`
- Content-Type: `text/event-stream`

 SSE:

- /  
-  :

```json
{
  "type": "final",
  "chatName": "FP_2025-01-01_12-00-01_abc123",
  "messageId": "FP_2025-01-01_12-00-01_abc123__b_001"
}
```

:

- 400   
- 500    / OpenAI

---

## 5.    ( )

### 5.1. USER  UI  Blob ( )

-   .
- UI ****   Vercel Blob.
- UI  `blobUrl` (/ `blobKey`).
- UI   `/api/chat`  / (   ).

### 5.2. OpenAI  UI  Backend  Blob (,  )

-  OpenAI   (, base64 ), UI    backend.
- Backend:
  -     ( ),
  -   Blob,
  -  UI  (`blobUrl`)     .

---

## 6. PWA ()

UI :

-  `manifest.json`
-  service worker
-  "Install app"
-   `standalone`
-   192/512 px

---

## 7.    ()

 , :

-    , 
-    1 .

    1  :

-    **** `chatName`
-      "-N"        .

**:**

- BotCat **  **  .
-   ** backend**.
-    ,   BotCat :

`SYSTEM: finalize_transcript_now`

-    (     )   `/api/bot/webhook`.

---

## 8.   ()

     :

-  **    **
-  email     ** **

( /                 .)

---

## 9. Definition of Done (DoD)   1 ()

 1 , :

-   `https://fairyplace.net`   1;
-    `https://fairyplace.net/chat`;
-     (, , , );
-   **New Chat**;
- `/api/chat`  **  SSE**;
-      Vercel Blob (  UI  Blob);
- PWA  (manifest, service worker, install prompt).

---

## 10. MANDATORY  ()

 **MANDATORY_1**  **MANDATORY_2**     BotCat  .

> :  MANDATORY    09,    09     .

---

# : Final JSON contract ()

 JSON      :

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

:
- `chatName`        .
- `language`  "ru" (     ).
- `translatedMessages`  ,    `messages[]`.
-      .
