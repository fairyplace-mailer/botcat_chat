import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { ingestReferenceContext } from "@/server/rag/ingest";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const token = req.headers.get("x-admin-token") ?? "";
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const result = await ingestReferenceContext();
    return NextResponse.json({ ok: true, ...result, ms: Date.now() - startedAt });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err), ms: Date.now() - startedAt },
      { status: 500 },
    );
  }
}
