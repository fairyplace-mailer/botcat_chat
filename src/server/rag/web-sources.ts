export type WebSourceType = "external" | "wix";

export interface WebSource {
  id: string;
  /** Human-friendly label (stored in Site.name) */
  name: string;
  type: WebSourceType;
  domain: string;
  startUrls: string[];
  /** ContentSource used when storing sections/pages */
  source: "page";
  /** Primary language hint (stored in Site.primary_language) */
  primaryLanguage: string;
  /** How frequently pages from this source should be refreshed */
  refreshIntervalHours: number;
  /** Optional cap per run for seed/crawl */
  maxPagesPerRun?: number;

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
    name: "Bags of Love",
    type: "external",
    domain: "www.bagsoflove.com",
    startUrls: ["https://www.bagsoflove.com/"],
    source: "page",
    primaryLanguage: "en",
    refreshIntervalHours: 24 * 30,
    mode: "prefix",
    // Hobby-friendly cap: seed must finish fast.
    maxPagesPerRun: 1500,
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
    name: "Spoonflower Help/Info",
    type: "external",
    domain: "www.spoonflower.com",
    startUrls: ["https://www.spoonflower.com/en"],
    source: "page",
    primaryLanguage: "en",
    refreshIntervalHours: 24 * 30,
    // Curated list is smaller; still cap for safety.
    maxPagesPerRun: 1500,
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

  // Only crawl http(s) URLs.
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
