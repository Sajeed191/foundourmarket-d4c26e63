/**
 * Marketplace Health v1.0 — Executive Orchestrator (Layer 3 apex).
 *
 * Aggregates trusted public outputs into a single executive summary. Like
 * Marketplace Readiness at the listing level, Marketplace Health introduces
 * NO new detection or scoring logic — it composes stable public contracts:
 *
 *   Inputs (public contracts only):
 *     - MarketplaceOptimization
 *     - VendorIntelligence[]
 *     - TrustIntelligence
 *     - RelationshipIntelligence[]
 *     - Recommendation (via broker outputs surfaced by peers)
 *
 * NEVER imports:
 *     - Image Intelligence internals
 *     - Catalog Intelligence internals
 *     - Duplicate engine
 *     - AI services
 *
 * Intelligence flows upward only. Deterministic, advisory, explainable.
 * Follows the project AI UX rule: one recommendation, one action.
 */
import type { Recommendation } from "@/lib/catalog-intelligence";
import type { MarketplaceOptimization } from "./marketplace-optimization";
import type { VendorIntelligence, VendorHealthTier } from "./vendor-intelligence";
import type { TrustIntelligence } from "./trust-intelligence";
import type { RelationshipIntelligence } from "./relationship-intelligence";

export type HealthStatus = "healthy" | "good" | "needs_attention" | "critical";
export type Trend = "improving" | "stable" | "declining" | "unknown";

export type TrendBlock = {
  current: number;
  previous: number | null;
  delta: number;
  direction: Trend;
};

export type VendorRollup = {
  total: number;
  averageScore: number;
  byTier: Record<VendorHealthTier, number>;
  atRiskCount: number;
};

export type CatalogRollup = {
  listingCount: number;
  averageReadiness: number;
  distribution: MarketplaceOptimization["distribution"];
  moduleAverages: Record<string, number>;
  weakestCategoryName: string | null;
  strongestCategoryName: string | null;
};

export type TrustRollup = {
  score: number;
  status: TrustIntelligence["status"];
  criticalRisks: number;
  warningRisks: number;
  topRiskArea: string | null;
};

export type RelationshipRollup = {
  productsAnalysed: number;
  isolatedCount: number;
  isolatedRatio: number;
  averageFamilySize: number;
};

/** Persistent lifecycle tracking for the Recommendation Broker outputs. */
export type RecommendationLifecycleState =
  | "new"
  | "persistent"
  | "resolved"
  | "regressed";

export type LifecycleRecommendation = Recommendation & {
  lifecycle: RecommendationLifecycleState;
  firstSeenAt?: string;
  lastSeenAt?: string;
};

/** Optional previous snapshot used to compute trends + lifecycle state. */
export type MarketplaceHealthPrevious = {
  score?: number;
  vendorAverageScore?: number;
  averageReadiness?: number;
  trustScore?: number;
  /** Recommendation keys previously surfaced (e.g. `${moduleId}::${action}`). */
  recommendationKeys?: string[];
  /** Recommendation keys previously resolved. */
  resolvedKeys?: string[];
};

export type MarketplaceHealth = {
  version: 1;
  score: number;
  status: HealthStatus;
  confidence: number;
  executiveSummary: string;
  topRecommendation: Recommendation | null;
  strengths: string[];
  risks: string[];
  trends: {
    readiness: TrendBlock;
    vendorHealth: TrendBlock;
    catalogQuality: TrendBlock;
    trust: TrendBlock;
  };
  rollups: {
    vendors: VendorRollup;
    catalog: CatalogRollup;
    trust: TrustRollup;
    relationships: RelationshipRollup;
  };
  lifecycle: LifecycleRecommendation[];
  explainable: true;
};

type MarketplaceHealthInput = {
  optimization: MarketplaceOptimization;
  vendors: VendorIntelligence[];
  trust: TrustIntelligence;
  relationships?: RelationshipIntelligence[];
  /** Optional cross-marketplace recommendations already brokered elsewhere. */
  recommendations?: Recommendation[];
  previous?: MarketplaceHealthPrevious;
};

function statusFromHealth(score: number): HealthStatus {
  if (score >= 90) return "healthy";
  if (score >= 75) return "good";
  if (score >= 55) return "needs_attention";
  return "critical";
}

