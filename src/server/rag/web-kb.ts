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
import type { Prisma } from "@prisma/client";

const USER_AGENT = "BotCat/1.0 (+https://www.fairyplace.biz)";
const FETCH_TIMEOUT_MS = 20_000;

type RunLog = {
  run: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  maxDurationMs: number;
} & Record<string, unknown>;

function makeDeadline(maxDurationMs: number) {
  const startedAt = Date.now();
  const deadlineAt = startedAt + maxDurationMs;
  const isExpired = () => Date.now() >= deadlineAt;
  const remainingMs = () => Math.max(0, deadlineAt - Date.now());
  return { startedAt, deadlineAt, maxDurationMs, isExpired, remainingMs };
}

function logRun(entry: RunLog) {
  // One-line JSON for easy viewing in Vercel logs.
  console.log(`[web-kb] ${JSON.stringify(entry)}`);
}

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function addHours(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

function addMinutes(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60 * 1000);
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
  maxDurationMs?: number;
}): Promise<{
  sourcesTotal: number;
  sourcesCompleted: number;
  pagesVisited: number;
  pagesUpserted: number;
  pagesFetchFailed: number;
  stoppedByTimeout: boolean;
}> {
  const deadline = makeDeadline(params.maxDurationMs ?? 70_000);

  const sources = params.sources ?? WEB_SOURCES.filter((s) => s.type === "external");

  let sourcesCompleted = 0;
  let pagesVisited = 0;
  let pagesUpserted = 0;
  let pagesFetchFailed = 0;
  let stoppedByTimeout = false;

  for (const source of sources) {
    if (deadline.isExpired()) {
      stoppedByTimeout = true;
      break;
    }

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
      if (deadline.isExpired()) {
        stoppedByTimeout = true;
        break;
      }

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
        pagesFetchFailed++;
        continue;
      }

      if (!res.ok) continue;
      if (!isHtmlContentType(res.contentType)) continue;

      const title = extractTitle(res.text);
      const refreshIntervalHours = classifyRefreshIntervalHours(normalizedUrl);

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
          refresh_interval_hours: refreshIntervalHours,
          // make due immediately; ingest will schedule to now + interval after first fetch
          next_fetch_at: new Date(),
        },
        update: {
          title,
          http_status: res.status,
          excluded_reason: null,
          last_seen_at: new Date(),
          refresh_interval_hours: refreshIntervalHours,
          // re-check soon; seed is a discovery mechanism
          next_fetch_at: new Date(),
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

    sourcesCompleted++;
  }

  logRun({
    run: "seed",
    startedAt: new Date(deadline.startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - deadline.startedAt,
    maxDurationMs: deadline.maxDurationMs,
    sourcesTotal: sources.length,
    sourcesCompleted,
    pagesVisited,
    pagesUpserted,
    pagesFetchFailed,
    stoppedByTimeout,
  });

  return {
    sourcesTotal: sources.length,
    sourcesCompleted,
    pagesVisited,
    pagesUpserted,
    pagesFetchFailed,
    stoppedByTimeout,
  };
}

