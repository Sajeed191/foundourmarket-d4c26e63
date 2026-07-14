/**
 * Image Intelligence Engine v3 — server-only analysis pipeline.
 *
 * Runs inside `createServerFn` handlers on the Worker runtime.
 * - Header path (`depth='header-only'`): pure JS via `image-size`, no WASM cost.
 * - Full path (`depth='full'`): Photon-WASM pixel decode for real measurements
 *   (occupancy, margins, brightness, sharpness, centering, uniformity).
 *
 * SAFETY: this module NEVER writes back to the image; it only reads bytes
 * from the CDN URL and returns a metadata payload. Original bytes are
 * untouched. See the safety contract in `image-intelligence-types.ts`.
 */

import { imageSize } from "image-size";
import {
  INTELLIGENCE_VERSION,
  resolveCategoryFraming,
  scoreIntelligence,
  recommendOne,
  type ImageIntelligence,
  type ImageRecommendation,
  type BackgroundKind,
  type PixelDepth,
} from "@/lib/image-intelligence-types";

const MAX_BYTES = 12 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const ANALYSIS_LONG_EDGE = 512; // downsample cap for pixel work

export async function fetchImageBytes(url: string): Promise<Uint8Array> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Image fetch ${res.status}`);
    const cl = Number(res.headers.get("content-length") ?? "0");
    if (cl && cl > MAX_BYTES) throw new Error("Image exceeds 12MB safety cap.");
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) throw new Error("Image exceeds 12MB safety cap.");
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

export function detectFormat(bytes: Uint8Array): ImageIntelligence["format"] {
  if (bytes.length < 12) return "other";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45) return "webp";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "gif";
  const ftyp = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
  if (ftyp === "ftyp") {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand === "avif" || brand === "avis") return "avif";
  }
  return "other";
}

function detectAlpha(bytes: Uint8Array, format: ImageIntelligence["format"]): boolean {
  if (format === "png" && bytes.length > 25) {
    const colorType = bytes[25];
    return colorType === 4 || colorType === 6;
  }
  if (format === "webp" && bytes.length > 20) {
    const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (chunk === "VP8X") return (bytes[20] & 0x10) !== 0;
    if (chunk === "VP8L") return true;
  }
  if (format === "gif") return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────
// Pixel analysis (Photon-WASM). Runs on downsampled RGBA buffer.
// ─────────────────────────────────────────────────────────────────────────

export type PixelAnalysis = {
  occupancy: number;
  centeringOffset: number;
  emptyMargin: { top: number; right: number; bottom: number; left: number };
  brightness: number;
  contrast: number;
  sharpness: number;
  background: BackgroundKind;
  backgroundConfidence: number;
  bbox: { x: number; y: number; w: number; h: number }; // normalized 0..1
  bgColor: { r: number; g: number; b: number };
};

type Rgba = { w: number; h: number; data: Uint8Array };

async function decodePixels(bytes: Uint8Array): Promise<Rgba | null> {
  try {
    const photon = await import("@cf-wasm/photon");
    const img = photon.PhotonImage.new_from_byteslice(bytes);
    const srcW = img.get_width();
    const srcH = img.get_height();
    const longEdge = Math.max(srcW, srcH);
    let workImg = img;
    if (longEdge > ANALYSIS_LONG_EDGE) {
      const scale = ANALYSIS_LONG_EDGE / longEdge;
      const nw = Math.max(2, Math.round(srcW * scale));
      const nh = Math.max(2, Math.round(srcH * scale));
      workImg = photon.resize(img, nw, nh, photon.SamplingFilter.Nearest);
      img.free();
    }
    const w = workImg.get_width();
    const h = workImg.get_height();
    const data = workImg.get_raw_pixels();
    workImg.free();
    return { w, h, data };
  } catch {
    return null;
  }
}

/** Sample four corner swatches → estimate background color + uniformity. */
function sampleBackground(rgba: Rgba): { r: number; g: number; b: number; uniformity: number } {
  const { w, h, data } = rgba;
  const patch = Math.max(4, Math.floor(Math.min(w, h) * 0.05));
  const corners: Array<[number, number]> = [
    [0, 0],
    [w - patch, 0],
    [0, h - patch],
    [w - patch, h - patch],
  ];
  const samples: Array<[number, number, number]> = [];
  for (const [cx, cy] of corners) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = cy; y < cy + patch; y++) {
      for (let x = cx; x < cx + patch; x++) {
        const i = (y * w + x) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      }
    }
    samples.push([r / n, g / n, b / n]);
  }
  // Mean corner color = background estimate
  const mr = samples.reduce((s, x) => s + x[0], 0) / 4;
  const mg = samples.reduce((s, x) => s + x[1], 0) / 4;
  const mb = samples.reduce((s, x) => s + x[2], 0) / 4;
  // Uniformity: inverse of stdev of corners (normalized 0..1, 1 = uniform)
  let variance = 0;
  for (const [r, g, b] of samples) {
    variance += (r - mr) ** 2 + (g - mg) ** 2 + (b - mb) ** 2;
  }
  const stdev = Math.sqrt(variance / 4);
  const uniformity = Math.max(0, Math.min(1, 1 - stdev / 60));
  return { r: mr, g: mg, b: mb, uniformity };
}

/** Return bounding box of pixels significantly different from bg color. */
function findProductBBox(
  rgba: Rgba,
  bg: { r: number; g: number; b: number },
): { x: number; y: number; w: number; h: number; occupancy: number } {
  const { w, h, data } = rgba;
  const THRESH = 32; // channel distance threshold
  let minX = w, minY = h, maxX = 0, maxY = 0, count = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = data[i + 3];
      // Transparent → not product (bg reveal)
      if (a < 200) continue;
      const dr = data[i] - bg.r;
      const dg = data[i + 1] - bg.g;
      const db = data[i + 2] - bg.b;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist > THRESH) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        count++;
      }
    }
  }
  if (count < 10 || maxX <= minX || maxY <= minY) {
    return { x: 0, y: 0, w: 1, h: 1, occupancy: 0 };
  }
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  return {
    x: minX / w,
    y: minY / h,
    w: bw / w,
    h: bh / h,
    occupancy: (bw * bh) / (w * h),
  };
}

/** Mean luminance 0..1. */
function computeBrightness(rgba: Rgba): number {
  const { data } = rgba;
  let sum = 0;
  const step = 4 * 4; // sample every 4 pixels for speed
  let n = 0;
  for (let i = 0; i < data.length; i += step) {
    sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    n++;
  }
  return sum / n / 255;
}

/** Sharpness via Laplacian variance proxy on luminance. Normalized 0..1. */
function computeSharpness(rgba: Rgba): number {
  const { w, h, data } = rgba;
  const lum = new Float32Array(w * h);
  for (let i = 0, j = 0; j < w * h; i += 4, j++) {
    lum[j] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v =
        -lum[i - w - 1] - lum[i - w] - lum[i - w + 1]
        - lum[i - 1] + 8 * lum[i] - lum[i + 1]
        - lum[i + w - 1] - lum[i + w] - lum[i + w + 1];
      sum += v; sumSq += v * v; n++;
    }
  }
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  // Empirical: variance in the thousands → sharp. Normalize log-scale.
  return Math.max(0, Math.min(1, Math.log10(1 + variance) / 4));
}

function classifyBackground(uniformity: number, hasAlpha: boolean, bg: { r: number; g: number; b: number }): {
  kind: BackgroundKind; confidence: number;
} {
  if (hasAlpha) return { kind: "transparent", confidence: 0.95 };
  if (uniformity > 0.85) {
    const isWhite = bg.r > 240 && bg.g > 240 && bg.b > 240;
    return { kind: isWhite ? "white" : "solid", confidence: uniformity };
  }
  if (uniformity > 0.6) return { kind: "solid", confidence: uniformity };
  if (uniformity > 0.35) return { kind: "textured", confidence: uniformity };
  return { kind: "busy", confidence: 1 - uniformity };
}

export async function analyzePixels(bytes: Uint8Array): Promise<PixelAnalysis | null> {
  const rgba = await decodePixels(bytes);
  if (!rgba) return null;
  const { w, h } = rgba;
  const bg = sampleBackground(rgba);
  const bbox = findProductBBox(rgba, bg);
  const hasAlpha = (() => {
    for (let i = 3; i < rgba.data.length; i += 16) if (rgba.data[i] < 250) return true;
    return false;
  })();
  const bgClass = classifyBackground(bg.uniformity, hasAlpha, bg);
  const brightness = computeBrightness(rgba);
  const sharpness = computeSharpness(rgba);

  const cx = bbox.x + bbox.w / 2;
  const cy = bbox.y + bbox.h / 2;
  const centeringOffset = Math.min(1, Math.sqrt((cx - 0.5) ** 2 + (cy - 0.5) ** 2) * 2);

  // Empty margins from bbox
  const emptyMargin = {
    top: bbox.y,
    left: bbox.x,
    right: Math.max(0, 1 - (bbox.x + bbox.w)),
    bottom: Math.max(0, 1 - (bbox.y + bbox.h)),
  };

  // Contrast proxy: bbox mean vs bg
  let bboxLum = 0, n = 0;
  const bx0 = Math.floor(bbox.x * w), bx1 = Math.floor((bbox.x + bbox.w) * w);
  const by0 = Math.floor(bbox.y * h), by1 = Math.floor((bbox.y + bbox.h) * h);
  for (let y = by0; y < by1; y += 4) {
    for (let x = bx0; x < bx1; x += 4) {
      const i = (y * w + x) * 4;
      bboxLum += 0.2126 * rgba.data[i] + 0.7152 * rgba.data[i + 1] + 0.0722 * rgba.data[i + 2];
      n++;
    }
  }
  const bboxMeanLum = n > 0 ? bboxLum / n / 255 : brightness;
  const bgLum = (0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b) / 255;
  const contrast = Math.min(1, Math.abs(bboxMeanLum - bgLum) * 2);

  return {
    occupancy: bbox.occupancy,
    centeringOffset,
    emptyMargin,
    brightness,
    contrast,
    sharpness,
    background: bgClass.kind,
    backgroundConfidence: bgClass.confidence,
    bbox: { x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h },
    bgColor: { r: Math.round(bg.r), g: Math.round(bg.g), b: Math.round(bg.b) },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────

export type AnalyzeInput = {
  imageUrl: string;
  categorySlug?: string | null;
  depth?: PixelDepth; // 'full' triggers WASM pixel analysis
};

export type AnalyzeOutput = {
  status: "analyzed" | "failed";
  durationMs: number;
  intelligence: ImageIntelligence | null;
  recommendation: ImageRecommendation | null;
  pixels?: PixelAnalysis | null;
  bytes?: Uint8Array; // returned when depth=full for downstream normalize
  errorMessage?: string;
};

export async function analyzeImageServer({
  imageUrl,
  categorySlug,
  depth = "header-only",
}: AnalyzeInput): Promise<AnalyzeOutput> {
  const started = Date.now();
  try {
    const bytes = await fetchImageBytes(imageUrl);
    const format = detectFormat(bytes);
    const headerAlpha = detectAlpha(bytes, format);

    let width = 0, height = 0;
    try {
      const dims = imageSize(bytes);
      width = dims.width ?? 0;
      height = dims.height ?? 0;
    } catch { /* zeros → flagged below */ }

    if (!width || !height) {
      return {
        status: "failed",
        durationMs: Date.now() - started,
        intelligence: null, recommendation: null,
        errorMessage: "Could not read image dimensions.",
      };
    }

    const aspectRatio = width / height;
    const orientation: ImageIntelligence["orientation"] =
      Math.abs(aspectRatio - 1) < 0.05 ? "square" :
      aspectRatio > 1 ? "landscape" : "portrait";

    const framing = resolveCategoryFraming(categorySlug);
    let pixels: PixelAnalysis | null = null;
    let effectiveDepth: PixelDepth = "header-only";
    let background: BackgroundKind = headerAlpha ? "transparent" : "unknown";
    let backgroundConfidence = headerAlpha ? 0.9 : 0.2;

    if (depth === "full") {
      pixels = await analyzePixels(bytes);
      if (pixels) {
        effectiveDepth = "full";
        background = pixels.background;
        backgroundConfidence = pixels.backgroundConfidence;
      }
    }

    const base = {
      version: INTELLIGENCE_VERSION,
      depth: effectiveDepth,
      width, height, aspectRatio, orientation,
      format,
      fileWeightKb: Math.round(bytes.byteLength / 1024),
      hasAlpha: headerAlpha || (pixels ? pixels.background === "transparent" : false),
      occupancy: pixels?.occupancy ?? null,
      centeringOffset: pixels?.centeringOffset ?? null,
      emptyMargin: pixels?.emptyMargin ?? null,
      background,
      backgroundConfidence,
      brightness: pixels?.brightness ?? null,
      contrast: pixels?.contrast ?? null,
      sharpness: pixels?.sharpness ?? null,
      category: framing.key,
      targetOccupancyMin: framing.occupancyMin,
      targetOccupancyMax: framing.occupancyMax,
    };
    const { qualityScore, band } = scoreIntelligence(base);
    const intelligence: ImageIntelligence = { ...base, qualityScore, band };
    const recommendation = recommendOne(intelligence);

    return {
      status: "analyzed",
      durationMs: Date.now() - started,
      intelligence,
      recommendation,
      pixels,
      bytes: depth === "full" ? bytes : undefined,
    };
  } catch (e) {
    return {
      status: "failed",
      durationMs: Date.now() - started,
      intelligence: null, recommendation: null,
      errorMessage: e instanceof Error ? e.message : "Unknown analysis error.",
    };
  }
}
