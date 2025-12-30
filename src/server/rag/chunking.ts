export type MarkdownChunk = {
  chunkIndex: number;
  contentMd: string;
  tokenEstimate: number;
};

// Token estimate proxy (good enough for stage-1): ~4 chars per token.
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Stage-1 chunking strategy:
// - Split by H1/H2 headings to keep semantic blocks
// - Cap by maxChars to avoid huge chunks
export function chunkMarkdownByHeadings(md: string, params?: {
  maxChars?: number;
  minChars?: number;
}): MarkdownChunk[] {
  const maxChars = params?.maxChars ?? 2400;
  const minChars = params?.minChars ?? 200;

  const lines = md.split(/\r?\n/);

  const blocks: string[] = [];
  let cur: string[] = [];

  const flush = () => {
    const text = cur.join("\n").trim();
    if (text) blocks.push(text);
    cur = [];
  };

  for (const line of lines) {
    const isHeading = /^#{1,2}\s+/.test(line);
    if (isHeading && cur.length > 0) flush();
    cur.push(line);
  }
  flush();

  // Now enforce max size
  const chunks: MarkdownChunk[] = [];
  let idx = 0;

  for (const block of blocks) {
    if (block.length <= maxChars) {
      chunks.push({ chunkIndex: idx++, contentMd: block, tokenEstimate: estimateTokens(block) });
      continue;
    }

    // Split oversized block by paragraphs
    const paras = block.split(/\n\s*\n/);
    let buf = "";
    for (const p of paras) {
      const next = (buf ? buf + "\n\n" : "") + p;
      if (next.length > maxChars) {
        const trimmed = buf.trim();
        if (trimmed.length >= minChars) {
          chunks.push({ chunkIndex: idx++, contentMd: trimmed, tokenEstimate: estimateTokens(trimmed) });
          buf = p;
        } else {
          // if too small, still flush to avoid infinite loop
          chunks.push({ chunkIndex: idx++, contentMd: next.trim(), tokenEstimate: estimateTokens(next.trim()) });
          buf = "";
        }
      } else {
        buf = next;
      }
    }
    const last = buf.trim();
    if (last) chunks.push({ chunkIndex: idx++, contentMd: last, tokenEstimate: estimateTokens(last) });
  }

  return chunks;
}
