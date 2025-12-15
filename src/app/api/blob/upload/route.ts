import { NextRequest, NextResponse } from "next/server";

// Vercel Blob: generate a client token for direct uploads.
// Docs: https://vercel.com/docs/storage/vercel-blob
import { handleUpload } from "@vercel/blob";

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    // Optional client hinting; @vercel/blob's handleUpload validates and signs.
    // We keep the interface simple for the UI: it can pass { filename, contentType }.
    const filename = typeof body?.filename === "string" ? body.filename : "upload";
    const contentType = typeof body?.contentType === "string" ? body.contentType : undefined;

    const json = await handleUpload({
      request,
      onBeforeGenerateToken: async () => {
        if (contentType && !ALLOWED_CONTENT_TYPES.includes(contentType)) {
          return {
            allowed: false,
            error: `Content-Type not allowed: ${contentType}`,
          } as const;
        }

        return {
          allowed: true,
          tokenPayload: {
            filename,
          },
        } as const;
      },
      onUploadCompleted: async () => {
        // Intentionally no-op for stage v1.0.
        // (No DB persistence of uploads at this stage.)
      },
    });

    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json(
      { error: "Upload token error", detail: String(err) },
      { status: 500 },
    );
  }
}