function trendBlock(current: number, previous: number | null | undefined): TrendBlock {
  if (previous == null) {
    return { current, previous: null, delta: 0, direction: "unknown" };
  }
  const delta = Math.round((current - previous) * 10) / 10;
  let direction: Trend = "stable";
  if (delta >= 2) direction = "improving";
  else if (delta <= -2) direction = "declining";
  return { current, previous, delta, direction };
}

function meanOr0(xs: number[]): number {
  if (!xs.length) return 0;
  return Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
}

function rollupVendors(vendors: VendorIntelligence[]): VendorRollup {
  const byTier: Record<VendorHealthTier, number> = {
    trusted: 0,
    reliable: 0,
    watch: 0,
    at_risk: 0,
  };
  for (const v of vendors) byTier[v.tier] += 1;
  return {
    total: vendors.length,
    averageScore: meanOr0(vendors.map((v) => v.score)),
    byTier,
    atRiskCount: byTier.at_risk,
  };
}

function rollupCatalog(opt: MarketplaceOptimization): CatalogRollup {
  return {
    listingCount: opt.listingCount,
    averageReadiness: opt.averageReadiness,
    distribution: opt.distribution,
    moduleAverages: opt.moduleAverages,
    weakestCategoryName: opt.weakestCategories[0]?.categoryName ?? null,
    strongestCategoryName: opt.strongestCategories[0]?.categoryName ?? null,
  };
}

function rollupTrust(trust: TrustIntelligence): TrustRollup {
  const critical = trust.risks.filter((r) => r.severity === "critical").length;
  const warning = trust.risks.filter((r) => r.severity === "warning").length;
  const topRiskArea =
    [...trust.risks].sort((a, b) => b.impact - a.impact)[0]?.area ?? null;
  return {
    score: trust.score,
    status: trust.status,
    criticalRisks: critical,
    warningRisks: warning,
    topRiskArea,
  };
}

function rollupRelationships(rel: RelationshipIntelligence[]): RelationshipRollup {
  const total = rel.length;
  const isolated = rel.filter((r) => r.isolated).length;
  const avgFam = total
    ? Math.round((rel.reduce((a, r) => a + r.familySize, 0) / total) * 10) / 10
    : 0;
  return {
    productsAnalysed: total,
    isolatedCount: isolated,
    isolatedRatio: total ? Math.round((isolated / total) * 100) / 100 : 0,
    averageFamilySize: avgFam,
  };
}

function recommendationKey(r: Recommendation): string {
  return `${r.module}::${r.action}`;
}

function assignLifecycle(
  current: Recommendation[],
  previous?: MarketplaceHealthPrevious,
): LifecycleRecommendation[] {
  const prevKeys = new Set(previous?.recommendationKeys ?? []);
  const resolvedKeys = new Set(previous?.resolvedKeys ?? []);
  const now = new Date().toISOString();
  return current.map((r) => {
    const key = recommendationKey(r);
    let lifecycle: RecommendationLifecycleState;
    if (resolvedKeys.has(key)) lifecycle = "regressed";
    else if (prevKeys.has(key)) lifecycle = "persistent";
    else lifecycle = "new";
    return { ...r, lifecycle, lastSeenAt: now };
  });
}

