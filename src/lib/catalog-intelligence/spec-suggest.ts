/**
 * Specification Intelligence.
 *
 * Recommends specification *fields* a product is missing, grounded in what
 * similar catalog products (same category/brand) actually define — never
 * inventing values. Suggestions are clearly marked and carry the evidence
 * (how many similar products define the field). Deterministic and pure.
 */
import { normalizeText } from "@/lib/duplicate-detection";
import { normalizeSpecKey } from "@/lib/duplicate-detection/normalize";

export type SpecSuggestion = {
  key: string;
  /** How common this spec is among similar products (0–1). */
  coverage: number;
  /** Example values seen in the catalog (for reference — not applied). */
  sampleValues: string[];
  /** Human-readable evidence. */
  reason: string;
};

/** A lean product view needed for spec mining. */
export type SpecPeer = {
  category: string | null;
  brand: string | null;
  specifications: Record<string, string>;
};

/** Category-agnostic baseline spec fields most quality catalogs define. */
const BASELINE = ["weight", "dimensions", "material", "warranty", "capacity", "power", "compatibility", "country of origin", "manufacturer"];

/**
 * Suggest missing specs for a draft based on peers in the same category/brand.
 * Falls back to the universal baseline when the catalog has few peers.
 */
export function suggestSpecs(
  draft: { category?: string | null; brand?: string | null; specifications?: Record<string, string> },
  catalog: SpecPeer[],
  limit = 8,
): SpecSuggestion[] {
  const cat = normalizeText(draft.category ?? "");
  const brand = normalizeText(draft.brand ?? "");
  const have = new Set(Object.keys(draft.specifications ?? {}).map(normalizeSpecKey));

  const peers = catalog.filter((p) => {
    const pc = normalizeText(p.category ?? "");
    return cat && pc === cat;
  });
  const brandPeers = peers.filter((p) => brand && normalizeText(p.brand ?? "") === brand);
  const pool = (brandPeers.length >= 3 ? brandPeers : peers).filter((p) => Object.keys(p.specifications ?? {}).length);

  const counts = new Map<string, { n: number; values: Set<string> }>();
  for (const p of pool) {
    for (const [k, v] of Object.entries(p.specifications ?? {})) {
      const nk = normalizeSpecKey(k);
      if (!nk || have.has(nk)) continue;
      if (!counts.has(nk)) counts.set(nk, { n: 0, values: new Set() });
      const e = counts.get(nk)!;
      e.n++;
      if (v?.trim()) e.values.add(v.trim());
    }
  }

  const suggestions: SpecSuggestion[] = [];
  const total = pool.length || 1;
  for (const [key, { n, values }] of counts) {
    const coverage = n / total;
    if (coverage < 0.25) continue;
    suggestions.push({
      key,
      coverage,
      sampleValues: [...values].slice(0, 3),
      reason: `${Math.round(coverage * 100)}% of similar products define "${key}"`,
    });
  }

  // Fill from baseline if the catalog signal is thin.
  if (suggestions.length < 4) {
    for (const key of BASELINE) {
      if (have.has(normalizeSpecKey(key)) || suggestions.some((s) => s.key === key)) continue;
      suggestions.push({ key, coverage: 0, sampleValues: [], reason: "Commonly expected for quality listings" });
    }
  }

  return suggestions.sort((a, b) => b.coverage - a.coverage).slice(0, limit);
}
