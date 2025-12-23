import { NextRequest } from "next/server";
import { buildFinalJsonByChatName } from "@/lib/botcat-final-json";
import { buildTranscriptHtml } from "@/lib/transcript-html";
import { buildPdfFromHtml } from "@/lib/transcript-pdf";

/**
 * GET /api/conversations/[chatName]/pdf
 *
 * Генерирует PDF-стенограмму диалога по chatName.
 * Важно: PDF генерируется из HTML для гарантии идентичности.
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ chatName: string }> }
) {
  const { chatName } = await context.params;

  if (!chatName || typeof chatName !== "string") {
    return new Response(
      JSON.stringify({ ok: false, error: "chatName is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const decodedChatName = decodeURIComponent(chatName);

  try {
    // 1) Собираем финальный JSON (из БД)
    const finalJson = await buildFinalJsonByChatName(decodedChatName);

    // 2) Генерируем HTML (internal transcript)
    const html = buildTranscriptHtml(finalJson, "internal");

    // 3) Генерируем PDF из HTML
    const pdfBytes = await buildPdfFromHtml(html);

    const fileName = `transcript_${decodedChatName}.pdf`.replace(
      /[^\w.-]+/g,
      "_"
    );

    return new Response(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    console.error(
      "[/api/conversations/[chatName]/pdf] Unexpected error:",
      error
    );

    const message =
      typeof error?.message === "string" ? error.message : "Internal Error";

    if (message.includes("Conversation with chatName")) {
      return new Response(
        JSON.stringify({ ok: false, error: "Conversation not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: false, error: "Internal Server Error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
