import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/debug/email-logs?chatName=...
 *
 * Возвращает EmailLog для заданного chatName.
 * Используется только для отладки.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const chatName = url.searchParams.get("chatName");

    if (!chatName || !chatName.trim()) {
      return NextResponse.json(
        { ok: false, error: "Parameter 'chatName' is required" },
        { status: 400 }
      );
    }

    const conversation = await prisma.conversation.findUnique({
      where: { chat_name: chatName },
    });

    if (!conversation) {
      return NextResponse.json(
        { ok: false, error: "Conversation not found" },
        { status: 404 }
      );
    }

    const emailLogs = await prisma.emailLog.findMany({
      where: { conversation_id: conversation.id },
      orderBy: { created_at: "asc" },
    });

    return NextResponse.json(
      {
        ok: true,
        chatName,
        conversationId: conversation.id,
        count: emailLogs.length,
        emailLogs,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[/api/debug/email-logs] error:", error);
    const msg =
      typeof error?.message === "string" ? error.message : "Internal error";
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 }
    );
  }
}
