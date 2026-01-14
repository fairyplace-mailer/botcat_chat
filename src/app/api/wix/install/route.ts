import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getStringParam(url: URL, name: string): string {
  const v = url.searchParams.get(name);
  return (v ?? "").trim();
}

function serializeError(err: unknown) {
  if (err instanceof Error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyErr = err as any;
    return {
      name: err.name,
      message: err.message,
      code: anyErr?.code,
    };
  }
  return { name: "UnknownError", message: String(err) };
}

/**
 * Wix app install callback.
 *
 * Wix redirects here during install/re-install:
 *   /api/wix/install?instance=...&wixSiteId=...
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const wixSiteId = getStringParam(url, "wixSiteId");
    const instanceId = getStringParam(url, "instance");

    if (!wixSiteId || !instanceId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing required query params: wixSiteId and instance",
        },
        { status: 400 },
      );
    }

    // Ensure Site row exists and store Wix identifiers.
    // Domain/name may be unknown at install time.
    const domain = `wix:${wixSiteId}`;

    const site = await prisma.site.upsert({
      where: { domain },
      create: {
        name: domain,
        domain,
        type: "wix",
        wix_site_id: wixSiteId,
        wix_instance_id: instanceId,
        primary_language: "en",
      },
      update: {
        wix_site_id: wixSiteId,
        wix_instance_id: instanceId,
        updated_at: new Date(),
      },
    });

    return NextResponse.json({ ok: true, siteId: site.id, wixSiteId });
  } catch (err) {
    console.error("/api/wix/install failed", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Internal error",
        details: serializeError(err),
      },
      { status: 500 },
    );
  }
}
