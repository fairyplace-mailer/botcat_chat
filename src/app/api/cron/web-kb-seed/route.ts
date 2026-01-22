import { NextResponse } from "next/server";

import { CronLock } from "@/server/cron/cron-lock";
import { logCleanupRun } from "@/server/cleanup/log";
import { seedWebSources } from "@/server/rag/web-kb";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);

  // Temporary: no auth check yet (will be added per rag_spec)

  const force = url.searchParams.get("force") === "1";

  try {
    const result = await CronLock.runOncePerDay({
      lockName: "web-kb-seed",
      dateKey: new Date().toISOString().slice(0, 10),
      force,
      fn: async () => {
        return seedWebSources({
          maxPages: 1500,
          maxDurationMs: 6500,
        });
      },
    });

    await logCleanupRun({
      kind: "web-kb-seed",
      ok: result.ok,
    });

    return NextResponse.json({ forced: force, ...result });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    await logCleanupRun({
      kind: "web-kb-seed",
      ok: false,
      error: msg,
    });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
