import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Debug endpoint: lists Wix sites saved via /api/wix/install.
 *
 * NOTE: This is intentionally not linked anywhere. If you want to restrict it,
 * we can gate it by a secret header/token.
 */
export async function GET(_req: NextRequest) {
  const sites = await prisma.site.findMany({
    where: {
      type: "wix",
      NOT: [{ wix_site_id: null }, { wix_instance_id: null }],
    },
    select: {
      id: true,
      domain: true,
      wix_site_id: true,
      wix_instance_id: true,
      updated_at: true,
      created_at: true,
    },
    orderBy: { updated_at: "desc" },
    take: 20,
  });

  return NextResponse.json({ ok: true, count: sites.length, sites });
}
