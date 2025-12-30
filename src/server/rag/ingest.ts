import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { openai } from "@/lib/openai";
import { loadReferenceContextDocs } from "./reference-context";
import { chunkMarkdownByHeadings } from "./chunking";

export async function ingestReferenceContext(params?: {
  rootDir?: string;
  maxDocs?: number;
}): Promise<{
  docsTotal: number;
  docsUpdated: number;
  docsSkipped: number;
  chunksWritten: number;
}> {
  const docs = await loadReferenceContextDocs({ rootDir: params?.rootDir });
  const limited = typeof params?.maxDocs === "number" ? docs.slice(0, params.maxDocs) : docs;

  let docsUpdated = 0;
  let docsSkipped = 0;
  let chunksWritten = 0;

  for (const doc of limited) {
    const existing = await prisma.referenceDoc.findUnique({
      where: { source_path: doc.sourcePath },
    });

    if (existing && existing.source_hash === doc.sha256) {
      docsSkipped++;
      continue;
    }

    const upserted = await prisma.referenceDoc.upsert({
      where: { source_path: doc.sourcePath },
      create: {
        source_path: doc.sourcePath,
        title: doc.title,
        source_hash: doc.sha256,
      },
      update: {
        title: doc.title,
        source_hash: doc.sha256,
      },
    });

    // Replace chunks
    await prisma.referenceChunk.deleteMany({ where: { doc_id: upserted.id } });

    const chunks = chunkMarkdownByHeadings(doc.contentMd);

    for (const c of chunks) {
      const emb = await openai.embeddings.create({
        model: env.OPENAI_MODEL_EMBEDDING,
        input: c.contentMd,
      });

      const vector = emb.data?.[0]?.embedding;
      if (!Array.isArray(vector)) {
        throw new Error("Embedding response missing embedding[]");
      }

      await prisma.referenceChunk.create({
        data: {
          doc_id: upserted.id,
          chunk_index: c.chunkIndex,
          content_md: c.contentMd,
          token_estimate: c.tokenEstimate,
          embedding_model: env.OPENAI_MODEL_EMBEDDING,
          vector,
          dims: vector.length,
        },
      });
      chunksWritten++;
    }

    docsUpdated++;
  }

  return {
    docsTotal: limited.length,
    docsUpdated,
    docsSkipped,
    chunksWritten,
  };
}
