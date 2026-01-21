import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ingestWebKb } from "@/server/rag/web-kb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TASK_NAME = "web-kb-ingest";

function addMinutes(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60 * 1000);
}

function toUtcIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function acquireDailyLock(params: {
  name: string;
  utcDateKey: string;
  now: Date;
}): Promise<boolean> {
  const { name, utcDateKey, now } = params;

  const lockedUntil = addMinutes(now, 30);

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
      NOT: {
        meta: {
          equals: { dateKey: utcDateKey },
        },
      },
    },
    data: {
      locked_at: now,
      locked_until: lockedUntil,
      meta: { dateKey: utcDateKey },
    },
  });

  return updated.count === 1;
}

export async function GET() {
  const runStartedAt = new Date();
  const utcDateKey = toUtcIsoDate(runStartedAt);

  const acquired = await acquireDailyLock({
    name: TASK_NAME,
    utcDateKey,
    now: runStartedAt,
  });

  if (!acquired) {
    return NextResponse.json({ ok: true, skipped: true, reason: "locked" });
  }

  try {
    const result = await ingestWebKb({
      maxPages: 15,
    });

    await prisma.cleanupLog.create({
      data: {
        task_name: TASK_NAME,
        run_started_at: runStartedAt,
        run_finished_at: new Date(),
        deleted_attachments_count: 0,
        deleted_conversations_count: 0,
        errors: null,
        meta: result as any,
      },
    });

    return NextResponse.json({ ok: true, ...result });
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
