import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { prisma } from "@/server/db";
import { ingestReferenceContext } from "@/server/rag/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TASK_NAME = "rag-ingest";

function addMinutes(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60 * 1000);
}

function toUtcIsoDate(d: Date): string {
  // YYYY-MM-DD in UTC
  return d.toISOString().slice(0, 10);
}

function getBearerToken(req: Request): string | null {
  const header = (req.headers.get("authorization") ?? "").trim();
  if (!header) return null;

  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1]?.trim();
  return token ? token : null;
}

function isAuthorized(req: Request): boolean {
  const expected = (env.CRON_SECRET ?? "").trim();
  if (!expected) return false;

  const token = getBearerToken(req);
  return token === expected;
}

async function ensureLockRow(name: string) {
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
}

async function acquireDailyLock(params: {
  name: string;
  utcDateKey: string;
  now: Date;
}): Promise<boolean> {
  const { name, utcDateKey, now } = params;

  const lockedUntil = addMinutes(now, 20);

  await ensureLockRow(name);

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

async function acquireFullRunLock(params: {
  name: string;
  now: Date;
  minutes: number;
}): Promise<boolean> {
  const { name, now, minutes } = params;

  const lockedUntil = addMinutes(now, minutes);

  await ensureLockRow(name);

  const updated = await prisma.cronLock.updateMany({
    where: {
      name,
      locked_until: { lt: now },
    },
    data: {
      locked_at: now,
      locked_until: lockedUntil,
      meta: { mode: "full", requestedAt: now.toISOString(), minutes },
    },
  });

  return updated.count === 1;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const runStartedAt = new Date();
  const utcDateKey = toUtcIsoDate(runStartedAt);

  const url = new URL(req.url);
  const mode = (url.searchParams.get("mode") ?? "").trim();
  const lockMinutesRaw = (url.searchParams.get("lockMinutes") ?? "").trim();
  const lockMinutes = lockMinutesRaw ? Number(lockMinutesRaw) : NaN;

  const acquired =
    mode === "full"
      ? await acquireFullRunLock({
          name: TASK_NAME,
          now: runStartedAt,
          minutes: Number.isFinite(lockMinutes) && lockMinutes > 0 ? lockMinutes : 180,
        })
      : await acquireDailyLock({
          name: TASK_NAME,
          utcDateKey,
          now: runStartedAt,
        });

  if (!acquired) {
    return NextResponse.json({ ok: true, skipped: true, reason: "locked" });
  }

  try {
    const result = await ingestReferenceContext();

    // CleanupLog schema doesn't have a `meta` field.
    // Store ingest stats in `errors` for now to avoid runtime crash.
    await prisma.cleanupLog.create({
      data: {
        task_name: TASK_NAME,
        run_started_at: runStartedAt,
        run_finished_at: new Date(),
        deleted_attachments_count: 0,
        deleted_conversations_count: 0,
        errors: [{ scope: "result", result }] as any,
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
