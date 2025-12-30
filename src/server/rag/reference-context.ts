import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export type ReferenceContextDoc = {
  sourcePath: string; // e.g. docs/reference_context/FairyPlace_Overview.md
  title: string | null;
  contentMd: string;
  sha256: string;
};

function extractTitle(md: string): string | null {
  const m = md.match(/^#\s+(.+)$/m);
  return m?.[1]?.trim() || null;
}

export async function loadReferenceContextDocs(params?: {
  rootDir?: string;
}): Promise<ReferenceContextDoc[]> {
  const rootDir = params?.rootDir ?? process.cwd();
  const dir = path.join(rootDir, "docs", "reference_context");

  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const mdFiles = entries
    .filter((f) => f.toLowerCase().endsWith(".md"))
    .sort((a, b) => a.localeCompare(b));

  const docs: ReferenceContextDoc[] = [];
  for (const fileName of mdFiles) {
    const abs = path.join(dir, fileName);
    const contentMd = await fs.readFile(abs, "utf8");
    const sha256 = crypto.createHash("sha256").update(contentMd).digest("hex");

    docs.push({
      sourcePath: path.posix.join("docs", "reference_context", fileName),
      title: extractTitle(contentMd),
      contentMd,
      sha256,
    });
  }

  return docs;
}
