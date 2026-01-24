import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { seedWebSources } from "@/server/rag/web-kb";
import { WEB_SOURCES } from "@/server/rag/web-sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TASK_NAME = "web-kb-seed";

function addMinutes(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60 * 1000);
}

function toUtcIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isAuthorized(req: Request): boolean {
  const expected = env.CRON_SECRET;
  if (!expected) return false;

  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${expected}`;
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

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const runStartedAt = new Date();
  const utcDateKey = toUtcIsoDate(runStartedAt);
  const url = new URL(req.url);

  const force = url.searchParams.get("force") === "1";

  const maxPagesRaw = url.searchParams.get("maxPages");
  const maxDurationRaw = url.searchParams.get("maxDurationMs");

  const maxPages = maxPagesRaw ? Number(maxPagesRaw) : undefined;
  const maxDurationMs = maxDurationRaw ? Number(maxDurationRaw) : undefined;

  const sourceId = (url.searchParams.get("source") ?? "").trim();
  const sources = sourceId
    ? WEB_SOURCES.filter((s) => s.id === sourceId)
    : undefined;

  if (sourceId && (!sources || sources.length === 0)) {
    return NextResponse.json(
      {
        ok: false,
        error: `unknown source: ${sourceId}`,
        allowedSources: WEB_SOURCES.map((s) => s.id),
      },
      { status: 400 }
    );
  }

  if (!force) {
    const acquired = await acquireDailyLock({
      name: TASK_NAME,
      utcDateKey,
      now: runStartedAt,
    });

    if (!acquired) {
      return NextResponse.json({ ok: true, skipped: true, reason: "locked" });
    }
  }

  try {
    const result = await seedWebSources({
      sources,
      maxPages: Number.isFinite(maxPages) ? maxPages : undefined,
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
