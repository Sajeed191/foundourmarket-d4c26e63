/**
 * Marketplace Optimization — Marketplace Intelligence 3.0, Module 2.
 *
 * Operational dashboard view: instead of "Product A needs fixing", answers
 * "what does the marketplace need to fix?". Pure aggregation over the public
 * contracts of Catalog Intelligence 2.0 (MarketplaceReadiness +
 * IntelligenceModule + Recommendation). No new heuristics, no lower-layer
 * internals.
 *
 * Intelligence flows upward only:
 *   Image → Catalog (frozen) → Marketplace (this layer).
 */
import type {
  IntelligenceModule,
  MarketplaceReadiness,
  ReadinessStatus,
  Recommendation,
} from "@/lib/catalog-intelligence";
import { brokerRecommendations } from "@/lib/catalog-intelligence";
import type { VendorIntelligence } from "./vendor-intelligence";

/** One listing's public snapshot, matching VendorListingSnapshot in shape. */
export type OptimizationListing = {
  productId: string;
  productSlug?: string;
  vendorId?: string;
  vendorName?: string;
  categoryId?: string;
  categoryName?: string;
  readiness: MarketplaceReadiness;
  modules: IntelligenceModule[];
};

export type CategoryRollup = {
  categoryId: string;
  categoryName: string;
  listingCount: number;
  averageReadiness: number;
  moduleAverages: Record<string, number>;
  distribution: Record<ReadinessStatus, number>;
  topRecommendation: Recommendation | null;
};

export type EvidenceRollup = {
  key: string;
  message: string;
  moduleId: string;
  occurrences: number;
  affectedListings: number;
};

export type MarketplaceOptimization = {
  listingCount: number;
  averageReadiness: number;
  distribution: Record<ReadinessStatus, number>;
  moduleAverages: Record<string, number>;
  topRecommendations: Recommendation[];
  weakestCategories: CategoryRollup[];
  strongestCategories: CategoryRollup[];
  vendorsNeedingAttention: Array<
    Pick<VendorIntelligence, "vendorId" | "vendorName" | "score" | "tier" | "listingCount">
  >;
  topEvidence: EvidenceRollup[];
  explainable: true;
};

function meanOr0(xs: number[]): number {
  if (!xs.length) return 0;
  return Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
}

function emptyDistribution(): Record<ReadinessStatus, number> {
  return { ready: 0, almost_ready: 0, needs_attention: 0, not_ready: 0 };
}

function rollupCategory(
  categoryId: string,
  categoryName: string,
  listings: OptimizationListing[],
): CategoryRollup {
  const dist = emptyDistribution();
  const modScores: Record<string, number[]> = {};
  const readinessScores: number[] = [];

  for (const l of listings) {
    dist[l.readiness.status] += 1;
    readinessScores.push(l.readiness.score);
    for (const m of l.modules) {
      (modScores[m.moduleId] ??= []).push(m.score);
    }
  }

  const moduleAverages: Record<string, number> = {};
  for (const [k, v] of Object.entries(modScores)) moduleAverages[k] = meanOr0(v);

  const allModules = listings.flatMap((l) => l.modules);
  const topRecommendation = brokerRecommendations(allModules)[0] ?? null;

  return {
    categoryId,
    categoryName,
    listingCount: listings.length,
    averageReadiness: meanOr0(readinessScores),
    moduleAverages,
    distribution: dist,
    topRecommendation,
  };
}

export function buildMarketplaceOptimization(input: {
  listings: OptimizationListing[];
  vendors?: VendorIntelligence[];
}): MarketplaceOptimization {
  const listings = input.listings ?? [];
  const vendors = input.vendors ?? [];

  const distribution = emptyDistribution();
  const readinessScores: number[] = [];
  const moduleScoreMap: Record<string, number[]> = {};

  for (const l of listings) {
    distribution[l.readiness.status] += 1;
    readinessScores.push(l.readiness.score);
    for (const m of l.modules) (moduleScoreMap[m.moduleId] ??= []).push(m.score);
  }

  const moduleAverages: Record<string, number> = {};
  for (const [k, v] of Object.entries(moduleScoreMap)) moduleAverages[k] = meanOr0(v);

  // Category rollups.
  const byCategory = new Map<string, OptimizationListing[]>();
  for (const l of listings) {
    const key = l.categoryId ?? "__uncategorised__";
    (byCategory.get(key) ?? byCategory.set(key, []).get(key)!).push(l);
  }
  const categoryRollups: CategoryRollup[] = [];
  for (const [id, ls] of byCategory) {
    if (id === "__uncategorised__" && ls.length === 0) continue;
    const name = ls[0]?.categoryName ?? "Uncategorised";
    categoryRollups.push(rollupCategory(id, name, ls));
  }
  const sortedByHealth = [...categoryRollups].sort(
    (a, b) => a.averageReadiness - b.averageReadiness,
  );
  const weakestCategories = sortedByHealth.slice(0, 5);
  const strongestCategories = [...sortedByHealth].reverse().slice(0, 3);

  // Cross-marketplace top recommendations via the public broker.
  const allModules = listings.flatMap((l) => l.modules);
  const topRecommendations = brokerRecommendations(allModules).slice(0, 5);

  // Vendors needing attention (public VendorIntelligence contract only).
  const vendorsNeedingAttention = vendors
    .filter((v) => v.tier === "at_risk" || v.tier === "watch")
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map((v) => ({
      vendorId: v.vendorId,
      vendorName: v.vendorName,
      score: v.score,
      tier: v.tier,
      listingCount: v.listingCount,
    }));

  // Evidence rollup: most common issues across the marketplace.
  const evidenceMap = new Map<
    string,
    { message: string; moduleId: string; occurrences: number; listings: Set<string> }
  >();
  for (const l of listings) {
    for (const m of l.modules) {
      for (const e of m.evidence) {
        if (e.severity === "info") continue;
        const key = `${m.moduleId}::${e.key}`;
        const entry =
          evidenceMap.get(key) ??
          evidenceMap.set(key, {
            message: e.message,
            moduleId: m.moduleId,
            occurrences: 0,
            listings: new Set(),
          }).get(key)!;
        entry.occurrences += 1;
        entry.listings.add(l.productId);
      }
    }
  }
  const topEvidence: EvidenceRollup[] = [...evidenceMap.entries()]
    .map(([key, v]) => ({
      key,
      message: v.message,
      moduleId: v.moduleId,
      occurrences: v.occurrences,
      affectedListings: v.listings.size,
    }))
    .sort((a, b) => b.affectedListings - a.affectedListings)
    .slice(0, 10);

  return {
    listingCount: listings.length,
    averageReadiness: meanOr0(readinessScores),
    distribution,
    moduleAverages,
    topRecommendations,
    weakestCategories,
    strongestCategories,
    vendorsNeedingAttention,
    topEvidence,
    explainable: true,
  };
}
