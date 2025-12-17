import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { prisma } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TASK_NAME = "blob-cleanup";

function addMinutes(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60 * 1000);
}

function toIsoDate(d: Date): string {
  // YYYY-MM-DD in TIMEZONE later; here it's UTC-safe string for lock meta
  return d.toISOString().slice(0, 10);
}

function getLocalNow(timeZone: string): Date {
  // Convert "now" to the requested timezone by using Intl and re-parsing.
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

  // Build an ISO string and parse as if it is UTC; we only need consistency for comparisons
  return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}.000Z`);
}

async function acquireDailyLock(params: {
  name: string;
  localDateKey: string;
  now: Date;
}): Promise<boolean> {
  const { name, localDateKey, now } = params;

  const lockedUntil = addMinutes(now, 10);

  const existing = await prisma.cronLock.findUnique({ where: { name } });

  if (existing) {
    const meta = (existing.meta ?? {}) as any;
    const lastDateKey = typeof meta?.dateKey === "string" ? meta.dateKey : null;

    // Already ran today
    if (lastDateKey === localDateKey) return false;

    // Another worker currently running
    if (existing.locked_until && existing.locked_until > new Date()) return false;

    await prisma.cronLock.update({
      where: { name },
      data: {
        locked_at: new Date(),
        locked_until: lockedUntil,
        meta: { dateKey: localDateKey },
      },
    });

    return true;
  }

  await prisma.cronLock.create({
    data: {
      name,
      locked_at: new Date(),
      locked_until: lockedUntil,
      meta: { dateKey: localDateKey },
    },
  });

  return true;
}

export async function GET() {
  const runStartedAt = new Date();
  const timeZone = process.env.TIMEZONE?.trim() || "Asia/Jerusalem";

  // Decide if we should run cleanup now: local 00:00–00:59
  const localNow = getLocalNow(timeZone);
  const localHour = Number(localNow.toISOString().slice(11, 13));

  const isCleanupWindow = localHour === 0;
  if (!isCleanupWindow) {
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

  const errors: Array<{ scope: string; id?: string; error: string }> = [];
  let deletedAttachmentsCount = 0;
  let deletedConversationsCount = 0;

  try {
    // 1) Attachments cleanup (original + preview)
    const expiredAttachments = await prisma.attachment.findMany({
      where: {
        deleted_at: null,
        expires_at: { lt: runStartedAt },
      },
      select: {
        id: true,
        blob_url_original: true,
        blob_url_preview: true,
      },
      take: 500,
    });

    for (const att of expiredAttachments) {
      try {
        if (att.blob_url_preview) {
          await del(att.blob_url_preview);
        }
        if (att.blob_url_original) {
          await del(att.blob_url_original);
        }

        await prisma.attachment.update({
          where: { id: att.id },
          data: {
            deleted_at: runStartedAt,
            blob_url_original: null,
            blob_url_preview: null,
            blob_key_original: null,
          },
        });

        deletedAttachmentsCount += 1;
      } catch (e: any) {
        errors.push({
          scope: "attachment",
          id: att.id,
          error: e?.message ?? String(e),
        });
      }
    }

    // 2) Conversation published HTML cleanup
    const conversations = await prisma.conversation.findMany({
      where: {
        meta: { not: null },
      },
      select: { id: true, meta: true },
      take: 500,
    });

    for (const c of conversations) {
      try {
        const meta = (c.meta ?? {}) as any;
        const url = typeof meta.staticHtmlBlobUrl === "string" ? meta.staticHtmlBlobUrl : null;
        const expiresAtIso =
          typeof meta.staticHtmlExpiresAt === "string" ? meta.staticHtmlExpiresAt : null;

        if (!url || !expiresAtIso) continue;

        const expiresAt = new Date(expiresAtIso);
        if (Number.isNaN(expiresAt.getTime())) continue;

        if (expiresAt >= runStartedAt) continue;

        await del(url);

        const nextMeta = { ...meta };
        delete nextMeta.staticHtmlBlobUrl;
        delete nextMeta.staticHtmlExpiresAt;

        await prisma.conversation.update({
          where: { id: c.id },
          data: { meta: nextMeta },
        });

        deletedConversationsCount += 1;
      } catch (e: any) {
        errors.push({
          scope: "conversation-html",
          id: c.id,
          error: e?.message ?? String(e),
        });
      }
    }

    await prisma.cleanupLog.create({
      data: {
        task_name: TASK_NAME,
        run_started_at: runStartedAt,
        run_finished_at: new Date(),
        deleted_attachments_count: deletedAttachmentsCount,
        deleted_conversations_count: deletedConversationsCount,
        errors: errors.length > 0 ? (errors as any) : null,
      },
    });

    return NextResponse.json({
      ok: true,
      deletedAttachmentsCount,
      deletedConversationsCount,
      errors,
    });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    await prisma.cleanupLog.create({
      data: {
        task_name: TASK_NAME,
        run_started_at: runStartedAt,
        run_finished_at: new Date(),
        deleted_attachments_count: deletedAttachmentsCount,
        deleted_conversations_count: deletedConversationsCount,
        errors: [{ scope: "fatal", error: msg }] as any,
      },
    });

    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
