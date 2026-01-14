import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mask(s: string | null) {
  if (!s) return null;
  if (s.length <= 8) return "********";
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";

  if (!env.WIX_ADMIN_TOKEN) {
    return NextResponse.json(
      { ok: false, error: "WIX_ADMIN_TOKEN is not configured" },
      { status: 500 },
    );
  }

  if (token !== env.WIX_ADMIN_TOKEN) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const sites = await prisma.site.findMany({
    where: { type: "wix" },
    select: {
      id: true,
      domain: true,
      wix_site_id: true,
      wix_instance_id: true,
      updated_at: true,
      created_at: true,
    },
    orderBy: { updated_at: "desc" },
    take: 50,
  });

  return NextResponse.json({
    ok: true,
    count: sites.length,
    sites: sites.map((s) => ({
      ...s,
      wix_site_id: mask(s.wix_site_id),
      wix_instance_id: mask(s.wix_instance_id),
    })),
  });
}
