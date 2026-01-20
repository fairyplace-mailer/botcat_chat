import { prisma } from "@/lib/prisma";
import type { ContentSource } from "@prisma/client";
import crypto from "node:crypto";
import { openai, selectBotCatEmbeddingModel } from "@/lib/openai";
import {
  isAllowedUrlForSource,
  type WebSourceConfig,
  WEB_SOURCES,
} from "@/server/rag/web-sources";
import { chunkMarkdownByHeadings } from "@/server/rag/chunking";
import { updateSectionVector } from "@/server/rag/pgvector";

const USER_AGENT = "BotCat/1.0 (+https://www.fairyplace.biz)";
const FETCH_TIMEOUT_MS = 20_000;

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function addHours(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeUrlForKey(input: URL): URL {
  const u = new URL(input.toString());
  u.hash = "";

  // Drop common tracking params
  const dropPrefixes = ["utm_"];
  const dropExact = new Set([
    "gclid",
    "fbclid",
    "msclkid",
    "yclid",
    "mc_cid",
    "mc_eid",
  ]);

  const next = new URL(u.toString());
  next.searchParams.forEach((_, k) => {
    const kl = k.toLowerCase();
    if (dropExact.has(kl) || dropPrefixes.some((p) => kl.startsWith(p))) {
      next.searchParams.delete(k);
    }
  });

  // Canonicalize: sort params for stable key
  const entries = Array.from(next.searchParams.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  next.search = "";
  for (const [k, v] of entries) next.searchParams.append(k, v);

  return next;
}

function stripHtmlToText(html: string): string {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");

  s = s.replace(
    /<(br|\/p|\/div|\/li|\/h\d|\/tr|\/section|\/article)>/gi,
    "\n"
  );
  s = s.replace(/<[^>]+>/g, " ");

  s = s
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'");

  return normalizeWhitespace(s);
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  return normalizeWhitespace(stripHtmlToText(m[1]));
}

function extractMainContentHtml(html: string): string {
  const tryTag = (tag: string): string | null => {
    const re = new RegExp(
      `<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`,
      "i"
    );
    const m = html.match(re);
    return m?.[1] ? String(m[1]) : null;
  };

  const main = tryTag("main");
  if (main && main.length > 200) return main;

  const article = tryTag("article");
  if (article && article.length > 200) return article;

  const sectionRe = /<section\b[^>]*>([\s\S]*?)<\/section>/gi;
  let best: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = sectionRe.exec(html))) {
    const body = m[1] ?? "";
    if (!best || body.length > best.length) best = body;
  }
  if (best && best.length > 200) return best;

  return html;
}

function htmlToTextForHash(html: string, title: string | null): string {
  const mainHtml = extractMainContentHtml(html);
  const text = stripHtmlToText(mainHtml);
  if (title) return `# ${title}\n\n${text}`;
  return text;
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
      urls.push(normalizeUrlForKey(u));
    } catch {
      // ignore
    }
  }
  return urls;
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

