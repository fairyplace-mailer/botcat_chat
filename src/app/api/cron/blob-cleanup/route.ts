import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { prisma } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TASK_NAME = "blob-cleanup";

function addMinutes(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60 * 1000);
}

function toUtcIsoDate(d: Date): string {
  // YYYY-MM-DD in UTC
  return d.toISOString().slice(0, 10);
}

async function acquireDailyLock(params: {
  name: string;
  utcDateKey: string;
  now: Date;
}): Promise<boolean> {
  const { name, utcDateKey, now } = params;

  const lockedUntil = addMinutes(now, 10);

  // Ensure row exists without throwing unique-violation noise.
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

  // Acquire only if not already run today and lock expired.
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

function getExpiredHtmlMetaKeys(meta: any, prefix: "internal" | "public"):
  | {
      urlKey: string;
      expiresAtKey: string;
      url: string;
      expiresAtIso: string;
    }
  | null {
  const urlKey = prefix === "internal" ? "staticHtmlBlobUrl" : "publicHtmlBlobUrl";
  const expiresAtKey =
    prefix === "internal" ? "staticHtmlExpiresAt" : "publicHtmlExpiresAt";

  const url = typeof meta?.[urlKey] === "string" ? meta[urlKey] : null;
  const expiresAtIso =
    typeof meta?.[expiresAtKey] === "string" ? meta[expiresAtKey] : null;

  if (!url || !expiresAtIso) return null;

  return { urlKey, expiresAtKey, url, expiresAtIso };
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

    // 2) Conversation published HTML cleanup (internal + public)
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
        let nextMeta = { ...meta };
        let changed = false;

        for (const prefix of ["internal", "public"] as const) {
          const keys = getExpiredHtmlMetaKeys(meta, prefix);
          if (!keys) continue;

          const expiresAt = new Date(keys.expiresAtIso);
          if (Number.isNaN(expiresAt.getTime())) continue;

          if (expiresAt >= runStartedAt) continue;

          await del(keys.url);

          delete nextMeta[keys.urlKey];
          delete nextMeta[keys.expiresAtKey];
          changed = true;
        }

        if (!changed) continue;

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
