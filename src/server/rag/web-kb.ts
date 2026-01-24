import { prisma } from "@/lib/prisma";
import type { ContentSource } from "@prisma/client";
import crypto from "node:crypto";
import { openai, selectBotCatEmbeddingModel } from "@/lib/openai";
import {
  isAllowedUrlForSource,
  type WebSource,
  WEB_SOURCES,
} from "@/server/rag/web-sources";
import { updateSectionVector } from "@/server/rag/pgvector";
import type { Prisma } from "@prisma/client";

const USER_AGENT = "BotCat/1.0 (+https://www.fairyplace.biz)";
const FETCH_TIMEOUT_MS = 20_000;

// Spec defaults (Vercel Hobby)
const DEFAULT_MAX_DURATION_MS = 6500;
const DEFAULT_SEED_MAX_PAGES = 500;
const DEFAULT_INGEST_LIMIT_PAGES = 1;
const MAX_CHUNKS_PER_PAGE = 8;

// Tokenization is intentionally not used (too slow for Vercel Hobby).
// We implement "pseudo-tokens" based on chars to keep spec-level knobs stable.
const CHARS_PER_PSEUDO_TOKEN = 4;

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

function htmlToMarkdownishForHash(html: string, title: string | null): string {
  // NOTE: Spec says "use existing HTML->Markdown converter".
  // Project currently uses a fast HTML->text approach. We keep it deterministic
  // and stable for hashing, and treat it as markdown-ish content.
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

  return 24;
}

function chunkTextByPseudoTokens(
  text: string,
  params: {
    chunkTokens: number;
    overlapTokens: number;
    maxChunks: number;
  }
): string[] {
  const t = text.trim();
  if (!t) return [];

  const chunkChars = Math.max(200, params.chunkTokens * CHARS_PER_PSEUDO_TOKEN);
  const overlapChars = Math.max(0, params.overlapTokens * CHARS_PER_PSEUDO_TOKEN);
  const step = Math.max(1, chunkChars - overlapChars);

  const out: string[] = [];
  for (
    let start = 0;
    start < t.length && out.length < params.maxChunks;
    start += step
  ) {
    const end = Math.min(t.length, start + chunkChars);
    const slice = t.slice(start, end).trim();
    if (slice) out.push(slice);
    if (end >= t.length) break;
  }

  return out;
}

