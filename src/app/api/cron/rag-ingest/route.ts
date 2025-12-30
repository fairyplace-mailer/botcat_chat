import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { ingestReferenceContext } from "@/server/rag/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TASK_NAME = "rag-ingest";

function addMinutes(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60 * 1000);
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getLocalNow(timeZone: string): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value;

  const y = get("year");
  const m = get("month");
  const d = get("day");
  const hh = get("hour");
  const mm = get("minute");
  const ss = get("second");

  if (!y || !m || !d || !hh || !mm || !ss) return now;

  return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}.000Z`);
}

async function acquireDailyLock(params: {
  name: string;
  localDateKey: string;
  now: Date;
}): Promise<boolean> {
  const { name, localDateKey, now } = params;

  const lockedUntil = addMinutes(now, 20);

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
          equals: { dateKey: localDateKey },
        },
      },
    },
    data: {
      locked_at: new Date(),
      locked_until: lockedUntil,
      meta: { dateKey: localDateKey },
    },
  });

  return updated.count === 1;
}

export async function GET() {
  const runStartedAt = new Date();
  const timeZone = process.env.TIMEZONE?.trim() || "Asia/Jerusalem";

  // Window gating: only run during local 00:00–00:59
  const localNow = getLocalNow(timeZone);
  const localHour = Number(localNow.toISOString().slice(11, 13));
  if (localHour !== 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: "outside-window" });
  }

  const localDateKey = toIsoDate(localNow);
  const acquired = await acquireDailyLock({
    name: TASK_NAME,
    localDateKey,
    now: runStartedAt,
  });

  if (!acquired) {
    return NextResponse.json({ ok: true, skipped: true, reason: "locked" });
  }

  try {
    const result = await ingestReferenceContext();

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