export async function ingestWebKb(params: {
  maxPages: number;
  maxDurationMs?: number;
}): Promise<{
  pagesConsidered: number;
  pagesFetched: number;
  pagesUnchanged: number;
  pagesUpdated: number;
  pagesFailed: number;
  sectionsWritten: number;
  stoppedByTimeout: boolean;
}> {
  const now = new Date();
  const deadline = makeDeadline(params.maxDurationMs ?? 70_000);

  // Claim due pages to avoid double-processing on rare concurrent runs.
  const claimed = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const due = await tx.page.findMany({
      where: {
        site: { type: "external" },
        excluded_reason: null,
        OR: [{ next_fetch_at: null }, { next_fetch_at: { lte: now } }],
      },
      take: params.maxPages,
      orderBy: [{ next_fetch_at: "asc" }],
      select: {
        id: true,
        url: true,
        fetched_at: true,
        content_hash: true,
        refresh_interval_hours: true,
        next_fetch_at: true,
      },
    });

    const ids = due.map((p) => p.id);
    if (ids.length > 0) {
      await tx.page.updateMany({
        where: { id: { in: ids } },
        data: {
          // Mark "in progress" for a short window.
          next_fetch_at: addMinutes(now, 10),
        },
      });
    }

    return due;
  });

  let pagesFetched = 0;
  let pagesUnchanged = 0;
  let pagesUpdated = 0;
  let pagesFailed = 0;
  let sectionsWritten = 0;
  let stoppedByTimeout = false;

  for (const p of claimed) {
    if (deadline.isExpired()) {
      stoppedByTimeout = true;
      break;
    }

    let url: URL;
    try {
      url = new URL(p.url);
    } catch {
      pagesFailed++;
      continue;
    }

    const interval =
      typeof p.refresh_interval_hours === "number"
        ? p.refresh_interval_hours
        : 24 * 20;

    let res:
      | { ok: boolean; status: number; text: string; contentType: string }
      | undefined;

    try {
      res = await fetchText(url);
    } catch {
      pagesFailed++;
      await prisma.page.update({
        where: { id: p.id },
        data: {
          // Backoff a bit on transient fetch errors
          next_fetch_at: addMinutes(now, 30),
        },
      });
      continue;
    }

    if (!res.ok) {
      pagesFailed++;
      if (res.status === 404 || res.status === 410) {
        await prisma.page.update({
          where: { id: p.id },
          data: {
            excluded_reason: `http_${res.status}`,
            http_status: res.status,
            next_fetch_at: addHours(now, interval),
          },
        });
      } else {
        await prisma.page.update({
          where: { id: p.id },
          data: {
            http_status: res.status,
            next_fetch_at: addMinutes(now, 60),
          },
        });
      }
      continue;
    }

    if (!isHtmlContentType(res.contentType)) {
      pagesFailed++;
      await prisma.page.update({
        where: { id: p.id },
        data: {
          excluded_reason: "non_html",
          http_status: res.status,
          next_fetch_at: addHours(now, interval),
        },
      });
      continue;
    }

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
          next_fetch_at: addHours(now, interval),
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

    let pageFailed = false;

    for (let i = 0; i < chunks.length; i++) {
      if (deadline.isExpired()) {
        stoppedByTimeout = true;
        pageFailed = true;
        break;
      }

      const content = chunks[i]!.contentMd.trim();
      if (!content) continue;

      const contentHash = sha256(content);

      let vector: number[] | undefined;
      try {
        const emb = await openai.embeddings.create({
          model: embeddingModel,
          input: content,
        });
        vector = emb.data?.[0]?.embedding;
      } catch {
        pageFailed = true;
        break;
      }

      if (!Array.isArray(vector)) {
        pageFailed = true;
        break;
      }

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

    if (pageFailed) {
      pagesFailed++;
      // Backoff on embedding failures or timeout; keep page scheduled for retry.
      await prisma.page.update({
        where: { id: p.id },
        data: {
          title,
          http_status: res.status,
          last_seen_at: now,
          next_fetch_at: addMinutes(now, 30),
        },
      });
      continue;
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
        next_fetch_at: addHours(now, interval),
      },
    });
  }

  logRun({
    run: "ingest",
    startedAt: new Date(deadline.startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - deadline.startedAt,
    maxDurationMs: deadline.maxDurationMs,
    pagesConsidered: claimed.length,
    pagesFetched,
    pagesUnchanged,
    pagesUpdated,
    pagesFailed,
    sectionsWritten,
    stoppedByTimeout,
  });

  return {
    pagesConsidered: claimed.length,
    pagesFetched,
    pagesUnchanged,
    pagesUpdated,
    pagesFailed,
    sectionsWritten,
    stoppedByTimeout,
  };
}
