/**
 * Image Intelligence Engine v3 — deterministic normalization.
 *
 * Photon-WASM only. No AI outpainting, no recoloring, no denoise, no sharpen.
 * Every step records {op, params, reason} into `actions[]` for full
 * explainability. All operations are pixel-safe:
 *   • crop only trims uniform background pixels (never product bbox).
 *   • padding/expansion never removes anything.
 *   • bg fill only paints INTO added margins, never over product pixels.
 *
 * Output is a fresh WebP; the original bytes are never mutated.
 */

import type { PixelAnalysis } from "@/lib/image-intelligence.server";
import type { CategoryFraming } from "@/lib/image-intelligence-types";

export type NormalizeAction = {
  op: "crop_margins" | "pad_canvas" | "recenter" | "fill_background" | "resize" | "encode_webp";
  params: Record<string, number | string>;
  reason: string;
};

export type NormalizeResult = {
  status: "produced" | "skipped";
  bytes: Uint8Array | null;
  actions: NormalizeAction[];
  targetLongEdge: number;
  skipReason?: string;
};

const TARGET_LONG_EDGE = 1600;
const SAFE_MARGIN = 0.06; // 6% around bbox
const WEBP_QUALITY = 82;

/**
 * Build a deterministic optimization plan then execute.
 * `pixels` are derived from the DOWNSAMPLED analysis buffer, so bbox and
 * margins are expressed as normalized 0..1 fractions — we scale them to the
 * full-resolution source before any pixel op.
 */
export async function normalizeImage(
  bytes: Uint8Array,
  pixels: PixelAnalysis,
  framing: CategoryFraming,
): Promise<NormalizeResult> {
  const actions: NormalizeAction[] = [];
  let photon: typeof import("@cf-wasm/photon");
  try {
    photon = await import("@cf-wasm/photon");
  } catch {
    return { status: "skipped", bytes: null, actions, targetLongEdge: TARGET_LONG_EDGE, skipReason: "photon-unavailable" };
  }

  let img: import("@cf-wasm/photon").PhotonImage;
  try {
    img = photon.PhotonImage.new_from_byteslice(bytes);
  } catch (e) {
    return {
      status: "skipped", bytes: null, actions, targetLongEdge: TARGET_LONG_EDGE,
      skipReason: e instanceof Error ? e.message : "decode-failed",
    };
  }

  const srcW = img.get_width();
  const srcH = img.get_height();

  // 1. Crop uniform background margins (only if empty margin is large + bg is uniform)
  const canTrim = pixels.background !== "busy" && pixels.background !== "lifestyle";
  const trim = { top: 0, right: 0, bottom: 0, left: 0 };
  if (canTrim) {
    const marginPad = SAFE_MARGIN;
    const cropTop = Math.max(0, pixels.emptyMargin.top - marginPad);
    const cropLeft = Math.max(0, pixels.emptyMargin.left - marginPad);
    const cropRight = Math.max(0, pixels.emptyMargin.right - marginPad);
    const cropBottom = Math.max(0, pixels.emptyMargin.bottom - marginPad);
    if (cropTop + cropLeft + cropRight + cropBottom > 0.02) {
      trim.top = Math.floor(cropTop * srcH);
      trim.left = Math.floor(cropLeft * srcW);
      trim.right = Math.floor(cropRight * srcW);
      trim.bottom = Math.floor(cropBottom * srcH);
      const x1 = trim.left;
      const y1 = trim.top;
      const x2 = srcW - trim.right;
      const y2 = srcH - trim.bottom;
      if (x2 - x1 > 100 && y2 - y1 > 100) {
        const cropped = photon.crop(img, x1, y1, x2, y2);
        img.free();
        img = cropped;
        actions.push({
          op: "crop_margins",
          params: { top: trim.top, right: trim.right, bottom: trim.bottom, left: trim.left },
          reason: "Trimmed uniform background margins while preserving product bbox.",
        });
      } else {
        trim.top = trim.left = trim.right = trim.bottom = 0;
      }
    }
  }

  // 2. Pad to reach target occupancy inside a square-ish canvas.
  // We want product occupancy ≈ midpoint of target band.
  const curW = img.get_width();
  const curH = img.get_height();
  // Approximate bbox in current (post-crop) image using original normalized bbox
  const bboxW = pixels.bbox.w * srcW; // px in ORIGINAL
  const bboxH = pixels.bbox.h * srcH;
  const bboxArea = bboxW * bboxH;
  const currentOccupancy = Math.min(1, bboxArea / (curW * curH));
  const targetOcc = (framing.occupancyMin + framing.occupancyMax) / 2;

  if (currentOccupancy > targetOcc + 0.03) {
    // Product too large in frame → pad canvas outward to reach target occupancy.
    const scale = Math.sqrt(currentOccupancy / targetOcc);
    const padW = Math.max(0, Math.round(curW * (scale - 1) / 2));
    const padH = Math.max(0, Math.round(curH * (scale - 1) / 2));
    if (padW > 0 || padH > 0) {
      const bg = new photon.Rgba(pixels.bgColor.r, pixels.bgColor.g, pixels.bgColor.b, 255);
      const padded = photon.padding_uniform(img, Math.max(padW, padH), bg);
      img.free();
      img = padded;
      actions.push({
        op: "pad_canvas",
        params: { padding: Math.max(padW, padH) },
        reason: `Expanded canvas by ~${Math.round((scale - 1) * 100)}% to reach ${Math.round(targetOcc * 100)}% target occupancy.`,
      });
      actions.push({
        op: "fill_background",
        params: { r: pixels.bgColor.r, g: pixels.bgColor.g, b: pixels.bgColor.b, kind: "solid_sampled" },
        reason: "Filled added margin with corner-sampled background color.",
      });
    }
  }

  // 3. Resize to target long edge.
  const w2 = img.get_width();
  const h2 = img.get_height();
  const longEdge = Math.max(w2, h2);
  if (longEdge !== TARGET_LONG_EDGE) {
    const scale = TARGET_LONG_EDGE / longEdge;
    const nw = Math.max(400, Math.round(w2 * scale));
    const nh = Math.max(400, Math.round(h2 * scale));
    const resized = photon.resize(img, nw, nh, photon.SamplingFilter.Lanczos3);
    img.free();
    img = resized;
    actions.push({
      op: "resize",
      params: { width: nw, height: nh },
      reason: `Resized to ${TARGET_LONG_EDGE}px long edge for consistent gallery.`,
    });
  }

  // 4. Encode WebP.
  let webpBytes: Uint8Array;
  try {
    webpBytes = img.get_bytes_webp();
    actions.push({
      op: "encode_webp",
      params: { quality: WEBP_QUALITY },
      reason: "Encoded as WebP for smaller file size at same visual quality.",
    });
  } catch (e) {
    img.free();
    return {
      status: "skipped", bytes: null, actions, targetLongEdge: TARGET_LONG_EDGE,
      skipReason: e instanceof Error ? e.message : "encode-failed",
    };
  }

  img.free();
  return { status: "produced", bytes: webpBytes, actions, targetLongEdge: TARGET_LONG_EDGE };
}
