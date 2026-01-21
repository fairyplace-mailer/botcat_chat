import type { PrismaClient } from "@prisma/client";

export const EMBEDDING_DIMS = 3072;

export function embeddingToSqlVectorLiteral(embedding: number[]): string {
  // pgvector accepts: '[1,2,3]'::vector
  // We must ensure it's numbers only.
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error("embeddingToSqlVectorLiteral: embedding[] required");
  }
  return `'[${embedding.join(",")}']::vector`;
}

export async function updateReferenceChunkVector(params: {
  prisma: PrismaClient;
  chunkId: string;
  embedding: number[];
}): Promise<void> {
  const { prisma, chunkId, embedding } = params;
  const vectorSql = embeddingToSqlVectorLiteral(embedding);

  await prisma.$executeRawUnsafe(
    `UPDATE "ReferenceChunk" SET "embedding" = ${vectorSql}, "dims" = $1 WHERE "id" = $2`,
    embedding.length,
    chunkId
  );
}

export async function updateSectionVector(params: {
  prisma: PrismaClient;
  sectionId: string;
  embedding: number[];
  embeddingModel: string;
}): Promise<void> {
  const { prisma, sectionId, embedding, embeddingModel } = params;
  const vectorSql = embeddingToSqlVectorLiteral(embedding);

  await prisma.$executeRawUnsafe(
    `UPDATE "Section" SET "embedding" = ${vectorSql}, "embedding_model" = $1, "dims" = $2 WHERE "id" = $3`,
    embeddingModel,
    embedding.length,
    sectionId
  );
}
