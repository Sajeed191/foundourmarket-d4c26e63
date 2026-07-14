/**
 * In-browser perceptual image hashing for duplicate-image detection.
 *
 * No native deps, no server round-trip: the primary image is drawn to an
 * offscreen canvas, downscaled and greyscaled, then reduced to compact hashes.
 * Combining aHash (overall luminance) + dHash (gradients) gives resistance to
 * resize, recompression, mild brightness shifts and small edits/crops.
 *
 * Fingerprint format: "a<hex>:d<hex>" (16 hex chars each = 64 bits each).
 * Stored on products.image_phash and compared via Hamming distance.
 */

const A_SIZE = 8; // 8x8 = 64-bit average hash
const D_W = 9;
const D_H = 8; // 9x8 -> 8x8 = 64-bit difference hash

function toHex(bits: number[]): string {
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    const nibble = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3];
    hex += nibble.toString(16);
  }
  return hex;
}

function greyscale(data: Uint8ClampedArray): number[] {
  const out: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    out.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  return out;
}

function drawGrey(img: HTMLImageElement | ImageBitmap, w: number, h: number): number[] {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img as CanvasImageSource, 0, 0, w, h);
  return greyscale(ctx.getImageData(0, 0, w, h).data);
}

function averageHash(img: HTMLImageElement | ImageBitmap): string {
  const px = drawGrey(img, A_SIZE, A_SIZE);
  if (!px.length) return "";
  const mean = px.reduce((s, v) => s + v, 0) / px.length;
  return toHex(px.map((v) => (v >= mean ? 1 : 0)));
}

function differenceHash(img: HTMLImageElement | ImageBitmap): string {
  const px = drawGrey(img, D_W, D_H);
  if (!px.length) return "";
  const bits: number[] = [];
  for (let y = 0; y < D_H; y++) {
    for (let x = 0; x < D_W - 1; x++) {
      const i = y * D_W + x;
      bits.push(px[i] < px[i + 1] ? 1 : 0);
    }
  }
  return toHex(bits);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

/**
 * Compute the perceptual fingerprint for an image URL/data-URL.
 * Returns null on failure (e.g. CORS-tainted canvas) so callers degrade
 * gracefully to text-only detection.
 */
export async function computeImagePhash(src: string | null | undefined): Promise<string | null> {
  if (!src || typeof document === "undefined") return null;
  try {
    const img = await loadImage(src);
    const a = averageHash(img);
    const d = differenceHash(img);
    if (!a || !d) return null;
    return `a${a}:d${d}`;
  } catch {
    return null;
  }
}

function hexHamming(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return Number.POSITIVE_INFINITY;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

/** Parse "a<hex>:d<hex>" into its two components. */
function parsePhash(fp: string | null | undefined): { a: string; d: string } | null {
  if (!fp) return null;
  const m = /^a([0-9a-f]+):d([0-9a-f]+)$/i.exec(fp.trim());
  if (!m) return null;
  return { a: m[1].toLowerCase(), d: m[2].toLowerCase() };
}

/**
 * Image similarity in [0,1] from two fingerprints. Averages the aHash and
 * dHash agreement across 128 total bits. Returns null when either hash is
 * missing/unparseable (unknown, not "different").
 */
export function imageSimilarity(
  fpA: string | null | undefined,
  fpB: string | null | undefined,
): number | null {
  const pa = parsePhash(fpA);
  const pb = parsePhash(fpB);
  if (!pa || !pb) return null;
  const ah = hexHamming(pa.a, pb.a);
  const dh = hexHamming(pa.d, pb.d);
  if (!Number.isFinite(ah) || !Number.isFinite(dh)) return null;
  const totalBits = pa.a.length * 4 + pa.d.length * 4;
  const sim = 1 - (ah + dh) / totalBits;
  return Math.max(0, Math.min(1, sim));
}
