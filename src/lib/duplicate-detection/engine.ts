/**
 * Duplicate confidence engine — the core intelligence layer.
 *
 * Deterministic and explainable, exactly like the recommendation scorer: each
 * layer produces a measurable 0–1 similarity with a fixed weight and a
 * human-readable reason. The final 0–100 score is a weighted blend of the
 * layers that actually have data, with an exact barcode short-circuit.
 *
 * Never blocks — it classifies and explains so the admin decides.
 */
import type {
  DetectionProduct,
  DraftProduct,
  DupBadge,
  DupMatch,
  DupSignal,
  DupSignalKey,
  DupVerdict,
  DupWeights,
} from "./types";
import { DEFAULT_WEIGHTS } from "./types";
import {
  normalizeCode,
  normalizeSku,
  normalizeSpecKey,
  normalizeSpecValue,
  titleFingerprint,
  normalizeText,
} from "./normalize";
import { titleSimilarity, keywordSimilarity } from "./text-similarity";
import { imageSimilarity } from "./image-hash";

function pushSignal(
  out: DupSignal[],
  key: DupSignalKey,
  label: string,
  similarity: number,
  weight: number,
  matchThreshold: number,
  reason: string,
) {
  out.push({
    key,
    label,
    similarity: Math.max(0, Math.min(1, similarity)),
    weight,
    matched: similarity >= matchThreshold,
    reason,
  });
}

/** Compare two spec maps semantically (canonical keys + normalized values). */
function specSimilarity(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): number | null {
  const na = new Map<string, string>();
  const nb = new Map<string, string>();
  for (const [k, v] of Object.entries(a ?? {})) na.set(normalizeSpecKey(k), normalizeSpecValue(v));
  for (const [k, v] of Object.entries(b ?? {})) nb.set(normalizeSpecKey(k), normalizeSpecValue(v));
  if (!na.size || !nb.size) return null;
  let shared = 0;
  let equal = 0;
  for (const [k, v] of na) {
    if (nb.has(k)) {
      shared++;
      if (nb.get(k) === v) equal++;
    }
  }
  if (!shared) return 0;
  return equal / shared;
}

/** Variant axis overlap — used to distinguish "new variant" from "duplicate". */
function variantOverlap(draftKeys: string[] | undefined, candidate: DetectionProduct): number {
  const dk = new Set((draftKeys ?? []).map((k) => normalizeText(k)).filter(Boolean));
  if (!dk.size) return 0;
  // Candidate variant colours/sizes live in its attributes/specs values.
  const candVals = new Set<string>();
  for (const v of Object.values(candidate.attributes ?? {})) candVals.add(normalizeText(v));
  for (const v of Object.values(candidate.specifications ?? {})) candVals.add(normalizeText(v));
  let inter = 0;
  for (const k of dk) if (candVals.has(k)) inter++;
  return inter / dk.size;
}

function verdictFor(score: number): DupVerdict {
  if (score >= 97) return "exact";
  if (score >= 80) return "high";
  if (score >= 55) return "possible";
  if (score >= 30) return "similar";
  return "safe";
}

function badgesFor(signals: DupSignal[], isVariant: boolean): DupBadge[] {
  const b = new Set<DupBadge>();
  const by = new Map(signals.map((s) => [s.key, s]));
  if (by.get("barcode")?.matched) b.add("BARCODE MATCH");
  if ((by.get("image")?.similarity ?? 0) >= 0.85) b.add("IMAGE MATCH");
  if ((by.get("title")?.similarity ?? 0) >= 0.85) b.add("TITLE MATCH");
  if ((by.get("specifications")?.similarity ?? 0) >= 0.8) b.add("SPEC MATCH");
  if (isVariant) b.add("VARIANT");
  return Array.from(b);
}

/**
 * Score one draft against one candidate. Returns the match with score,
 * verdict, per-layer signals and badges.
 */
