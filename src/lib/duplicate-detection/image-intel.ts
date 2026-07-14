/**
 * Bridge between the Image Intelligence platform (`ImageAnalysis` v2) and the
 * duplicate detection engine. Extracts a compact, background-independent
 * summary — labels, object count, occupancy, AI confidence — so the engine
 * can compare product *subjects* rather than image bytes.
 *
 * Pure and defensive: unknown or partial analyses degrade gracefully to `null`
 * fields, which the engine treats as "signal unavailable".
 */
import type { ImageAnalysis } from "@/lib/image-normalization";
import type { ImageIntelSummary } from "./types";

type AnalysisLike = {
  occupancy?: number;
  product?: {
    objects?: Array<{ label?: string; confidence?: number }>;
    objectCount?: number;
    confidence?: number | null;
    occupancy?: number;
    analyzed?: boolean;
  };
};

/**
 * Produce an `ImageIntelSummary` from a persisted analysis object. Returns
 * null when there is nothing meaningful to compare (no AI labels *and* no
 * deterministic occupancy).
 */
export function toImageIntelSummary(
  analysis: AnalysisLike | ImageAnalysis | null | undefined,
): ImageIntelSummary | null {
  const a = (analysis ?? null) as AnalysisLike | null;
  if (!a) return null;
  const product = a.product;
  const labels = Array.from(
    new Set(
      (product?.objects ?? [])
        .map((o) => String(o?.label ?? "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  const objectCount =
    typeof product?.objectCount === "number"
      ? product.objectCount
      : labels.length > 0
        ? labels.length
        : null;
  const occupancy =
    typeof product?.occupancy === "number"
      ? product.occupancy
      : typeof analysis.occupancy === "number"
        ? analysis.occupancy
        : null;
  const aiConfidence =
    typeof product?.confidence === "number" ? product.confidence : null;

  if (labels.length === 0 && occupancy == null && objectCount == null) return null;
  return { objectCount, labels, occupancy, aiConfidence };
}
