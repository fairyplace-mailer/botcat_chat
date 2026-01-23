import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { ingestWebKb } from "@/server/rag/web-kb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TASK_NAME = "web-kb-ingest";

function addMinutes(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60 * 1000);
}

function isAuthorized(req: Request): boolean {
  const expected = env.CRON_SECRET;
  if (!expected) return false;

  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${expected}`;
}

async function acquireMutexLock(params: { name: string; now: Date; ttlMinutes: number }) {
  const { name, now, ttlMinutes } = params;
  const lockedUntil = addMinutes(now, ttlMinutes);

  await prisma.cronLock.upsert({
    where: { name },
    create: {
      name,
      locked_at: new Date(0),
      locked_until: new Date(0),
      meta: null,
    },
    update: {},
  });

  const updated = await prisma.cronLock.updateMany({
    where: {
      name,
      locked_until: { lt: now },
    },
    data: {
      locked_at: now,
      locked_until: lockedUntil,
      meta: null,
    },
  });

  return updated.count === 1;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const runStartedAt = new Date();
  const url = new URL(req.url);

  const force = url.searchParams.get("force") === "1";

  const limitPagesRaw = url.searchParams.get("limitPages");
  const maxDurationRaw = url.searchParams.get("maxDurationMs");

  const limitPages = limitPagesRaw ? Number(limitPagesRaw) : undefined;
  const maxDurationMs = maxDurationRaw ? Number(maxDurationRaw) : undefined;

  // Frequent task (*/2). Use a short mutex lock (NOT daily-lock).
  if (!force) {
    const acquired = await acquireMutexLock({
      name: TASK_NAME,
      now: runStartedAt,
      ttlMinutes: 2,
    });

    if (!acquired) {
      return NextResponse.json({ ok: true, skipped: true, reason: "locked" });
    }
  }

  try {
    const result = await ingestWebKb({
      limitPages: Number.isFinite(limitPages) ? limitPages : undefined,
      maxDurationMs: Number.isFinite(maxDurationMs) ? maxDurationMs : undefined,
    });

    await prisma.cleanupLog.create({
      data: {
        task_name: TASK_NAME,
        run_started_at: runStartedAt,
        run_finished_at: new Date(),
        deleted_attachments_count: 0,
        deleted_conversations_count: 0,
        errors: null,
      },
    });

    return NextResponse.json({ forced: force, ...result });
  } catch (e: any) {
    const msg = e?.message ?? String(e);

    await prisma.cleanupLog.create({
      data: {
        task_name: TASK_NAME,
        run_started_at: runStartedAt,
        run_finished_at: new Date(),
        deleted_attachments_count: 0,
        deleted_conversations_count: 0,
        errors: [{ scope: "fatal", error: msg }] as any,
      },
    });

    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
