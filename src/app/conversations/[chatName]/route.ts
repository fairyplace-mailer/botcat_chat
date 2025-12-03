import { NextRequest } from "next/server";
import { buildFinalJsonByChatName } from "@/lib/botcat-final-json";
import { buildTranscriptHtml, TranscriptMode } from "@/lib/transcript-html";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /conversations/[chatName]?mode=internal|public
 *
 * Возвращает HTML-стенограмму диалога.
 *  - internal: только перевод на RU (для FairyPlace™)
 *  - public:   только оригинал (для клиента)
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ chatName: string }> }
) {
  const { chatName } = await context.params;

  if (!chatName || typeof chatName !== "string") {
    return new Response("chatName is required", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const decodedChatName = decodeURIComponent(chatName);

  // Определяем режим из query-параметра (?mode=internal|public)
  const modeParam = req.nextUrl.searchParams.get("mode");
  const mode: TranscriptMode =
    modeParam === "public" ? "public" : "internal";

  try {
    const finalJson = await buildFinalJsonByChatName(decodedChatName);
    const html = buildTranscriptHtml(finalJson, mode);

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "";

    if (msg.includes("Conversation with chatName")) {
      return new Response("Conversation not found", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    console.error("[/conversations/[chatName]] Unexpected error:", error);

    return new Response("Internal Server Error", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
