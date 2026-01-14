import { env } from "@/lib/env";

export interface WixAccessToken {
  accessToken: string;
  expiresAt: Date;
}

const tokenCache = new Map<string, WixAccessToken>();

function nowMs() {
  return Date.now();
}

function isFresh(t: WixAccessToken): boolean {
  // refresh a bit earlier (60s)
  return t.expiresAt.getTime() - nowMs() > 60_000;
}

/**
 * Exchange Wix instanceId to an OAuth access token (per-site).
 *
 * POST https://www.wix.com/oauth/access
 * {
 *   grant_type: "client_credentials",
 *   client_id: <WIX_APP_ID>,
 *   client_secret: <WIX_APP_SECRET>,
 *   instance_id: <INSTANCE_ID>
 * }
 */
export async function wixExchangeInstanceToAccessToken(params: {
  wixSiteId: string;
  instanceId: string;
}): Promise<WixAccessToken> {
  const { wixSiteId, instanceId } = params;

  if (!env.WIX_APP_ID || !env.WIX_APP_SECRET) {
    throw new Error("WIX_APP_ID/WIX_APP_SECRET are required for Wix OAuth");
  }

  const cached = tokenCache.get(wixSiteId);
  if (cached && isFresh(cached)) return cached;

  const res = await fetch("https://www.wix.com/oauth/access", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: env.WIX_APP_ID,
      client_secret: env.WIX_APP_SECRET,
      instance_id: instanceId,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Wix OAuth exchange failed: ${res.status} ${text}`);
  }

  const json: any = await res.json();
  const accessToken = typeof json?.access_token === "string" ? json.access_token : "";
  const expiresIn = typeof json?.expires_in === "number" ? json.expires_in : 0;

  if (!accessToken || !expiresIn) {
    throw new Error("Wix OAuth exchange returned invalid payload");
  }

  const token: WixAccessToken = {
    accessToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  };

  tokenCache.set(wixSiteId, token);
  return token;
}