export function scoreDuplicate(
  draft: DraftProduct,
  candidate: DetectionProduct,
  opts: { weights?: DupWeights; historyBoost?: number } = {},
): DupMatch {
  const w = opts.weights ?? DEFAULT_WEIGHTS;
  const signals: DupSignal[] = [];

  // --- Barcode / UPC / EAN (exact short-circuit) ---
  const draftCode = normalizeCode(draft.barcode) || normalizeCode(draft.ean);
  const candCode = normalizeCode(candidate.barcode) || normalizeCode(candidate.ean);
  const barcodeExact = !!draftCode && draftCode === candCode;
  if (draftCode && candCode) {
    pushSignal(signals, "barcode", "Barcode / UPC / EAN", barcodeExact ? 1 : 0, w.barcode, 1, barcodeExact ? "Same barcode" : "Different barcode");
  }

  // --- Title ---
  const titleSim = titleSimilarity(draft.name ?? "", candidate.name ?? "");
  const fpEqual = titleFingerprint(draft.name) && titleFingerprint(draft.name) === titleFingerprint(candidate.name);
  pushSignal(signals, "title", "Product title", fpEqual ? 1 : titleSim, w.title, 0.85, fpEqual ? "Same title" : titleSim >= 0.6 ? "Very similar title" : "Related title");

  // --- Brand ---
  if (draft.brand && candidate.brand) {
    const brandSim = normalizeText(draft.brand) === normalizeText(candidate.brand) ? 1 : titleSimilarity(draft.brand, candidate.brand);
    pushSignal(signals, "brand", "Brand", brandSim, w.brand, 0.9, brandSim >= 0.9 ? "Same brand" : "Similar brand");
  }

  // --- Category ---
  const draftCats = new Set([draft.category, ...(draft.categories ?? [])].filter(Boolean).map((c) => normalizeText(c as string)));
  const candCats = new Set([candidate.category, ...(candidate.categories ?? [])].filter(Boolean).map((c) => normalizeText(c as string)));
  if (draftCats.size && candCats.size) {
    let catInter = 0;
    for (const c of draftCats) if (candCats.has(c)) catInter++;
    const catSim = catInter > 0 ? 1 : 0;
    pushSignal(signals, "category", "Category", catSim, w.category, 1, catSim ? "Same category" : "Different category");
  }

  // --- SKU ---
  const draftSku = normalizeSku(draft.sku);
  const candSku = normalizeSku(candidate.sku);
  if (draftSku && candSku) {
    const skuSim = draftSku === candSku ? 1 : titleSimilarity(draftSku, candSku);
    pushSignal(signals, "sku", "SKU", skuSim, w.sku, 0.9, skuSim >= 0.99 ? "Same SKU" : "Similar SKU");
  }

  // --- Image ---
  const imgSim = imageSimilarity(draft.imagePhash, candidate.imagePhash);
  if (imgSim != null) {
    pushSignal(signals, "image", "Image", imgSim, w.image, 0.85, imgSim >= 0.9 ? "Same main image" : imgSim >= 0.7 ? "Very similar image" : "Related image");
  }

  // --- Description (semantic-ish token overlap) ---
  if (draft.description && candidate.description) {
    const descSim = keywordSimilarity(draft.description, candidate.description);
    pushSignal(signals, "description", "Description", descSim, w.description, 0.7, descSim >= 0.7 ? "Same description" : "Similar description");
  }

  // --- Specifications ---
  const specSim = specSimilarity(draft.specifications, candidate.specifications);
  if (specSim != null) {
    pushSignal(signals, "specifications", "Specifications", specSim, w.specifications, 0.8, specSim >= 0.8 ? "Same specifications" : "Overlapping specs");
  }

  // --- Attributes ---
  const attrSim = specSimilarity(draft.attributes, candidate.attributes);
  if (attrSim != null) {
    pushSignal(signals, "attributes", "Attributes", attrSim, w.attributes, 0.8, attrSim >= 0.8 ? "Same attributes" : "Overlapping attributes");
  }

  // --- Price ---
  const dp = draft.priceInr ?? draft.priceUsd;
  const cp = candidate.priceInr ?? candidate.priceUsd;
  if (dp != null && cp != null && dp > 0 && cp > 0) {
    const priceSim = 1 - Math.min(1, Math.abs(dp - cp) / Math.max(dp, cp));
    pushSignal(signals, "price", "Price", priceSim, w.price, 0.9, priceSim >= 0.95 ? "Same price" : "Similar price");
  }

  // --- Keyword overlap (title + description) ---
  const kwSim = keywordSimilarity(`${draft.name} ${draft.description ?? ""}`, `${candidate.name} ${candidate.description ?? ""}`);
  pushSignal(signals, "keywords", "Keyword match", kwSim, w.keywords, 0.7, kwSim >= 0.7 ? "Same keywords" : "Overlapping keywords");

  // --- Admin learning history boost ---
  if (opts.historyBoost) {
    pushSignal(signals, "history", "Admin history", Math.max(0, Math.min(1, opts.historyBoost)), w.history, 0.5, opts.historyBoost > 0 ? "Previously confirmed/merged" : "Previously ignored");
  }

  // --- Blend ---
  let score: number;
  if (barcodeExact) {
    score = 100;
  } else {
    let weighted = 0;
    let totalW = 0;
    for (const s of signals) {
      if (s.key === "barcode") continue; // handled above; non-exact adds nothing
      weighted += s.similarity * s.weight;
      totalW += s.weight;
    }
    score = totalW > 0 ? (weighted / totalW) * 100 : 0;
    // Mild history nudge (bounded).
    if (opts.historyBoost) score = Math.max(0, Math.min(100, score + opts.historyBoost * 8));
  }
  score = Math.round(score);

  // --- Variant detection: strong product match but differing variant axis ---
  const vOverlap = variantOverlap(draft.variantKeys, candidate);
  const highProductMatch = score >= 70 || barcodeExact;
  const isVariantOfSame = highProductMatch && (draft.variantKeys?.length ?? 0) > 0 && vOverlap < 0.5;

  const verdict = verdictFor(score);
  const leadBadges: DupBadge[] =
    score >= 97 ? ["EXACT"] : score >= 55 ? ["SIMILAR"] : [];
  return {
    product: candidate,
    score,
    verdict,
    signals: signals.sort((a, b) => b.similarity * b.weight - a.similarity * a.weight),
    badges: uniqueBadges([
      ...leadBadges,
      ...(isVariantOfSame ? (["VARIANT"] as DupBadge[]) : []),
      ...badgesFor(signals, isVariantOfSame),
    ]),
    isVariantOfSame,
    ignored: false,
  };
}

/** De-duplicate the badge list while preserving priority order. */
export function uniqueBadges(badges: DupBadge[]): DupBadge[] {
  return Array.from(new Set(badges));
}
