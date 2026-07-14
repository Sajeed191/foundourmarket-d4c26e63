/**
 * Attribute Intelligence — Catalog Intelligence 2.0, Phase 2.
 *
 * Evaluates a listing's attributes against a category profile:
 *   • Completeness — which required attributes are missing
 *   • Consistency — obvious internal conflicts (duplicate values)
 *   • Marketplace standards — matches profile-defined marketplace norms
 *
 * Deterministic, explainable, modular. Returns the canonical
 * IntelligenceModule contract so the Marketplace AI Assistant can consume it
 * exactly like every other subsystem. Never mutates the listing.
 */
import {
  statusFromScore,
  type Evidence,
  type IntelligenceModule,
} from "./intelligence-module";
import { profileFor, readAttr, type AttributeProfile } from "./category-profiles";

export type AttributeInput = {
  slug?: string;
  category?: string | null;
  /** Merged attribute map (attributes + specifications). Values are stringified. */
  attributes: Record<string, unknown> | null | undefined;
  /** Optional raw specifications bag — merged with attributes for coverage. */
  specifications?: Record<string, unknown> | null;
};

export type AttributeIntelligence = IntelligenceModule & {
  profile: { category: string; label: string; required: string[]; optional: string[] };
  present: string[];
  missingRequired: string[];
  missingOptional: string[];
  conflicts: string[];
  potentialImpact: "High" | "Medium" | "Low";
};

const clamp = (n: number) => Math.max(0, Math.min(100, n));

function mergeBag(input: AttributeInput): Record<string, unknown> {
  return { ...(input.specifications ?? {}), ...(input.attributes ?? {}) };
}

function detectConflicts(bag: Record<string, unknown>): string[] {
  const conflicts: string[] = [];
  const seen = new Map<string, string[]>();
  for (const [k, v] of Object.entries(bag)) {
    if (v == null) continue;
    const key = k.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const val = String(v).trim();
    if (!val) continue;
    const list = seen.get(key) ?? [];
    if (!list.includes(val)) list.push(val);
    seen.set(key, list);
  }
  for (const [key, values] of seen) {
    if (values.length > 1) conflicts.push(`${key}: ${values.join(" vs ")}`);
  }
  return conflicts;
}

export function analyzeAttributes(input: AttributeInput): AttributeIntelligence {
  const profile: AttributeProfile = profileFor(input.category);
  const bag = mergeBag(input);

  const present: string[] = [];
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];

  for (const key of profile.required) {
    if (readAttr(bag, key)) present.push(key);
    else missingRequired.push(key);
  }
  for (const key of profile.optional) {
    if (readAttr(bag, key)) present.push(key);
    else missingOptional.push(key);
  }

  const conflicts = detectConflicts(bag);

  // Score: required attributes weigh 80%, optional 15%, penalise conflicts up to 20 pts.
  const requiredCoverage =
    profile.required.length === 0
      ? 100
      : ((profile.required.length - missingRequired.length) / profile.required.length) * 100;
  const optionalCoverage =
    profile.optional.length === 0
      ? 100
      : ((profile.optional.length - missingOptional.length) / profile.optional.length) * 100;

  let score = requiredCoverage * 0.8 + optionalCoverage * 0.15 + 5; // +5 baseline
  score -= Math.min(20, conflicts.length * 8);
  score = clamp(Math.round(score));

  const evidence: Evidence[] = [];
  if (missingRequired.length > 0) {
    evidence.push({
      key: "attrs_missing_required",
      message: `Missing required: ${missingRequired.join(", ")}.`,
      severity: "warning",
      impact: Math.min(40, missingRequired.length * 10),
    });
  }
  if (conflicts.length > 0) {
    evidence.push({
      key: "attrs_conflict",
      message: `Conflicting values detected in ${conflicts.length} attribute${conflicts.length === 1 ? "" : "s"}.`,
      severity: "critical",
      impact: Math.min(30, conflicts.length * 10),
    });
  }
  if (missingOptional.length > 0 && missingRequired.length === 0) {
    evidence.push({
      key: "attrs_missing_optional",
      message: `Consider adding: ${missingOptional.slice(0, 3).join(", ")}.`,
      severity: "info",
      impact: Math.min(10, missingOptional.length * 2),
    });
  }
  if (evidence.length === 0) {
    evidence.push({
      key: "attrs_ok",
      message: `All ${profile.label} standard attributes present.`,
      severity: "info",
      impact: 0,
    });
  }

  // Potential impact (qualitative, per user rule — no fake percentages).
  const potentialImpact: AttributeIntelligence["potentialImpact"] =
    missingRequired.length >= 2 || conflicts.length > 0
      ? "High"
      : missingRequired.length === 1 || missingOptional.length >= 3
      ? "Medium"
      : "Low";

  const recommendation =
    conflicts.length > 0
      ? `Resolve conflicting attribute values (${conflicts.length}).`
      : missingRequired.length > 0
      ? `Add ${missingRequired.slice(0, 2).join(" and ")} to meet ${profile.label} standards.`
      : missingOptional.length > 0
      ? `Enrich with ${missingOptional[0]} for better discoverability.`
      : "Attributes meet marketplace standards.";

  const action =
    conflicts.length > 0
      ? "Resolve conflicts"
      : missingRequired.length > 0 || missingOptional.length > 0
      ? "Add attributes"
      : "Review attributes";

  const actionHref = input.slug ? `/admin-product/${input.slug}/details` : undefined;

  const confidence = clamp(
    100 -
      (profile.category === "*" ? 20 : 0) -
      (Object.keys(bag).length === 0 ? 10 : 0),
  );

  return {
    moduleId: "attribute_intelligence",
    score,
    confidence,
    status: statusFromScore(score),
    recommendation,
    action,
    actionHref,
    evidence,
    profile: {
      category: profile.category,
      label: profile.label,
      required: profile.required,
      optional: profile.optional,
    },
    present,
    missingRequired,
    missingOptional,
    conflicts,
    potentialImpact,
  };
}
