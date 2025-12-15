import { handleUpload } from "@vercel/blob/client";

// Vercel Blob: generate a client token for direct uploads.
// Docs: https://vercel.com/docs/storage/vercel-blob
//
// Stage v1.0 per spec:
// - The browser uploads directly to Blob.
// - We keep this endpoint permissive: OpenAI may accept many formats, and v1.0
//   limits are effectively Vercel/runtime limits.

export async function POST(request: Request): Promise<Response> {
  const body = await request.json();

  const result = await handleUpload({
    body,
    request,

    // Contract (v2): must accept (pathname, clientPayload, multipart) and return
    // token options (not "allowed: true/false").
    onBeforeGenerateToken: async (pathname, _clientPayload, _multipart) => {
      return {
        addRandomSuffix: true,
        // Must be a string (it will be returned back to onUploadCompleted).
        // We keep it minimal.
        tokenPayload: pathname,
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
