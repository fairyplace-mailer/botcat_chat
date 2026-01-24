export type WebSourceType = "external" | "wix";

export interface WebSource {
  id: string;
  type: WebSourceType;
  domain: string;
  startUrls: string[];
  /** How frequently pages from this source should be refreshed */
  refreshIntervalHours: number;
  /** Optional mode-specific allow rules */
  mode?: "prefix" | "curated";
  /** Only allow URLs under these path prefixes (if mode === "curated") */
  allowPathPrefixes?: string[];
  /** Deny if URL pathname includes any of these substrings */
  denyPathSubstrings?: string[];
}

export const WEB_SOURCES: WebSource[] = [
  {
    id: "bagsoflove",
    type: "external",
    domain: "www.bagsoflove.com",
    startUrls: ["https://www.bagsoflove.com/"],
    refreshIntervalHours: 24 * 30,
    mode: "prefix",
    denyPathSubstrings: [
      "/account",
      "/checkout",
      "/cart",
      "/search",
      "/login",
      "/register",
      "/wishlist",
      "/compare",
      "/my-",
    ],
  },
  {
    id: "spoonflower",
    type: "external",
    domain: "www.spoonflower.com",
    startUrls: ["https://www.spoonflower.com/en"],
    refreshIntervalHours: 24 * 30,
    mode: "curated",
    allowPathPrefixes: [
      "/en/help",
      "/en/shipping",
      "/en/fabric",
      "/en/wallpaper",
      "/en/home-decor",
      "/en/faq",
      "/en/how-it-works",
      "/en/about",
      "/en/printing",
      "/en/quality",
      "/en/returns",
      "/en/contact",
      "/en/privacy",
      "/en/terms",
    ],
    denyPathSubstrings: [
      "/design",
      "/designer",
      "/collection",
      "/shop",
      "/marketplace",
      "/search",
      "/sponsor",
      "/favorites",
      "/my-",
      "/account",
      "/cart",
      "/checkout",
      "/login",
      "/register",
    ],
  },
];

// Avoid enqueueing obvious non-HTML assets during discovery.
const DENY_EXTENSIONS = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
  ".ico",
  ".css",
  ".js",
  ".map",
  ".zip",
  ".rar",
  ".7z",
  ".gz",
  ".tgz",
  ".mp4",
  ".webm",
  ".mp3",
  ".wav",
  ".mov",
]);

function hasDeniedExtension(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  for (const ext of DENY_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

export function isAllowedUrlForSource(source: WebSource, url: URL): boolean {
  if (url.hostname !== source.domain) return false;

  // Only crawl http(s) URLs. Non-http schemes (mailto/tel/etc.) are rejected here.
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;

  if (hasDeniedExtension(url.pathname)) return false;

  const pathname = url.pathname || "/";

  // Curated sources: allow only specific prefixes.
  if (source.mode === "curated") {
    const allowPrefixes = source.allowPathPrefixes ?? [];
    const allowedByPrefix = allowPrefixes.some((p) => pathname.startsWith(p));
    if (!allowedByPrefix) return false;
  }

  // Deny by substring.
  if (source.denyPathSubstrings?.some((s) => pathname.includes(s))) return false;

  // Prefix mode: allow everything under domain (after deny rules), optionally constrain later.
  return true;
}
