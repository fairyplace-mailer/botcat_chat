import { handleUpload } from "@vercel/blob/client";

// Vercel Blob: generate a client token for direct uploads.
// Docs: https://vercel.com/docs/storage/vercel-blob

// Stage v1.0: We accept files that OpenAI can reasonably consume.
// No size/count limits are enforced here beyond what Vercel Hobby/runtime allows.
// NOTE: This list is intentionally permissive per updated spec.
const ALLOWED_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/csv",
  "text/plain",
  "application/json",
];

export async function POST(request: Request): Promise<Response> {
  const result = await handleUpload({
    request,
    onBeforeGenerateToken: async (pathname, clientPayload) => {
      const contentType =
        typeof (clientPayload as any)?.contentType === "string"
          ? ((clientPayload as any).contentType as string)
          : undefined;

      if (contentType && !ALLOWED_CONTENT_TYPES.includes(contentType)) {
        return {
          allowed: false,
          error: `Content-Type not allowed: ${contentType}`,
        } as const;
      }

      return {
        allowed: true,
        addRandomSuffix: true,
        tokenPayload: {
          pathname,
        },
      } as const;
    },

    onUploadCompleted: async () => {
      // Stage v1.0: no-op. We don't persist upload metadata in DB.
    },
  });

  // handleUpload() returns a typed union that isn't a Fetch Response.
  // Next route handlers must return Response, so we wrap it.
  return Response.json(result);
}
