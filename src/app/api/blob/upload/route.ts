import { handleUpload } from "@vercel/blob/client";

// Vercel Blob: generate a client token for direct uploads.
// Docs: https://vercel.com/docs/storage/vercel-blob
//
// Stage v1.0 per TR/spec:
// - The browser uploads directly to Blob.
// - addRandomSuffix: true
// - store contentType (Blob stores contentType for the uploaded object)
// - restrict allowedContentTypes (roughly: ChatGPT-supported file types, excluding code)

const ALLOWED_CONTENT_TYPES = [
  // Text
  "text/plain", // .txt
  "text/markdown", // .md
  "application/pdf", // .pdf
  "application/rtf", // .rtf
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx

  // Data
  "text/csv", // .csv
  "application/json", // .json
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx

  // Images
  "image/png",
  "image/jpeg", // .jpg/.jpeg
  "image/webp",

  // Archives
  "application/zip", // .zip (allowed as attachment; no server-side inspection in v1.0)
] as const;

export async function POST(request: Request): Promise<Response> {
  const body = await request.json();

  const result = await handleUpload({
    body,
    request,

    // Contract (v2): must accept (pathname, clientPayload, multipart) and return
    // token options.
    onBeforeGenerateToken: async (_pathname, _clientPayload, _multipart) => {
      return {
        addRandomSuffix: true,
        allowedContentTypes: [...ALLOWED_CONTENT_TYPES],

        // Must be a string (it will be returned back to onUploadCompleted).
        // Keep it minimal and non-sensitive.
        tokenPayload: "v1",
      };
    },

    onUploadCompleted: async () => {
      // Stage v1.0: no-op. We don't persist upload metadata in DB.
    },
  });

  // handleUpload() returns a typed union that isn't a Fetch Response.
  // Next route handlers must return Response, so we wrap it.
  return Response.json(result);
}