export async function seedWebSources(params: {
  sources?: WebSource[];
  maxPages?: number;
  maxDurationMs?: number;
}): Promise<{
  ok: true;
  startUrls: string[];
  maxPages: number;
  maxDurationMs: number;
  fetched: number;
  discoveredTotal: number;
  allowed: number;
  inserted: number;
  updated: number;
  sample: string[];
  stoppedReason: "time_budget_exhausted" | "max_pages" | "start_fetch_failed";
  startStatus: number | null;
}> {
  const maxPages =
    typeof params.maxPages === "number" && Number.isFinite(params.maxPages)
      ? params.maxPages
      : DEFAULT_SEED_MAX_PAGES;
  const deadline = makeDeadline(params.maxDurationMs ?? DEFAULT_MAX_DURATION_MS);

  const sources =
    params.sources ?? WEB_SOURCES.filter((s) => s.type === "external");

  const startUrls = sources.flatMap((s) => s.startUrls);

  let fetched = 0;
  let discoveredTotal = 0;
  let allowed = 0;
  let inserted = 0;
  let updated = 0;
  const sample: string[] = [];

  let stoppedReason:
    | "time_budget_exhausted"
    | "max_pages"
    | "start_fetch_failed" = "time_budget_exhausted";

  let startStatus: number | null = null;

  const startedAt = Date.now();

  for (const source of sources) {
    if (deadline.isExpired()) {
      stoppedReason = "time_budget_exhausted";
      break;
    }

    // keep per-source cap to prevent runaway within a single domain
    const perSourceCap = Math.min(source.maxPagesPerRun ?? maxPages, maxPages);

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

    // Optionally: probe the first startUrl to set startStatus
    if (startStatus === null && queue.length > 0) {
      try {
        const probe = await fetchText(queue[0]!);
        startStatus = probe.status;
        if (!probe.ok) {
          stoppedReason = "start_fetch_failed";
          break;
        }
      } catch {
        stoppedReason = "start_fetch_failed";
        break;
      }
    }

    while (
      queue.length > 0 &&
      seen.size < perSourceCap &&
      discoveredTotal < maxPages
    ) {
      if (deadline.isExpired()) {
        stoppedReason = "time_budget_exhausted";
        break;
      }

      const url = queue.shift()!;
      const normalizedUrl = normalizeUrlForKey(url);
      const key = normalizedUrl.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      discoveredTotal++;

      const isAllowed = isAllowedUrlForSource(source, normalizedUrl);
      if (!isAllowed) continue;
      allowed++;

      let res:
        | { ok: boolean; status: number; text: string; contentType: string }
        | undefined;
      try {
        res = await fetchText(normalizedUrl);
      } catch {
        continue;
      }

      fetched++;

      if (!res.ok) continue;
      if (!isHtmlContentType(res.contentType)) continue;

      const title = extractTitle(res.text);
      const refreshIntervalHours = classifyRefreshIntervalHours(normalizedUrl);

      // Upsert and count inserted/updated
      const existing = await prisma.page.findUnique({
        where: { site_id_url: { site_id: site.id, url: key } },
        select: { id: true },
      });

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
          // Spec: for new URLs set nextFetchAt=now.
          next_fetch_at: new Date(),
        },
        update: {
          title,
          http_status: res.status,
          excluded_reason: null,
          last_seen_at: new Date(),
          refresh_interval_hours: refreshIntervalHours,
          // Important: do NOT reset next_fetch_at on update.
          // This preserves the existing refresh schedule, which is critical
          // for Vercel Hobby time budgets.
        },
      });

      if (existing) updated++;
      else inserted++;

      if (sample.length < 5) sample.push(key);

      const links = extractLinks(normalizedUrl, res.text);
      for (const l of links) {
        if (l.hostname !== source.domain) continue;
        if (!isAllowedUrlForSource(source, l)) continue;
        queue.push(l);
      }
    }

    if (discoveredTotal >= maxPages) {
      stoppedReason = "max_pages";
      break;
    }
  }

  if (
    !deadline.isExpired() &&
    discoveredTotal < maxPages &&
    stoppedReason !== "start_fetch_failed"
  ) {
    // Spec doesn't define "done" for seed; keep within the allowed set.
    stoppedReason = "time_budget_exhausted";
  }

  const durationMs = Date.now() - startedAt;

  logRun({
    run: "seed",
    startedAt: new Date(deadline.startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs,
    maxDurationMs: deadline.maxDurationMs,
    maxPages,
    fetched,
    discoveredTotal,
    allowed,
    inserted,
    updated,
    stoppedReason,
    startStatus,
  });

  return {
    ok: true,
    startUrls,
    maxPages,
    maxDurationMs: deadline.maxDurationMs,
    fetched,
    discoveredTotal,
    allowed,
    inserted,
    updated,
    sample,
    stoppedReason,
    startStatus,
  };
}

