-- Add HNSW (L2) indexes for embedding vectors per docs/rag_spec.md
-- Safe to run multiple times.

CREATE INDEX IF NOT EXISTS "ReferenceChunk_embedding_hnsw_l2_idx"
  ON "ReferenceChunk" USING hnsw ("embedding" vector_l2_ops);

CREATE INDEX IF NOT EXISTS "Section_embedding_hnsw_l2_idx"
  ON "Section" USING hnsw ("embedding" vector_l2_ops);