async function upsertSite(params: {
  domain: string;
  name: string;
  type: "external" | "wix";
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

function classifyRefreshIntervalHours(url: URL): number {
  const p = url.pathname.toLowerCase();

  // Daily: pricing, shipping, delivery, returns, policies, coupons, wholesale.
  const daily = [
    "pricing",
    "price",
    "shipping",
    "delivery",
    "returns",
    "return",
    "refund",
    "policy",
    "policies",
    "privacy",
    "terms",
    "conditions",
    "discount",
    "coupon",
    "coupons",
    "promo",
    "promotion",
    "wholesale",
  ];

  if (daily.some((k) => p.includes(k))) return 24;

  // Default: 20 days
  return 24 * 20;
}

export async function seedWebSources(params: {
  sources?: WebSourceConfig[];
  maxPagesPerSource: number;
}): Promise<{ sourcesTotal: number; pagesVisited: number; pagesUpserted: number }> {
  const sources = params.sources ?? WEB_SOURCES.filter((s) => s.type === "external");

  let pagesVisited = 0;
  let pagesUpserted = 0;

  for (const source of sources) {
    const site = await upsertSite({
      domain: source.domain,
      name: source.name,
      type: source.type,
      primaryLanguage: source.primaryLanguage,
    });

    const queue: URL[] = [];
    const seen = new Set<string>();

    for (const u of source.startUrls) {
      try {
        queue.push(normalizeUrlForKey(new URL(u)));
      } catch {
        // ignore
      }
    }

    while (queue.length > 0 && seen.size < params.maxPagesPerSource) {
      const url = queue.shift()!;
      const normalizedUrl = normalizeUrlForKey(url);
      const key = normalizedUrl.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      pagesVisited++;

      if (!isAllowedUrlForSource(normalizedUrl, source)) continue;

      let res:
        | { ok: boolean; status: number; text: string; contentType: string }
        | undefined;
      try {
        res = await fetchText(normalizedUrl);
      } catch {
        continue;
      }

      if (!res.ok) continue;
      if (!isHtmlContentType(res.contentType)) continue;

      const title = extractTitle(res.text);

      await prisma.page.upsert({
        where: { site_id_url: { site_id: site.id, url: key } },
        create: {
          site_id: site.id,
          url: key,
          title,
          source: "page" as ContentSource,
          fetched_at: null,
          canonical_url: key,
          http_status: res.status,
          excluded_reason: null,
          last_seen_at: new Date(),
          refresh_interval_hours: classifyRefreshIntervalHours(normalizedUrl),
        },
        update: {
          title,
          http_status: res.status,
          excluded_reason: null,
          last_seen_at: new Date(),
          refresh_interval_hours: classifyRefreshIntervalHours(normalizedUrl),
        },
      });

      pagesUpserted++;

      const links = extractLinks(normalizedUrl, res.text);
      for (const l of links) {
        if (l.hostname !== source.domain) continue;
        if (!isAllowedUrlForSource(l, source)) continue;
        queue.push(l);
      }
    }
  }

  return { sourcesTotal: sources.length, pagesVisited, pagesUpserted };
}

export async function ingestWebKb(params: {
  maxPages: number;
}): Promise<{
  pagesConsidered: number;
  pagesFetched: number;
  pagesUnchanged: number;
  pagesUpdated: number;
  sectionsWritten: number;
}> {
  const now = new Date();

  const pages = await prisma.page.findMany({
    where: {
      site: { type: "external" },
      excluded_reason: null,
      OR: [{ fetched_at: null }, { fetched_at: { not: null } }],
    },
    take: params.maxPages,
    orderBy: [{ fetched_at: "asc" }],
    select: {
      id: true,
      url: true,
      fetched_at: true,
      content_hash: true,
      refresh_interval_hours: true,
    },
  });

  let pagesFetched = 0;
  let pagesUnchanged = 0;
  let pagesUpdated = 0;
  let sectionsWritten = 0;

  for (const p of pages) {
    let url: URL;
    try {
      url = new URL(p.url);
    } catch {
      continue;
    }

    const interval =
      typeof p.refresh_interval_hours === "number"
        ? p.refresh_interval_hours
        : 24 * 20;
    if (p.fetched_at) {
      const dueAt = addHours(p.fetched_at, interval);
      if (dueAt > now) continue;
    }

    let res:
      | { ok: boolean; status: number; text: string; contentType: string }
      | undefined;
    try {
      res = await fetchText(url);
    } catch {
      continue;
    }

    if (!res.ok) {
      if (res.status === 404 || res.status === 410) {
        await prisma.page.update({
          where: { id: p.id },
          data: {
            excluded_reason: `http_${res.status}`,
            http_status: res.status,
          },
        });
      }
      continue;
    }

    if (!isHtmlContentType(res.contentType)) continue;

    pagesFetched++;

    const title = extractTitle(res.text);
    const textForHash = htmlToTextForHash(res.text, title);
    const nextHash = sha256(textForHash);

    if (p.content_hash && p.content_hash === nextHash) {
      pagesUnchanged++;
      await prisma.page.update({
        where: { id: p.id },
        data: {
          title,
          fetched_at: now,
          http_status: res.status,
          last_seen_at: now,
        },
      });
      continue;
    }

    await prisma.section.deleteMany({ where: { page_id: p.id } });

    const chunks = chunkMarkdownByHeadings(textForHash, {
      maxChars: 2400,
      minChars: 200,
    });

    const embeddingModel = selectBotCatEmbeddingModel();

    for (let i = 0; i < chunks.length; i++) {
      const content = chunks[i]!.contentMd.trim();
      if (!content) continue;

      const contentHash = sha256(content);

      const emb = await openai.embeddings.create({
        model: embeddingModel,
        input: content,
      });
      const vector = emb.data?.[0]?.embedding;
      if (!Array.isArray(vector))
        throw new Error("Embedding response missing embedding[]");

      const created = await prisma.section.create({
        data: {
          page_id: p.id,
          content,
          content_hash: contentHash,
          source: "page" as ContentSource,
          embedding_model: embeddingModel,
          // legacy JSON column (still present)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          vector: vector as any,
          dims: vector.length,
        },
        select: { id: true },
      });

      // Write pgvector column
      await updateSectionVector({
        prisma,
        sectionId: created.id,
        embedding: vector,
        embeddingModel,
      });

      sectionsWritten++;
    }

    pagesUpdated++;

    await prisma.page.update({
      where: { id: p.id },
      data: {
        title,
        fetched_at: now,
        http_status: res.status,
        last_seen_at: now,
        content_hash: nextHash,
      },
    });
  }

  return {
    pagesConsidered: pages.length,
    pagesFetched,
    pagesUnchanged,
    pagesUpdated,
    sectionsWritten,
  };
}
