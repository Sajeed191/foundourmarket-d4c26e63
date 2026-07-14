/**
 * Image Intelligence Engine v3 — server-only analysis pipeline.
 *
 * Runs inside `createServerFn` handlers on the Worker runtime.
 * Uses `image-size` (pure JS, Workers-safe) to read image headers.
 * Pixel-level analysis is deferred to Turn 2 (WASM decode); until then
 * `depth='header-only'` and pixel-derived fields are `null`.
 *
 * SAFETY: this module NEVER writes back to the image; it only reads bytes
 * from the CDN URL and returns a metadata payload. See the safety contract
 * in `image-intelligence-types.ts`.
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
} from "@/lib/image-intelligence-types";

const MAX_BYTES = 12 * 1024 * 1024; // 12MB safety cap
const FETCH_TIMEOUT_MS = 8000;

async function fetchImageBytes(url: string): Promise<Uint8Array> {
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

function detectFormat(bytes: Uint8Array): ImageIntelligence["format"] {
  if (bytes.length < 12) return "other";
  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpeg";
  // PNG
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  // WEBP: RIFF....WEBP
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45) return "webp";
  // GIF
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "gif";
  // AVIF (ISO-BMFF ftyp)
  const ftyp = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
  if (ftyp === "ftyp") {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand === "avif" || brand === "avis") return "avif";
  }
  return "other";
}

/** Cheap alpha detection: PNG color type 4 or 6, WEBP VP8L 'L' extended. */
function detectAlpha(bytes: Uint8Array, format: ImageIntelligence["format"]): boolean {
  if (format === "png" && bytes.length > 25) {
    // IHDR color type at byte offset 25
    const colorType = bytes[25];
    return colorType === 4 || colorType === 6;
  }
  if (format === "webp" && bytes.length > 20) {
    // Extended WEBP: 'VP8X' + flags byte at offset 20; alpha = bit 4
    const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (chunk === "VP8X") return (bytes[20] & 0x10) !== 0;
    // Lossless 'VP8L' always has alpha capability
    if (chunk === "VP8L") return true;
  }
  if (format === "gif") return true; // conservative
  return false;
}

export type AnalyzeInput = {
  imageUrl: string;
  categorySlug?: string | null;
};

export type AnalyzeOutput = {
  status: "analyzed" | "failed";
  durationMs: number;
  intelligence: ImageIntelligence | null;
  recommendation: ImageRecommendation | null;
  errorMessage?: string;
};

export async function analyzeImageServer({ imageUrl, categorySlug }: AnalyzeInput): Promise<AnalyzeOutput> {
  const started = Date.now();
  try {
    const bytes = await fetchImageBytes(imageUrl);
    const format = detectFormat(bytes);
    const hasAlpha = detectAlpha(bytes, format);

    // image-size accepts Uint8Array; may throw for unsupported formats
    let width = 0;
    let height = 0;
    try {
      const dims = imageSize(bytes);
      width = dims.width ?? 0;
      height = dims.height ?? 0;
    } catch {
      // best-effort — leave zeros; will be flagged by score
    }

    if (!width || !height) {
      return {
        status: "failed",
        durationMs: Date.now() - started,
        intelligence: null,
        recommendation: null,
        errorMessage: "Could not read image dimensions.",
      };
    }

    const aspectRatio = width / height;
    const orientation: ImageIntelligence["orientation"] =
      Math.abs(aspectRatio - 1) < 0.05 ? "square" :
      aspectRatio > 1 ? "landscape" : "portrait";

    const framing = resolveCategoryFraming(categorySlug);
    // Turn 1: header-only depth. Pixel fields intentionally null and honestly labelled.
    const background: BackgroundKind = hasAlpha ? "transparent" : "unknown";

    const base = {
      version: INTELLIGENCE_VERSION,
      depth: "header-only" as const,
      width, height, aspectRatio, orientation,
      format,
      fileWeightKb: Math.round(bytes.byteLength / 1024),
      hasAlpha,
      occupancy: null,
      centeringOffset: null,
      emptyMargin: null,
      background,
      backgroundConfidence: hasAlpha ? 0.9 : 0.2,
      brightness: null,
      contrast: null,
      sharpness: null,
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
    };
  } catch (e) {
    return {
      status: "failed",
      durationMs: Date.now() - started,
      intelligence: null,
      recommendation: null,
      errorMessage: e instanceof Error ? e.message : "Unknown analysis error.",
    };
  }
}
