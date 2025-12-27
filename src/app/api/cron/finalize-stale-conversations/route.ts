import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { finalizeConversationByChatName } from "@/server/finalization/finalizeConversation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function addMinutes(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60 * 1000);
}

async function acquireLock(name: string, ttlMinutes: number) {
  const now = new Date();
  const lockedUntil = addMinutes(now, ttlMinutes);

  // Make lock acquisition atomic (no create+race).
  // If another worker already created it, we handle it below.
  const existing = await prisma.cronLock.findUnique({ where: { name } });

  if (!existing) {
    try {
      await prisma.cronLock.create({
        data: { name, locked_at: now, locked_until: lockedUntil },
      });
      return true;
    } catch {
      // someone else created it in between
    }
  }

  const current = await prisma.cronLock.findUnique({ where: { name } });
  if (!current) return false;

  if (current.locked_until < now) {
    await prisma.cronLock.update({
      where: { name },
      data: { locked_at: now, locked_until: lockedUntil },
    });
    return true;
  }

  return false;
}

export async function GET() {
  const lockName = "finalize-stale-conversations";
  const haveLock = await acquireLock(lockName, 10);
  if (!haveLock) {
    return NextResponse.json({ ok: true, skipped: true }, { status: 200 });
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - 60 * 60 * 1000);

  const candidates = await prisma.conversation.findMany({
    where: {
      status: "active",
      send_to_internal: true,
      last_activity_at: { lt: cutoff },
    },
    select: { chat_name: true },
    take: 50,
  });

  let finalized = 0;
  const errors: Array<{ chatName: string; error: string }> = [];

  for (const c of candidates) {
    try {
      const res = await finalizeConversationByChatName({
        chatName: c.chat_name,
        reason: "inactive_1h",
      });
      if (res.status === "finalized") finalized += 1;
    } catch (e: any) {
      errors.push({
        chatName: c.chat_name,
        error: e?.message ?? String(e),
      });
    }
  }

  return NextResponse.json(
    {
      ok: true,
      finalized,
      candidates: candidates.length,
      errors,
    },
    { status: 200 }
  );
}
