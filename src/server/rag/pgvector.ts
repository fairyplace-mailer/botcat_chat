import type { PrismaClient } from "@prisma/client";

// RAG spec: text-embedding-3-small → 1536 dims
export const EMBEDDING_DIMS = 1536;

function safeNumberString(n: number): string {
  if (!Number.isFinite(n)) throw new Error("embedding contains non-finite number");
  // Ensure dot decimal and avoid scientific notation where possible.
  // Postgres accepts scientific notation too, but keep it predictable.
  const s = String(n);
  if (s.includes("Infinity") || s.includes("NaN")) {
    throw new Error("embedding contains invalid number");
  }
  return s;
}

export function embeddingToSqlVectorLiteral(embedding: number[]): string {
  // pgvector accepts: '[1,2,3]'::vector
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error("embeddingToSqlVectorLiteral: embedding[] required");
  }

  const body = embedding.map(safeNumberString).join(",");

  // IMPORTANT: this must be a *string literal* casted to vector.
  // Do NOT use vector[...] syntax (that's arrays), pgvector expects '[...]'::vector.
  return `'[${body}]'::vector`;
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