export function buildMarketplaceHealth(
  input: MarketplaceHealthInput,
): MarketplaceHealth {
  const { optimization, vendors, trust, relationships = [], recommendations, previous } = input;

  const vendorRollup = rollupVendors(vendors);
  const catalogRollup = rollupCatalog(optimization);
  const trustRollup = rollupTrust(trust);
  const relationshipRollup = rollupRelationships(relationships);

  // Weighted executive score across the four public pillars.
  //   Catalog readiness 40%, trust 25%, vendor health 25%, relationships 10%.
  const relScore = relationshipRollup.productsAnalysed
    ? Math.round(100 - relationshipRollup.isolatedRatio * 60)
    : 80;
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        catalogRollup.averageReadiness * 0.4 +
          trustRollup.score * 0.25 +
          vendorRollup.averageScore * 0.25 +
          relScore * 0.1,
      ),
    ),
  );
  const status = statusFromHealth(score);

  // Confidence proxy: how much evidence we had across pillars.
  const evidenceCoverage =
    (catalogRollup.listingCount > 0 ? 40 : 0) +
    (vendorRollup.total > 0 ? 25 : 0) +
    (trust.risks.length + trust.strengths.length > 0 ? 20 : 10) +
    (relationshipRollup.productsAnalysed > 0 ? 15 : 5);
  const confidence = Math.min(100, evidenceCoverage);

  // Trends against previous snapshot.
  const trends = {
    readiness: trendBlock(catalogRollup.averageReadiness, previous?.averageReadiness ?? null),
    vendorHealth: trendBlock(vendorRollup.averageScore, previous?.vendorAverageScore ?? null),
    catalogQuality: trendBlock(catalogRollup.averageReadiness, previous?.averageReadiness ?? null),
    trust: trendBlock(trustRollup.score, previous?.trustScore ?? null),
  };

  // Top recommendation: prefer trust's escalated one, then optimization top,
  // then any externally-provided cross-marketplace recommendation.
  const candidateRecs: Recommendation[] = [
    ...(trust.topRecommendation ? [trust.topRecommendation] : []),
    ...optimization.topRecommendations,
    ...(recommendations ?? []),
  ];
  // Dedupe by moduleId::action, preserve order.
  const seen = new Set<string>();
  const deduped: Recommendation[] = [];
  for (const r of candidateRecs) {
    const k = recommendationKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(r);
  }
  const topRecommendation = deduped[0] ?? null;
  const lifecycle = assignLifecycle(deduped.slice(0, 10), previous);

  // Strengths & risks — plain-language, executive-facing.
  const strengths: string[] = [];
  if (catalogRollup.averageReadiness >= 85) strengths.push("Catalog readiness is strong across the marketplace.");
  if (trustRollup.score >= 85) strengths.push("Trust signals are healthy — no critical operational risks.");
  if (vendorRollup.byTier.trusted > 0)
    strengths.push(`${vendorRollup.byTier.trusted} vendor${vendorRollup.byTier.trusted === 1 ? "" : "s"} performing at the "trusted" tier.`);
  if (catalogRollup.strongestCategoryName)
    strengths.push(`"${catalogRollup.strongestCategoryName}" is the strongest category.`);
  if (trust.strengths[0]) strengths.push(trust.strengths[0]);

  const risks: string[] = [];
  if (trustRollup.criticalRisks > 0)
    risks.push(`${trustRollup.criticalRisks} critical trust risk${trustRollup.criticalRisks === 1 ? "" : "s"} need attention.`);
  if (vendorRollup.atRiskCount > 0)
    risks.push(`${vendorRollup.atRiskCount} vendor${vendorRollup.atRiskCount === 1 ? "" : "s"} at risk of underperforming.`);
  if (catalogRollup.weakestCategoryName && catalogRollup.averageReadiness < 85)
    risks.push(`"${catalogRollup.weakestCategoryName}" is the weakest category by readiness.`);
  if (relationshipRollup.isolatedRatio >= 0.4)
    risks.push(`${Math.round(relationshipRollup.isolatedRatio * 100)}% of analysed products have no siblings or accessories.`);

  // Executive summary — one paragraph, plain language.
  const trendPhrase =
    trends.readiness.direction === "improving"
      ? "readiness is improving"
      : trends.readiness.direction === "declining"
        ? "readiness is slipping"
        : "readiness is stable";
  const headline =
    status === "healthy"
      ? "The marketplace is operating at a healthy level."
      : status === "good"
        ? "The marketplace is operating well."
        : status === "needs_attention"
          ? "The marketplace needs attention in a few areas."
          : "The marketplace has critical issues requiring immediate action.";
  const focus = topRecommendation
    ? ` The highest-impact next step is: ${topRecommendation.recommendation}`
    : "";
  const executiveSummary = `${headline} Overall health ${score}/100 (${trendPhrase}).${focus}`;

  return {
    version: 1,
    score,
    status,
    confidence,
    executiveSummary,
    topRecommendation,
    strengths: strengths.slice(0, 4),
    risks: risks.slice(0, 4),
    trends,
    rollups: {
      vendors: vendorRollup,
      catalog: catalogRollup,
      trust: trustRollup,
      relationships: relationshipRollup,
    },
    lifecycle,
    explainable: true,
  };
}

export const HEALTH_STATUS_LABEL: Record<HealthStatus, string> = {
  healthy: "Healthy",
  good: "Good",
  needs_attention: "Needs Attention",
  critical: "Critical",
};

export const TREND_LABEL: Record<Trend, string> = {
  improving: "↑ Improving",
  stable: "→ Stable",
  declining: "↓ Declining",
  unknown: "— No prior data",
};
