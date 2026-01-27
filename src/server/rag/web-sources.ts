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
      // auth/account/checkout flows
      "/account",
      "/checkout",
      "/cart",
      "/search",
      "/login",
      "/register",
      "/compare",
      "/my-",

      // explicitly excluded (noise / not needed for POD KB)
      "/Wishlist",
      "/affiliate",
      "/blog",
      "/contact",
      "/face-tool/",
    ],
  },
  {
    id: "spoonflower",
    name: "Spoonflower Help/Info",
    type: "external",
    domain: "www.spoonflower.com",
    // Start from EN root, but keep a few known hubs as fallback.
    startUrls: [
      "https://www.spoonflower.com/en",
      "https://www.spoonflower.com/en/help",
      "https://www.spoonflower.com/en/faq",
      "https://www.spoonflower.com/en/how-it-works",
    ],
    source: "page",
    primaryLanguage: "en",
    refreshIntervalHours: 24 * 30,
    // Curated list is smaller; still cap for safety.
    maxPagesPerRun: 1500,
    mode: "curated",
    // Goal: keep ONLY English (/en...) and include customer/policy + product info.
    allowPathPrefixes: [
      // allow root so we can discover links
      "/en",

      // customer-facing help/policies/info
      "/en/help",
      "/en/faq",
      "/en/how-it-works",
      "/en/about",
      "/en/contact",
      "/en/privacy",
      "/en/terms",
      "/en/returns",
      "/en/shipping",

      // product categories & product information
      "/en/fabric",
      "/en/wallpaper",
      "/en/home-decor",
      "/en/printing",
      "/en/quality",
      "/en/products",
      "/en/product",
      "/en/pricing",
    ],
    // Exclude designers/marketplace + individual design sales flows + account/commerce noise.
    denyPathSubstrings: [
      // designers / marketplace / individual designs
      "/designers",
      "/designer",
      "/design/",
      "/designs",
      "/collection",
      "/collections",
      "/shop",
      "/marketplace",
      "/sponsored",
      "/sponsor",
      "/sell",

      // shopping / account flows
      "/search",
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
