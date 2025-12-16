import sharp from "sharp";

export type GeneratedPreview = {
  buffer: Buffer;
  contentType: "image/webp";
  bytes: number;
  width: number;
};

const MAX_BYTES = 80 * 1024;
const TARGET_WIDTH = 600;

async function fetchAsBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download original image (${res.status}) from: ${url}`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

export async function generateWebpPreviewFromBlobUrl(params: {
  blobUrlOriginal: string;
}): Promise<GeneratedPreview> {
  const original = await fetchAsBuffer(params.blobUrlOriginal);

  // First pass: resize once, then re-encode with varying quality.
  const resized = await sharp(original)
    .rotate() // respect EXIF orientation
    .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
    .toBuffer();

  // Iteratively reduce quality until <= 80KB (down to a safe minimum).
  const qualities = [82, 76, 70, 64, 58, 52, 46, 40];

  for (const q of qualities) {
    const out = await sharp(resized)
      .webp({ quality: q, effort: 4 })
      .toBuffer();

    if (out.byteLength <= MAX_BYTES) {
      return {
        buffer: out,
        contentType: "image/webp",
        bytes: out.byteLength,
        width: TARGET_WIDTH,
      };
    }
  }

  // If we couldn't get under MAX_BYTES with quality changes, as a fallback,
  // downscale a bit more once and try again.
  const resizedSmaller = await sharp(original)
    .rotate()
    .resize({ width: 480, withoutEnlargement: true })
    .toBuffer();

  const out = await sharp(resizedSmaller).webp({ quality: 40, effort: 4 }).toBuffer();

  return {
    buffer: out,
    contentType: "image/webp",
    bytes: out.byteLength,
    width: 480,
  };
}
