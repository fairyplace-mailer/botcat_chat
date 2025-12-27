import { NextResponse } from "next/server";
import { z } from "zod";
import { finalizeConversationByChatName } from "@/server/finalization/finalizeConversation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  chatName: z.string().min(1),
  reason: z.enum(["new_chat", "pagehide"]).optional().default("new_chat"),
});

export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { chatName, reason } = parsed.data;

  await finalizeConversationByChatName({
    chatName,
    reason,
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