export async function ingestWebKb(params: {
  limitPages?: number;
  maxDurationMs?: number;
}): Promise<{
  ok: true;
  limitPages: number;
  fetched: number;
  stored: number;
  skippedUnchanged: number;
  chunksUpserted: number;
  embedFailures: number;
  embeddingsAttempted: number;
  embeddingBatches: number;
  embeddingBatchSize: number;
  maxEmbeddings: number;
  maxChunksPerPage: number;
  chunkTokens: number;
  overlapTokens: number;
  budgetHit: boolean;
  stoppedReason:
    | "time_budget_exhausted"
    | "embed_budget_exhausted"
    | "maxChunksPerPage"
    | "done";
  msFetch: number;
  msTransform: number;
  msChunk: number;
  msEmbed: number;
  msDb: number;
}> {
  const limitPages =
    typeof params.limitPages === "number" && Number.isFinite(params.limitPages)
      ? params.limitPages
      : DEFAULT_INGEST_LIMIT_PAGES;
  const now = new Date();
  const deadline = makeDeadline(params.maxDurationMs ?? DEFAULT_MAX_DURATION_MS);

  // Claim due pages to avoid double-processing on rare concurrent runs.
  // NOTE: next_fetch_at exists in the Prisma schema, but if the local Prisma Client
  // wasn't regenerated after the migration, TS types won't include it. We keep the
  // query typed via `as any` to avoid blocking builds in that state.
  const claimed = await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      const due = await tx.page.findMany({
        where: {
          site: { type: "external" },
          excluded_reason: null,
          OR: [
            { next_fetch_at: null },
            { next_fetch_at: { lte: now } },
          ],
        } as any,
        take: limitPages,
        orderBy: [{ next_fetch_at: "asc" }] as any,
        select: {
          id: true,
          url: true,
          content_hash: true,
          refresh_interval_hours: true,
        },
      });

      const ids = due.map((p) => p.id);
      if (ids.length > 0) {
        await tx.page.updateMany({
          where: { id: { in: ids } },
          data: {
            next_fetch_at: addMinutes(now, 10),
          },
        });
      }

      return due;
    }
  );

  let fetched = 0;
  let stored = 0;
  let skippedUnchanged = 0;
  let chunksUpserted = 0;
  let embedFailures = 0;
  let embeddingsAttempted = 0;
  let embeddingBatches = 0;
  let embeddingBatchSize = 0;

  let msFetch = 0;
  let msTransform = 0;
  let msChunk = 0;
  let msEmbed = 0;
  let msDb = 0;

  // Spec defaults
  // NOTE: tokens are pseudo-tokens (chars/4) for Vercel Hobby performance.
  const chunkTokens = 1100;
  const overlapTokens = 150;
  const maxChunksPerPage = MAX_CHUNKS_PER_PAGE;
  const maxEmbeddings = MAX_CHUNKS_PER_PAGE;

  let stoppedReason:
    | "time_budget_exhausted"
    | "embed_budget_exhausted"
    | "maxChunksPerPage"
    | "done" = "done";
  let budgetHit = false;

  for (const p of claimed) {
    if (deadline.isExpired()) {
      stoppedReason = "time_budget_exhausted";
      budgetHit = true;
      break;
    }

    let url: URL;
    try {
      url = new URL(p.url);
    } catch {
      continue;
    }

    const interval =
      typeof p.refresh_interval_hours === "number" ? p.refresh_interval_hours : 24;

    const tFetch0 = Date.now();
    let res:
      | { ok: boolean; status: number; text: string; contentType: string }
      | undefined;

    try {
      res = await fetchText(url);
    } catch {
      msFetch += Date.now() - tFetch0;
      await prisma.page.update({
        where: { id: p.id },
        data: {
          next_fetch_at: addMinutes(now, 30),
        },
      });
      continue;
    }
    msFetch += Date.now() - tFetch0;

    fetched++;

    if (!res.ok) {
      const tDb0 = Date.now();
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
      msDb += Date.now() - tDb0;
      continue;
    }

    if (!isHtmlContentType(res.contentType)) {
      const tDb0 = Date.now();
      await prisma.page.update({
        where: { id: p.id },
        data: {
          excluded_reason: "non_html",
          http_status: res.status,
          next_fetch_at: addHours(now, interval),
        },
      });
      msDb += Date.now() - tDb0;
      continue;
    }

    const tTransform0 = Date.now();
    const title = extractTitle(res.text);
    const markdownish = htmlToMarkdownishForHash(res.text, title);
    const nextHash = sha256(normalizeWhitespace(markdownish));
    msTransform += Date.now() - tTransform0;

    if (p.content_hash && p.content_hash === nextHash) {
      skippedUnchanged++;
      const tDb0 = Date.now();
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
      msDb += Date.now() - tDb0;
      continue;
    }

    const tDbDelete0 = Date.now();
    await prisma.section.deleteMany({ where: { page_id: p.id } });
    msDb += Date.now() - tDbDelete0;

    const tChunk0 = Date.now();
    const chunks = chunkTextByPseudoTokens(markdownish, {
      chunkTokens,
      overlapTokens,
      maxChunks: maxChunksPerPage,
    });
    msChunk += Date.now() - tChunk0;

    if (chunks.length >= maxChunksPerPage) {
      stoppedReason = "maxChunksPerPage";
    }

    const embeddingModel = selectBotCatEmbeddingModel();

    const tEmbed0 = Date.now();
    let vectors: number[][];
    try {
      embeddingsAttempted += chunks.length;
      embeddingBatches += 1;
      embeddingBatchSize = chunks.length;

      const emb = await openai.embeddings.create({
        model: embeddingModel,
        input: chunks,
      });
      vectors = (emb.data ?? []).map((d) => d.embedding) as number[][];
    } catch {
      embedFailures += 1;
      msEmbed += Date.now() - tEmbed0;
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
    msEmbed += Date.now() - tEmbed0;

    if (
      vectors.length !== chunks.length ||
      vectors.some((v) => !Array.isArray(v))
    ) {
      embedFailures += 1;
      const tDb0 = Date.now();
      await prisma.page.update({
        where: { id: p.id },
        data: {
          title,
          http_status: res.status,
          last_seen_at: now,
          next_fetch_at: addMinutes(now, 30),
        },
      });
      msDb += Date.now() - tDb0;
      continue;
    }

    // Write sections
    for (let i = 0; i < chunks.length; i++) {
      if (deadline.isExpired()) {
        stoppedReason = "time_budget_exhausted";
        budgetHit = true;
        break;
      }

      const content = chunks[i]!;
      const vector = vectors[i]!;
      const contentHash = sha256(content);

      const tDb0 = Date.now();
      const created = await prisma.section.create({
        data: {
          page_id: p.id,
          content,
          content_hash: contentHash,
          source: "page" as ContentSource,
          embedding_model: embeddingModel,
          vector: vector as any,
          dims: vector.length,
        },
        select: { id: true },
      });

      await updateSectionVector({
        prisma,
        sectionId: created.id,
        embedding: vector,
        embeddingModel,
      });
      msDb += Date.now() - tDb0;

      chunksUpserted++;
    }

    const tDb0 = Date.now();
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
    msDb += Date.now() - tDb0;

    stored += 1;
  }

  if (deadline.isExpired()) {
    stoppedReason = "time_budget_exhausted";
    budgetHit = true;
  }

  logRun({
    run: "ingest",
    startedAt: new Date(deadline.startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - deadline.startedAt,
    maxDurationMs: deadline.maxDurationMs,
    limitPages,
    fetched,
    stored,
    skippedUnchanged,
    chunksUpserted,
    embedFailures,
    embeddingsAttempted,
    embeddingBatches,
    embeddingBatchSize,
    maxEmbeddings,
    maxChunksPerPage,
    chunkTokens,
    overlapTokens,
    budgetHit,
    stoppedReason,
    msFetch,
    msTransform,
    msChunk,
    msEmbed,
    msDb,
  });

  return {
    ok: true,
    limitPages,
    fetched,
    stored,
    skippedUnchanged,
    chunksUpserted,
    embedFailures,
    embeddingsAttempted,
    embeddingBatches,
    embeddingBatchSize,
    maxEmbeddings,
    maxChunksPerPage,
    chunkTokens,
    overlapTokens,
    budgetHit,
    stoppedReason,
    msFetch,
    msTransform,
    msChunk,
    msEmbed,
    msDb,
  };
}
