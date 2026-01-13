import { prisma } from "@/lib/prisma";
import { chunkMarkdownByHeadings } from "@/server/rag/chunking";
import { openai, selectBotCatEmbeddingModel } from "@/lib/openai";
import type { ContentSource, SiteType } from "@prisma/client";
import {
  isAllowedUrlForSource,
  type WebSourceConfig,
  WEB_SOURCES,
} from "@/server/rag/web-sources";
import crypto from "node:crypto";
import { marked } from "marked";

const USER_AGENT = "BotCat/1.0 (+https://www.fairyplace.biz)";
const FETCH_TIMEOUT_MS = 20_000;

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stripHtmlToText(html: string): string {
  // Very simple & robust extraction without DOM dependencies.
  // 1) Remove script/style/svg/noscript
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");

  // 2) Convert some block tags to newlines
  s = s.replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/section|\/article)>/gi, "\n");

  // 3) Drop remaining tags
  s = s.replace(/<[^>]+>/g, " ");

  // 4) Decode minimal entities (enough for our KB)
  s = s
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'");

  // 5) Normalize
  return normalizeWhitespace(s);
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  return normalizeWhitespace(stripHtmlToText(m[1]));
}

function extractLinks(baseUrl: URL, html: string): URL[] {
  const urls: URL[] = [];
  const re = /href\s*=\s*(["'])(.*?)\1/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = (m[2] ?? "").trim();
    if (!raw) continue;
    if (raw.startsWith("#")) continue;
    if (raw.startsWith("mailto:")) continue;
    if (raw.startsWith("tel:")) continue;
    if (raw.startsWith("javascript:")) continue;

    try {
      const u = new URL(raw, baseUrl);
      // Drop hash
      u.hash = "";
      urls.push(u);
    } catch {
      // ignore
    }
  }
  return urls;
}

function extractImages(
  baseUrl: URL,
  html: string
): Array<{ url: URL; alt: string | null }> {
  const imgs: Array<{ url: URL; alt: string | null }> = [];
  const re = /<img\b[^>]*>/gi;
  const srcRe = /\ssrc\s*=\s*(["'])(.*?)\1/i;
  const altRe = /\salt\s*=\s*(["'])(.*?)\1/i;

  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const srcM = tag.match(srcRe);
    if (!srcM) continue;
    const rawSrc = (srcM[2] ?? "").trim();
    if (!rawSrc) continue;

    try {
      const u = new URL(rawSrc, baseUrl);
      u.hash = "";
      const altM = tag.match(altRe);
      const alt = altM ? normalizeWhitespace(stripHtmlToText(altM[2] ?? "")) : null;
      imgs.push({ url: u, alt });
    } catch {
      // ignore
    }
  }
  return imgs;
}

async function fetchText(url: URL): Promise<{
  ok: boolean;
  status: number;
  text: string;
  contentType: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    const contentType = res.headers.get("content-type") ?? "";
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, contentType };
  } finally {
    clearTimeout(timeout);
  }
}

function isHtmlContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return ct.includes("text/html") || ct.includes("application/xhtml+xml");
}

function urlPathnameForRobots(url: URL): string {
  const p = url.pathname || "/";
  return url.search ? `${p}${url.search}` : p;
}

function parseRobotsTxtDisallow(robotsTxt: string): string[] {
  // Minimal robots parser:
  // - read blocks for "User-agent: *" and also for "User-agent: BotCat"
  // - collect Disallow rules from those blocks
  // - ignore Allow/Crawl-delay/etc.
  const lines = robotsTxt
    .split(/\r?\n/)
    .map((l) => l.split("#")[0].trim())
    .filter(Boolean);

  const disallow: string[] = [];

  let active = false;
  let seenRelevantUa = false;

  for (const line of lines) {
    const m = line.match(/^(user-agent|disallow)\s*:\s*(.*)$/i);
    if (!m) continue;

    const key = m[1].toLowerCase();
    const value = (m[2] ?? "").trim();

    if (key === "user-agent") {
      // Start of a new UA line. In robots.txt blocks UA lines can repeat.
      const ua = value.toLowerCase();
      active = ua === "*" || ua === "botcat";
      if (active) seenRelevantUa = true;
      continue;
    }

    if (key === "disallow" && active) {
      // Empty Disallow means allow all.
      if (!value) continue;
      disallow.push(value);
    }
  }

  // If file exists but had no relevant UA, be conservative and treat as allow all.
  if (!seenRelevantUa) return [];

  return disallow;
}

function isAllowedByRobots(params: {
  url: URL;
  disallowRules: string[];
}): boolean {
  const path = urlPathnameForRobots(params.url);

  for (const rule of params.disallowRules) {
    // Support the common simple prefix semantics.
    // Ignore wildcards for now.
    if (rule === "/") return false;
    if (path.startsWith(rule)) return false;
  }

  return true;
}

async function getRobotsDisallowForDomain(domain: string): Promise<string[]> {
  // Cache per-process in memory. Enough for cron job.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  g.__botcatRobotsCache = g.__botcatRobotsCache ?? new Map<string, string[]>();
  const cache: Map<string, string[]> = g.__botcatRobotsCache;

  const cached = cache.get(domain);
  if (cached) return cached;

  try {
    const url = new URL(`https://${domain}/robots.txt`);
    const res = await fetchText(url);
    if (!res.ok) {
      cache.set(domain, []);
      return [];
    }
    const rules = parseRobotsTxtDisallow(res.text);
    cache.set(domain, rules);
    return rules;
  } catch {
    cache.set(domain, []);
    return [];
  }
}

async function upsertSite(params: {
  domain: string;
  name: string;
  type: SiteType;
  primaryLanguage: string;
}): Promise<{ id: string }> {
  return prisma.site.upsert({
    where: { domain: params.domain },
    create: {
      name: params.name,
      domain: params.domain,
      type: params.type,
      primary_language: params.primaryLanguage,
    },
    update: {
      name: params.name,
      type: params.type,
      primary_language: params.primaryLanguage,
    },
    select: { id: true },
  });
}

function shouldSkipByFetchedAt(
  fetchedAt: Date | null | undefined,
  now: Date
): boolean {
  if (!fetchedAt) return false;
  const ageMs = now.getTime() - fetchedAt.getTime();
  return ageMs < 24 * 60 * 60 * 1000;
}

async function upsertPage(params: {
  siteId: string;
  url: string;
  title: string | null;
  source: ContentSource;
  fetchedAt: Date;
}): Promise<{ id: string; fetched_at: Date | null }> {
  return prisma.page.upsert({
    where: { site_id_url: { site_id: params.siteId, url: params.url } },
    create: {
      site_id: params.siteId,
      url: params.url,
      title: params.title,
      source: params.source,
      fetched_at: params.fetchedAt,
    },
    update: {
      title: params.title,
      source: params.source,
      fetched_at: params.fetchedAt,
    },
    select: { id: true, fetched_at: true },
  });
}

async function writeSectionsWithEmbeddings(params: {
  pageId: string;
  source: ContentSource;
  markdownText: string;
}): Promise<{ sectionsWritten: number }> {
  const chunks = chunkMarkdownByHeadings(params.markdownText, {
    maxChars: 2400,
    minChars: 200,
  });
  const embeddingModel = selectBotCatEmbeddingModel();

  let sectionsWritten = 0;

  for (const c of chunks) {
    const content = c.contentMd.trim();
    if (!content) continue;

    const contentHash = sha256(content);

    const emb = await openai.embeddings.create({
      model: embeddingModel,
      input: content,
    });
    const vector = emb.data?.[0]?.embedding;
    if (!Array.isArray(vector)) {
      throw new Error("Embedding response missing embedding[]");
    }

    await prisma.section.upsert({
      where: { page_id_content_hash: { page_id: params.pageId, content_hash: contentHash } },
      create: {
        page_id: params.pageId,
        content,
        content_hash: contentHash,
        source: params.source,
        embedding_model: embeddingModel,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vector: vector as any,
        dims: vector.length,
      },
      update: {
        content,
        source: params.source,
        embedding_model: embeddingModel,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vector: vector as any,
        dims: vector.length,
      },
    });

    sectionsWritten++;
  }

  return { sectionsWritten };
}

async function writeImages(params: {
  pageId: string;
  source: ContentSource;
  images: Array<{ url: URL; alt: string | null }>;
}): Promise<{ imagesWritten: number }> {
  if (!params.images.length) return { imagesWritten: 0 };

  await prisma.image.deleteMany({ where: { page_id: params.pageId } });

  await prisma.image.createMany({
    data: params.images.map((img) => ({
      page_id: params.pageId,
      url: img.url.toString(),
      alt_text: img.alt,
      source: params.source,
    })),
  });

  return { imagesWritten: params.images.length };
}

function htmlToMarkdownText(html: string, title: string | null): string {
  // Basic structure: prepend title as H1 if present.
  // Keep the conversion stable and avoid DOM.
  const text = stripHtmlToText(html);
  const body = String(marked.parseInline(text)).trim() || text;

  if (title) return `# ${title}\n\n${body}`;
  return body;
}

export async function crawlWebSources(params?: {
  sources?: WebSourceConfig[];
  now?: Date;
}): Promise<{
  sourcesTotal: number;
  pagesVisited: number;
  pagesFetched: number;
  pagesSkipped24h: number;
  pagesIgnoredByRules: number;
  pagesDisallowedByRobots: number;
  pagesNonHtml: number;
  pagesFailedFetch: number;
  sectionsWritten: number;
  imagesWritten: number;
}> {
  const sources = params?.sources ?? WEB_SOURCES;
  const now = params?.now ?? new Date();

  let pagesVisited = 0;
  let pagesFetched = 0;
  let pagesSkipped24h = 0;
  let pagesIgnoredByRules = 0;
  let pagesDisallowedByRobots = 0;
  let pagesNonHtml = 0;
  let pagesFailedFetch = 0;
  let sectionsWritten = 0;
  let imagesWritten = 0;

  for (const source of sources) {
    const site = await upsertSite({
      domain: source.domain,
      name: source.name,
      type: source.type,
      primaryLanguage: source.primaryLanguage,
    });

    const robotsDisallow = await getRobotsDisallowForDomain(source.domain);

    const queue: URL[] = [];
    const seen = new Set<string>();

    for (const u of source.startUrls) {
      try {
        const url = new URL(u);
        url.hash = "";
        queue.push(url);
      } catch {
        // ignore
      }
    }

    while (queue.length > 0 && seen.size < source.maxPagesPerRun) {
      const url = queue.shift()!;
      const key = url.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      pagesVisited++;

      if (!isAllowedUrlForSource(url, source)) {
        pagesIgnoredByRules++;
        continue;
      }

      if (!isAllowedByRobots({ url, disallowRules: robotsDisallow })) {
        pagesDisallowedByRobots++;
        continue;
      }

      const existing = await prisma.page.findUnique({
        where: { site_id_url: { site_id: site.id, url: key } },
        select: { fetched_at: true, id: true },
      });

      if (existing?.fetched_at && shouldSkipByFetchedAt(existing.fetched_at, now)) {
        pagesSkipped24h++;
        continue;
      }

      let res:
        | { ok: boolean; status: number; text: string; contentType: string }
        | undefined;
      try {
        res = await fetchText(url);
      } catch {
        pagesFailedFetch++;
        continue;
      }

      if (!res.ok) {
        pagesFailedFetch++;
        continue;
      }
      if (!isHtmlContentType(res.contentType)) {
        pagesNonHtml++;
        continue;
      }

      pagesFetched++;

      const title = extractTitle(res.text);

      const page = await upsertPage({
        siteId: site.id,
        url: key,
        title,
        source: source.source,
        fetchedAt: now,
      });

      await prisma.section.deleteMany({ where: { page_id: page.id } });

      const md = htmlToMarkdownText(res.text, title);
      const writeSec = await writeSectionsWithEmbeddings({
        pageId: page.id,
        source: source.source,
        markdownText: md,
      });
      sectionsWritten += writeSec.sectionsWritten;

      const imgs = extractImages(url, res.text);
      const writeImg = await writeImages({
        pageId: page.id,
        source: source.source,
        images: imgs,
      });
      imagesWritten += writeImg.imagesWritten;

      const links = extractLinks(url, res.text);
      for (const l of links) {
        if (l.hostname !== source.domain) continue;
        if (!isAllowedUrlForSource(l, source)) continue;
        if (!isAllowedByRobots({ url: l, disallowRules: robotsDisallow })) continue;
        queue.push(l);
      }
    }
  }

  return {
    sourcesTotal: sources.length,
    pagesVisited,
    pagesFetched,
    pagesSkipped24h,
    pagesIgnoredByRules,
    pagesDisallowedByRobots,
    pagesNonHtml,
    pagesFailedFetch,
    sectionsWritten,
    imagesWritten,
  };
}
