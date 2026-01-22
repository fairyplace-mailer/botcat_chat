import { prisma } from "@/lib/prisma";
import { openai, selectBotCatEmbeddingModel } from "@/lib/openai";
import { loadReferenceContextDocs } from "./reference-context";
import { chunkMarkdownByHeadings } from "./chunking";
import { updateReferenceChunkVector } from "./pgvector";

const MAX_EMBEDDINGS_PER_DOC = 64;

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
  const limited =
    typeof params?.maxDocs === "number" ? docs.slice(0, params.maxDocs) : docs;

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

    const chunks = chunkMarkdownByHeadings(doc.contentMd)
      .map((c) => c.contentMd)
      .filter(Boolean)
      .slice(0, MAX_EMBEDDINGS_PER_DOC);

    const embeddingModel = selectBotCatEmbeddingModel();

    // Batch embeddings for performance
    const emb = await openai.embeddings.create({
      model: embeddingModel,
      input: chunks,
    });

    const vectors = (emb.data ?? []).map((d) => d.embedding) as number[][];
    if (vectors.length !== chunks.length || vectors.some((v) => !Array.isArray(v))) {
      throw new Error("Embedding response missing embedding[]");
    }

    for (let i = 0; i < chunks.length; i++) {
      const contentMd = chunks[i]!;
      const embedding = vectors[i]!;

      const created = await prisma.referenceChunk.create({
        data: {
          doc_id: upserted.id,
          chunk_index: i,
          content_md: contentMd,
          token_estimate: null,
          embedding_model: embeddingModel,
          // Legacy JSON (kept temporarily for backward compatibility)
          vector: embedding as any,
          dims: embedding.length,
        },
      });

      await updateReferenceChunkVector({
        prisma,
        chunkId: created.id,
        embedding,
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
