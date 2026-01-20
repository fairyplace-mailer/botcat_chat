import { prisma } from "@/lib/prisma";
import { embeddingToSqlVectorLiteral } from "@/server/rag/pgvector";

export type RetrievedChunk = {
  chunkId: string;
  docId: string;
  sourcePath: string;
  title: string | null;
  chunkIndex: number;
  score: number;
  contentMd: string;
};

export type RetrievedWebSection = {
  sectionId: string;
  pageId: string;
  url: string;
  title: string | null;
  score: number;
  content: string;
};

export async function retrieveRelevantReferenceChunks(opts: {
  queryEmbedding: number[];
  topK: number;
}): Promise<RetrievedChunk[]> {
  const { queryEmbedding, topK } = opts;
  if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) return [];

  const k = Math.max(0, Math.min(topK, 10));
  if (k === 0) return [];

  const qv = embeddingToSqlVectorLiteral(queryEmbedding);

  // score: convert distance to similarity-ish number in [0..1] range-ish
  // using (1 / (1 + distance))
  const rows = (await prisma.$queryRawUnsafe(
    `
    SELECT
      c.id as "chunkId",
      c.doc_id as "docId",
      d.source_path as "sourcePath",
      d.title as "title",
      c.chunk_index as "chunkIndex",
      c.content_md as "contentMd",
      (1.0 / (1.0 + (c.embedding <-> ${qv}))) as "score"
    FROM "ReferenceChunk" c
    JOIN "ReferenceDoc" d ON d.id = c.doc_id
    WHERE c.embedding IS NOT NULL
    ORDER BY c.embedding <-> ${qv}
    LIMIT $1
  `,
    k
  )) as any[];

  return rows.map((r) => ({
    chunkId: String(r.chunkId),
    docId: String(r.docId),
    sourcePath: String(r.sourcePath),
    title: r.title ? String(r.title) : null,
    chunkIndex: Number(r.chunkIndex),
    score: Number(r.score),
    contentMd: String(r.contentMd),
  }));
}

export async function retrieveRelevantWebSections(opts: {
  queryEmbedding: number[];
  topK: number;
  domains?: string[];
}): Promise<RetrievedWebSection[]> {
  const { queryEmbedding, topK } = opts;
  if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) return [];

  const k = Math.max(0, Math.min(topK, 10));
  if (k === 0) return [];

  const qv = embeddingToSqlVectorLiteral(queryEmbedding);

  const domainFilter =
    Array.isArray(opts.domains) && opts.domains.length > 0
      ? `AND s.domain = ANY($2)`
      : "";

  const params: any[] = [k];
  if (domainFilter) params.push(opts.domains);

  const rows = (await prisma.$queryRawUnsafe(
    `
    SELECT
      sec.id as "sectionId",
      sec.page_id as "pageId",
      p.url as "url",
      p.title as "title",
      sec.content as "content",
      (1.0 / (1.0 + (sec.embedding <-> ${qv}))) as "score"
    FROM "Section" sec
    JOIN "Page" p ON p.id = sec.page_id
    JOIN "Site" s ON s.id = p.site_id
    WHERE sec.embedding IS NOT NULL
      AND s.type = 'external'
      ${domainFilter}
    ORDER BY sec.embedding <-> ${qv}
    LIMIT $1
  `,
    ...params
  )) as any[];

  return rows.map((r) => ({
    sectionId: String(r.sectionId),
    pageId: String(r.pageId),
    url: String(r.url),
    title: r.title ? String(r.title) : null,
    score: Number(r.score),
    content: String(r.content),
  }));
}

export function formatReferenceContextBlock(chunks: RetrievedChunk[]): string {
  if (!chunks || chunks.length === 0) return "";

  const body = chunks
    .map((c) => {
      const header = `---\nSOURCE: ${c.sourcePath}${c.title ? `\nTITLE: ${c.title}` : ""}\nSCORE: ${c.score.toFixed(
        4
      )}\nCHUNK: ${c.chunkIndex}`;
      return `${header}\n${c.contentMd}`;
    })
    .join("\n\n");

  return `[REFERENCE CONTEXT]\n${body}\n[/REFERENCE CONTEXT]`;
}

export function formatWebContextBlock(sections: RetrievedWebSection[]): string {
  if (!sections || sections.length === 0) return "";

  const body = sections
    .map((s) => {
      const header = `---\nURL: ${s.url}${s.title ? `\nTITLE: ${s.title}` : ""}\nSCORE: ${s.score.toFixed(4)}`;
      return `${header}\n${s.content}`;
    })
    .join("\n\n");

  return `[WEB KB CONTEXT]\n${body}\n[/WEB KB CONTEXT]`;
}
