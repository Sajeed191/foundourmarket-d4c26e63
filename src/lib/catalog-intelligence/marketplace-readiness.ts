/**
 * Marketplace Readiness — Catalog Intelligence 2.0, Phase 6 (final).
 *
 * Top-level orchestrator. Consumes IntelligenceModule outputs + the
 * Recommendation Broker and answers exactly three questions:
 *
 *   1. Is this listing ready to publish?
 *   2. If not, what's the single most important thing to fix?
 *   3. How confident is the system in that answer?
 *
 * DELIBERATELY not another scoring engine:
 *   - No new heuristics.
 *   - No duplicated business logic.
 *   - No hidden thresholds beyond publish-state buckets.
 *   - Pure aggregation over the canonical IntelligenceModule contract.
 *
 * Future modules (Vendor, Trust, Policy, Safety, Sustainability, Authenticity,
 * Regional Compliance, Inventory Reliability) plug in by simply appearing in
 * the `modules` array — no API change required.
 */
import type { IntelligenceModule } from "./intelligence-module";
import { brokerRecommendations, type Recommendation } from "./recommendation-broker";

export type ReadinessStatus =
  | "ready"           // 🟢 Safe to publish
  | "almost_ready"    // 🟡 Small improvements recommended
  | "needs_attention" // 🟠 Important improvements advised
  | "not_ready";      // 🔴 Critical issues should be resolved

export type MarketplaceReadiness = {
  score: number;                    // 0–100 weighted aggregate
  status: ReadinessStatus;
  confidence: number;               // 0–100
  topRecommendation: Recommendation | null;
  blockers: Recommendation[];       // High-impact recommendations
  strengths: string[];              // Human-readable "green" modules
  moduleScores: Record<string, number>;
  explainable: true;
};

/**
 * Publish-state buckets. The only "new" thresholds in the whole module —
 * everything else is straight aggregation.
 */
function statusFromScore(score: number, hasCritical: boolean): ReadinessStatus {
  if (hasCritical) return "not_ready";
  if (score >= 90) return "ready";
  if (score >= 75) return "almost_ready";
  if (score >= 55) return "needs_attention";
  return "not_ready";
}

const MODULE_LABEL: Record<string, string> = {
  product_completeness: "Completeness",
  attribute_intelligence: "Attributes",
  variant_intelligence: "Variants",
  seo_intelligence: "SEO",
  pricing_intelligence: "Pricing",
  image_intelligence: "Images",
};

function labelFor(id: string): string {
  return MODULE_LABEL[id] ?? id.replace(/_/g, " ");
}

export function assessMarketplaceReadiness(
  modules: IntelligenceModule[],
): MarketplaceReadiness {
  const clean = modules.filter(Boolean);

  // Pure aggregation: unweighted mean of module scores. Every module is a
  // peer — no hidden priority ranking beyond the Broker's own ordering.
  const score = clean.length
    ? Math.round(clean.reduce((a, m) => a + m.score, 0) / clean.length)
    : 0;

  // Confidence = mean of module confidences, lightly penalised when critical
  // evidence exists (the system is less sure the fix is small).
  const meanConf = clean.length
    ? clean.reduce((a, m) => a + m.confidence, 0) / clean.length
    : 0;
  const hasCritical = clean.some((m) =>
    m.evidence.some((e) => e.severity === "critical"),
  );
  const confidence = Math.max(0, Math.min(100, Math.round(meanConf - (hasCritical ? 5 : 0))));

  const recs = brokerRecommendations(clean);
  const topRecommendation = recs[0] ?? null;
  const blockers = recs.filter((r) => r.impact === "High");

  const strengths = clean
    .filter((m) => m.status === "green" && m.score >= 85)
    .map((m) => labelFor(m.moduleId));

  const moduleScores: Record<string, number> = {};
  for (const m of clean) moduleScores[m.moduleId] = m.score;

  return {
    score,
    status: statusFromScore(score, hasCritical),
    confidence,
    topRecommendation,
    blockers,
    strengths,
    moduleScores,
    explainable: true,
  };
}

export const READINESS_LABEL: Record<ReadinessStatus, string> = {
  ready: "Ready",
  almost_ready: "Almost Ready",
  needs_attention: "Needs Attention",
  not_ready: "Not Ready",
};

export const READINESS_DOT: Record<ReadinessStatus, string> = {
  ready: "bg-emerald-400",
  almost_ready: "bg-amber-400",
  needs_attention: "bg-orange-400",
  not_ready: "bg-destructive",
};

export const READINESS_EMOJI: Record<ReadinessStatus, string> = {
  ready: "🟢",
  almost_ready: "🟡",
  needs_attention: "🟠",
  not_ready: "🔴",
};
