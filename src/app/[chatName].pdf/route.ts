import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConversationMeta = {
  staticPdfBlobUrl?: string;
};

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ "chatName].pdf": string }> }
): Promise<Response> {
  // NOTE: Next.js route param name is derived from folder name.
  // Since folder is "[chatName].pdf", the param key becomes "chatName].pdf".
  const params = await context.params;
  const raw = (params as any)["chatName].pdf"] as string | undefined;

  if (!raw) {
    return new Response("chatName is required", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const decoded = decodeURIComponent(raw);

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
  if (!meta.staticPdfBlobUrl) {
    return new Response("Not published", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.redirect(meta.staticPdfBlobUrl, { status: 302 });
}
