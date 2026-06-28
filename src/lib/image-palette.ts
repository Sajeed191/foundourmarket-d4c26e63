// Product-image background matching.
//
// Detects the dominant background color of a product image by sampling its
// outer edges/corners on a downscaled offscreen canvas, then exposes that exact
// solid color so the image container can blend seamlessly with the photo's own
// background (white → white, black → black, cream → cream, etc.).
// Results are cached per-src so we never recompute for the same image, and a
// module-level in-flight map dedupes concurrent extractions.

export type ImagePalette = {
  /** Detected background color of the image (its outer-edge color). */
  primary: string;
  /** Same as primary — kept for backward compatibility. */
  secondary: string;
  /** Solid CSS background for the image container (exactly the edge color). */
  background: string;
  /** Unused now (kept for API compatibility) — always transparent. */
  glow: string;
  /** True when the detected background is very light. */
  isLightProduct: boolean;
};

/** Neutral fallback used when extraction is impossible (SSR / CORS / failure). */
export const FALLBACK_PALETTE: ImagePalette = {
  primary: "#ffffff",
  secondary: "#ffffff",
  background: "#ffffff",
  glow: "transparent",
  isLightProduct: true,
};

const cache = new Map<string, ImagePalette>();
const inflight = new Map<string, Promise<ImagePalette>>();

type RGB = { r: number; g: number; b: number };

function luminance({ r, g, b }: RGB): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function rgbToCss({ r, g, b }: RGB): string {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/** Build the palette from a detected edge/background color. */
function buildPalette(bg: RGB): ImagePalette {
  const css = rgbToCss(bg);
  return {
    primary: css,
    secondary: css,
    background: css,
    glow: "transparent",
    isLightProduct: luminance(bg) > 0.72,
  };
}

/**
 * Detect the dominant background color by sampling the outer ring (edges +
 * corners) of the image. Backgrounds are usually uniform, so we quantize the
 * edge pixels into coarse color buckets and pick the most common one, then
 * average that bucket for a precise color.
 */
function extractEdgeColor(data: Uint8ClampedArray, size: number): RGB {
  const buckets = new Map<string, { sum: RGB; count: number }>();
  const edgeBand = Math.max(1, Math.round(size * 0.12)); // outer ~12% ring

  const consider = (x: number, y: number) => {
    const i = (y * size + x) * 4;
    const a = data[i + 3];
    if (a < 125) return; // transparent → treat as no background sample
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // Quantize to ~16-level buckets to group near-identical edge pixels.
    const key = `${r >> 4}_${g >> 4}_${b >> 4}`;
    const prev = buckets.get(key);
    if (prev) {
      prev.sum.r += r; prev.sum.g += g; prev.sum.b += b; prev.count += 1;
    } else {
      buckets.set(key, { sum: { r, g, b }, count: 1 });
    }
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const onEdge =
        x < edgeBand || x >= size - edgeBand ||
        y < edgeBand || y >= size - edgeBand;
      if (onEdge) consider(x, y);
    }
  }

  let best: { sum: RGB; count: number } | null = null;
  for (const v of buckets.values()) {
    if (!best || v.count > best.count) best = v;
  }
  if (!best) return { r: 255, g: 255, b: 255 };
  return {
    r: best.sum.r / best.count,
    g: best.sum.g / best.count,
    b: best.sum.b / best.count,
  };
}

/**
 * Extract (and cache) the background-matching palette for a product image src.
 * Returns the fallback palette if running on the server, the image can't be
 * read (CORS), or extraction otherwise fails. Never throws.
 */
export function getImagePalette(src: string): Promise<ImagePalette> {
  if (cache.has(src)) return Promise.resolve(cache.get(src)!);
  if (inflight.has(src)) return inflight.get(src)!;
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve(FALLBACK_PALETTE);
  }

  const promise = new Promise<ImagePalette>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";

    const finish = (palette: ImagePalette) => {
      cache.set(src, palette);
      inflight.delete(src);
      resolve(palette);
    };

    img.onload = () => {
      try {
        const size = 32;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return finish(FALLBACK_PALETTE);
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        finish(buildPalette(extractEdgeColor(data, size)));
      } catch {
        finish(FALLBACK_PALETTE);
      }
    };
    img.onerror = () => finish(FALLBACK_PALETTE);
    img.src = src;
  });

  inflight.set(src, promise);
  return promise;
}

/** Synchronous cache peek for SSR-safe first paint. */
export function getCachedPalette(src: string): ImagePalette | null {
  return cache.get(src) ?? null;
}
