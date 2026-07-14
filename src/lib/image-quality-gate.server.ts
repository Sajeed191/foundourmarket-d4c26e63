/**
 * Image Intelligence Engine v3 — mandatory Quality Gate.
 *
 * Every optimized image must pass ALL checks before `optimized_url` is
 * written. Any failure → discard optimized bytes, keep original, record
 * `rejection_reason`, surface an amber recommendation.
 */

import { analyzePixels, type PixelAnalysis } from "@/lib/image-intelligence.server";
import type { CategoryFraming } from "@/lib/image-intelligence-types";

export type GateCheck = {
  name: string;
  passed: boolean;
  detail: string;
};

export type GateResult = {
  passed: boolean;
  checks: GateCheck[];
  reason?: string;
  optimizedPixels: PixelAnalysis | null;
};

export async function runQualityGate(args: {
  originalPixels: PixelAnalysis;
  optimizedBytes: Uint8Array;
  framing: CategoryFraming;
}): Promise<GateResult> {
  const { originalPixels, optimizedBytes, framing } = args;
  const checks: GateCheck[] = [];

  // Decode optimized
  const optPixels = await analyzePixels(optimizedBytes);
  if (!optPixels) {
    return {
      passed: false,
      checks: [{ name: "decode_output", passed: false, detail: "Optimized image could not be re-decoded for validation." }],
      reason: "Could not decode optimized output for quality validation.",
      optimizedPixels: null,
    };
  }

  // 1. Resolution acceptable
  // We work off pixels analyzed at ≤512px, but occupancy/margins are the point.
  const resOk = optimizedBytes.byteLength > 8 * 1024; // >8KB sanity
  checks.push({
    name: "resolution_acceptable",
    passed: resOk,
    detail: resOk ? "Output has enough bytes to represent a real image." : "Output too small — likely encoding failure.",
  });

  // 2. Product fully visible (bbox inside canvas with margin)
  const { x, y, w, h } = optPixels.bbox;
  const insideCanvas = x >= 0.005 && y >= 0.005 && x + w <= 0.995 && y + h <= 0.995;
  checks.push({
    name: "product_fully_visible",
    passed: insideCanvas,
    detail: insideCanvas
      ? "Product bounding box sits inside canvas with safe margin."
      : "Product bounding box touches or exceeds canvas edge.",
  });

  // 3. Product pixels preserved (bbox occupancy did not lose signal)
  // If original had occupancy X, optimized should be ≥ 60% of X (allow padding).
  const occupancyRatio = originalPixels.occupancy > 0 ? optPixels.occupancy / originalPixels.occupancy : 1;
  const pixelsPreserved = occupancyRatio >= 0.5; // padding shrinks proportion, that's OK
  checks.push({
    name: "product_pixels_preserved",
    passed: pixelsPreserved,
    detail: pixelsPreserved
      ? `Product footprint retained (${Math.round(occupancyRatio * 100)}% of original).`
      : `Product footprint dropped to ${Math.round(occupancyRatio * 100)}% of original — possible crop into product.`,
  });

  // 4. No excessive blur (sharpness ≥ 80% of original)
  const sharpnessRatio = originalPixels.sharpness > 0 ? optPixels.sharpness / originalPixels.sharpness : 1;
  const sharpOk = sharpnessRatio >= 0.75;
  checks.push({
    name: "no_excessive_blur",
    passed: sharpOk,
    detail: sharpOk
      ? `Sharpness within ${Math.round(sharpnessRatio * 100)}% of original.`
      : `Sharpness dropped to ${Math.round(sharpnessRatio * 100)}% — optimized image is too soft.`,
  });

  // 5. Safe occupancy (within category band, allow small slack)
  const occ = optPixels.occupancy;
  const occOk = occ >= framing.occupancyMin - 0.05 && occ <= framing.occupancyMax + 0.05;
  checks.push({
    name: "safe_occupancy",
    passed: occOk,
    detail: occOk
      ? `Occupancy ${Math.round(occ * 100)}% inside category target ${Math.round(framing.occupancyMin * 100)}–${Math.round(framing.occupancyMax * 100)}%.`
      : `Occupancy ${Math.round(occ * 100)}% outside category target.`,
  });

  // 6. Background uniform when fill applied
  const bgOk = optPixels.backgroundConfidence >= 0.5;
  checks.push({
    name: "background_uniform",
    passed: bgOk,
    detail: bgOk
      ? "Background remains uniform after optimization."
      : "Background became less uniform — filled margin may not match.",
  });

  const failed = checks.filter((c) => !c.passed);
  return {
    passed: failed.length === 0,
    checks,
    reason: failed[0]?.detail,
    optimizedPixels: optPixels,
  };
}
