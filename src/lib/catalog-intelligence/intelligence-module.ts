/**
 * IntelligenceModule contract — shared shape for every Catalog Intelligence
 * subsystem (Completeness, Attributes, Variants, SEO 2.0, Pricing, Vendor).
 *
 * Deterministic, explainable, modular. Every subsystem returns exactly this
 * shape so the Marketplace AI Assistant is a simple orchestrator with no
 * per-feature branching. Following the project AI UX rule: surface ONE
 * recommendation + ONE action by default; evidence powers "View details".
 */

export type EvidenceSeverity = "critical" | "warning" | "info";

export type Evidence = {
  /** Stable key (e.g. "missing_specs") — safe for analytics & i18n. */
  key: string;
  /** Human-readable one-line reason. Plain language, no jargon. */
  message: string;
  severity: EvidenceSeverity;
  /** Points recoverable by fixing this. 0–100. */
  impact: number;
};

export type IntelligenceStatus = "green" | "blue" | "amber" | "red";

/** Qualitative impact level for a recommendation. Deliberately not a %. */
export type PotentialImpact = "High" | "Medium" | "Low";

export type IntelligenceModule = {
  /** Module identifier, e.g. "product_completeness". */
  moduleId: string;
  /** Overall score 0–100. */
  score: number;
  /** Confidence 0–100 that the score reflects reality. */
  confidence: number;
  /** Traffic light for the AI UX rule. */
  status: IntelligenceStatus;
  /** ONE prioritized recommendation, plain language. */
  recommendation: string;
  /** ONE-click action label (e.g. "Add specifications"). */
  action: string;
  /** Optional deep-link path for the action (route to open). */
  actionHref?: string;
  /** Qualitative impact of the recommendation. */
  potentialImpact?: PotentialImpact;
  /** All findings, ranked by impact. Powers "View details". */
  evidence: Evidence[];
};

export function statusFromScore(score: number): IntelligenceStatus {
  if (score >= 85) return "green";
  if (score >= 70) return "blue";
  if (score >= 45) return "amber";
  return "red";
}

