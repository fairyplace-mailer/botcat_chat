import { handleUploadRoute } from "@vercel/blob/client";

// Vercel Blob: generate a client token for direct uploads.
// Docs: https://vercel.com/docs/storage/vercel-blob
//
// Note: handleUploadRoute is the supported helper for Next.js route handlers.

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

export const POST = handleUploadRoute({
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

    // We don't restrict file names here; Vercel Blob will add a random suffix.
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
