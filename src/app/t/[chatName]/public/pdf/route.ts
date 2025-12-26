import { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { downloadFileFromDrive } from "@/lib/google/drive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConversationMeta = {
  publicPdfDriveFileId?: string;
};

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ chatName: string }> }
): Promise<Response> {
  const { chatName } = await context.params;
  const decoded = decodeURIComponent(chatName);

  const conv = await prisma.conversation.findUnique({
    where: { chat_name: decoded },
    select: { meta: true },
  });

  if (!conv) {
    return new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const meta = (conv.meta ?? {}) as ConversationMeta;
  if (!meta.publicPdfDriveFileId) {
    return new Response("Not published", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const driveStream = await downloadFileFromDrive(meta.publicPdfDriveFileId);

  return new Response(driveStream as any, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${decoded}.public.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
