import { prisma } from "@/lib/prisma";
import { cosineSimilarity } from "@/server/rag/cosine";

export type RetrievedChunk = {
  chunkId: string;
  docId: string;
  sourcePath: string;
  title: string | null;
  chunkIndex: number;
  score: number;
  contentMd: string;
};

export async function retrieveRelevantReferenceChunks(opts: {
  queryEmbedding: number[];
  topK: number;
}): Promise<RetrievedChunk[]> {
  const { queryEmbedding, topK } = opts;
  if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) return [];

  // Stage 1 (per spec): small KB, so we can scan all chunks in memory.
  // If/when KB grows, we should switch to pgvector.
  const chunks = await prisma.referenceChunk.findMany({
    select: {
      id: true,
      doc_id: true,
      chunk_index: true,
      content_md: true,
      vector: true,
      dims: true,
      doc: {
        select: {
          source_path: true,
          title: true,
        },
      },
    },
  });

  const scored: RetrievedChunk[] = [];

  for (const c of chunks) {
    if (c.dims !== queryEmbedding.length) continue;
    const vec = c.vector as unknown;
    if (!Array.isArray(vec)) continue;

    const score = cosineSimilarity(queryEmbedding, vec as number[]);
    scored.push({
      chunkId: c.id,
      docId: c.doc_id,
      sourcePath: c.doc.source_path,
      title: c.doc.title,
      chunkIndex: c.chunk_index,
      score,
      contentMd: c.content_md,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(0, Math.min(topK, 10)));
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
