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

  /** Hard cap to avoid runaway crawling (still small sites). */
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

export const WEB_SOURCES: WebSourceConfig[] = [
  // Wix public pages (HTML crawl): take all published public pages on both small sites.
  {
    name: "Fairyplace (Wix)",
    type: "wix",
    domain: "www.fairyplace.biz",
    primaryLanguage: "en",
    startUrls: ["https://www.fairyplace.biz/"],
    // For Wix sites we allow the whole site, but still deny obvious non-content areas.
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
    // Allow everything under the site root path.
    allowedPathPrefixes: ["/fairyplace"],
    mode: "prefix",
    source: "page",
    denyPathSubstrings: DEFAULT_DENY_PATH_SUBSTRINGS,
    maxPagesPerRun: 200,
  },

  // External: Spoonflower (prefix-based allowlist agreed with user)
  {
    name: "Spoonflower",
    type: "external",
    domain: "www.spoonflower.com",
    primaryLanguage: "en",
    startUrls: [
      // Fabric types + below
      "https://www.spoonflower.com/en/fabric",

      // Wallpaper categories + below
      "https://www.spoonflower.com/en/wallpaper",

      // Explore Home Decor + below
      "https://www.spoonflower.com/en/home-decor",

      // About/how/purpose + below
      "https://www.spoonflower.com/en/about",
      "https://www.spoonflower.com/en/how-it-works",
      "https://www.spoonflower.com/en/purpose-impact",

      // Legal single pages (treated as prefixes too; ok)
      "https://www.spoonflower.com/en/terms-of-service",
      "https://www.spoonflower.com/en/privacy-notice",
      "https://www.spoonflower.com/en/accessibility",
    ],
    mode: "prefix",
    source: "page",
    denyPathSubstrings: DEFAULT_DENY_PATH_SUBSTRINGS,
    maxPagesPerRun: 500,
  },

  // External: Bags of Love
  {
    name: "BagsOfLove",
    type: "external",
    domain: "www.bagsoflove.com",
    primaryLanguage: "en",
    startUrls: [
      "https://www.bagsoflove.com/contact-us",
      "https://www.bagsoflove.com/discounts",
      "https://www.bagsoflove.com/faq",
      "https://www.bagsoflove.com/delivery",
      "https://www.bagsoflove.com/returns",
      "https://www.bagsoflove.com/terms-and-conditions",
      "https://www.bagsoflove.com/privacy-policy",
      "https://www.bagsoflove.com/affiliates",
      "https://www.bagsoflove.com/wholesale-accounts",
      "https://www.bagsoflove.com/merchandise",
      "https://www.bagsoflove.com/about-us",

      // Product pages (self-design) - prefix scope; exact structure can evolve.
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
  // Derive from startUrls.
  return source.startUrls
    .map((u) => {
      const url = new URL(u);
      const p = url.pathname;
      // Normalize: keep at least "/".
      return p.length ? p : "/";
    })
    .filter(Boolean);
}

export function isAllowedUrlForSource(url: URL, source: WebSourceConfig): boolean {
  if (url.hostname !== source.domain) return false;

  // Only http(s)
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;

  const prefixes = getAllowedPrefixesForSource(source);
  const okPrefix = prefixes.some((p) => url.pathname === p || url.pathname.startsWith(p.endsWith("/") ? p : `${p}/`) || (p === "/" && url.pathname.startsWith("/")));
  if (!okPrefix) return false;

  const deny = [...DEFAULT_DENY_PATH_SUBSTRINGS, ...(source.denyPathSubstrings ?? [])];
  if (deny.some((s) => url.pathname.toLowerCase().includes(s))) return false;

  return true;
}
