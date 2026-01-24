import type { ContentSource, SiteType } from "@prisma/client";

export type CrawlMode = "prefix";

export type WebSourceConfig = {
  name: string;
  type: SiteType;
  domain: string;
  primaryLanguage: string;

  /**
   * Starting points for crawl.
   * For mode=prefix we only keep URLs with pathname starting with any prefix.
   */
  startUrls: string[];

  /**
   * For mode=prefix we will allow any URL whose pathname starts with one of these prefixes.
   * If omitted, prefixes are derived from startUrls.
   */
  allowedPathPrefixes?: string[];

  /** Always prefix per agreed rule. */
  mode: CrawlMode;

  /** Which ContentSource to store for pages/sections of this source. */
  source: ContentSource;

  /**
   * Extra deny patterns (applied after prefix allow).
   * Use for obvious disallowed areas like checkout/account/cart.
   */
  denyPathSubstrings?: string[];

  /** Hard cap to avoid runaway crawling. */
  maxPagesPerRun: number;
};

const DEFAULT_DENY_PATH_SUBSTRINGS = [
  "/account",
  "/login",
  "/signin",
  "/signup",
  "/register",
  "/cart",
  "/checkout",
  "/order",
  "/my-account",
  "/community",
  "/forum",
  "/reviews",
  "/ugc",
  "/wishlist",
  "/compare",
  "/search",
];

const DENY_EXTENSIONS = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
  ".css",
  ".js",
  ".mjs",
  ".json",
  ".xml",
  ".txt",
  ".zip",
  ".rar",
  ".7z",
  ".tar",
  ".gz",
  ".mp4",
  ".mov",
  ".webm",
  ".mp3",
  ".wav",
]);

function hasDeniedExtension(pathname: string): boolean {
  const p = pathname.toLowerCase();
  // Ignore trailing slashes.
  const trimmed = p.endsWith("/") ? p.slice(0, -1) : p;
  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot === -1) return false;
  const ext = trimmed.slice(lastDot);
  return DENY_EXTENSIONS.has(ext);
}

/**
 * Spoonflower is extremely large due to user-generated design catalogs.
 * Keep crawl strictly within curated informational sections.
 */
const SPOONFLOWER_ALLOWED_PREFIXES = [
  "/en/help",
  "/en/returns",
  "/en/shipping",
  "/en/terms-of-service",
  "/en/privacy-notice",
  "/en/accessibility",
  "/en/how-it-works",
  "/en/about",
];

const SPOONFLOWER_DENY_SUBSTRINGS = [
  // Design/designer/catalog areas
  "/design",
  "/designer",
  "/designers",
  "/collection",
  "/collections",
  "/designs",
  "/marketplace",
  // Catalog/shop-like areas (too big and mostly design-driven)
  "/shop",
  "/wallpaper",
  "/fabric",
  "/gift-wrap",
  "/home-decor",
  "/decor",
];

export const WEB_SOURCES: WebSourceConfig[] = [
  // Wix public pages (HTML crawl)
  {
    name: "Fairyplace (Wix)",
    type: "wix",
    domain: "www.fairyplace.biz",
    primaryLanguage: "en",
    startUrls: ["https://www.fairyplace.biz/"],
    mode: "prefix",
    source: "page",
    denyPathSubstrings: DEFAULT_DENY_PATH_SUBSTRINGS,
    maxPagesPerRun: 200,
  },
  {
    name: "Fairyplace UA (Wix)",
    type: "wix",
    domain: "fairyplaceua.wixsite.com",
    primaryLanguage: "en",
    startUrls: ["https://fairyplaceua.wixsite.com/fairyplace"],
    allowedPathPrefixes: ["/fairyplace"],
    mode: "prefix",
    source: "page",
    denyPathSubstrings: DEFAULT_DENY_PATH_SUBSTRINGS,
    maxPagesPerRun: 200,
  },

  // External: Spoonflower (curated: exclude designer/design catalogs)
  {
    name: "Spoonflower",
    type: "external",
    domain: "www.spoonflower.com",
    primaryLanguage: "en",
    startUrls: [
      "https://www.spoonflower.com/en/help",
      "https://www.spoonflower.com/en/help/articles",
      "https://www.spoonflower.com/en/returns",
      "https://www.spoonflower.com/en/shipping",
      "https://www.spoonflower.com/en/terms-of-service",
      "https://www.spoonflower.com/en/privacy-notice",
      "https://www.spoonflower.com/en/accessibility",
      "https://www.spoonflower.com/en/how-it-works",
      "https://www.spoonflower.com/en/about",
    ],
    allowedPathPrefixes: SPOONFLOWER_ALLOWED_PREFIXES,
    mode: "prefix",
    source: "page",
    denyPathSubstrings: [...DEFAULT_DENY_PATH_SUBSTRINGS, ...SPOONFLOWER_DENY_SUBSTRINGS],
    maxPagesPerRun: 500,
  },

  // External: Bags of Love (read almost everything public)
  {
    name: "BagsOfLove",
    type: "external",
    domain: "www.bagsoflove.com",
    primaryLanguage: "en",
    startUrls: [
      "https://www.bagsoflove.com/",
      "https://www.bagsoflove.com/contact-us",
      "https://www.bagsoflove.com/discounts",
      "https://www.bagsoflove.com/faq",
      "https://www.bagsoflove.com/delivery",
      "https://www.bagsoflove.com/returns",
      "https://www.bagsoflove.com/terms-and-conditions",
      "https://www.bagsoflove.com/privacy-policy",
      "https://www.bagsoflove.com/wholesale-accounts",
      "https://www.bagsoflove.com/about-us",
      "https://www.bagsoflove.com/products",
    ],
    mode: "prefix",
    source: "page",
    denyPathSubstrings: DEFAULT_DENY_PATH_SUBSTRINGS,
    maxPagesPerRun: 500,
  },
];

export function getAllowedPrefixesForSource(source: WebSourceConfig): string[] {
  if (source.allowedPathPrefixes?.length) return source.allowedPathPrefixes;
  return source.startUrls
    .map((u) => {
      const url = new URL(u);
      const p = url.pathname;
      return p.length ? p : "/";
    })
    .filter(Boolean);
}

export function isAllowedUrlForSource(url: URL, source: WebSourceConfig): boolean {
  if (url.hostname !== source.domain) return false;
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;

  // Fast rejects: avoid queueing obvious non-html assets during seed.
  const protocol = url.protocol.toLowerCase();
  if (protocol === "mailto:" || protocol === "tel:") return false;

  if (hasDeniedExtension(url.pathname)) return false;

  const prefixes = getAllowedPrefixesForSource(source);
  const okPrefix = prefixes.some(
    (p) =>
      url.pathname === p ||
      url.pathname.startsWith(p.endsWith("/") ? p : `${p}/`) ||
      (p === "/" && url.pathname.startsWith("/"))
  );
  if (!okPrefix) return false;

  const deny = [...DEFAULT_DENY_PATH_SUBSTRINGS, ...(source.denyPathSubstrings ?? [])];
  if (deny.some((s) => url.pathname.toLowerCase().includes(s))) return false;

  return true;
}
