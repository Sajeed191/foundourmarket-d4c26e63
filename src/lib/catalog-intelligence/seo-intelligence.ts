/**
 * SEO Intelligence 2.0 — Catalog Intelligence 2.0, Phase 4.
 *
 * Wraps the existing `analyzeSeo` advisor in the canonical IntelligenceModule
 * contract. Does NOT re-implement SEO analysis — it consumes the advisor
 * output, prioritises a single recommendation, derives qualitative Potential
 * Impact, and links to the product SEO editor. Deterministic and explainable.
 */
import {
  statusFromScore,
  type Evidence,
  type IntelligenceModule,
  type PotentialImpact,
} from "./intelligence-module";
import { analyzeSeo, type SeoAdvisory, type SeoDraft } from "./seo-advisor";

export type SeoIntelligenceInput = SeoDraft & { slug?: string };

export type SeoIntelligenceModule = IntelligenceModule & {
  advisories: SeoAdvisory[];
};

const IMPACT_BY_KEY: Record<string, number> = {
  missing_title: 25,
  missing_description: 20,
  thin_content: 18,
  keyword_stuffing: 18,
  missing_alt: 10,
  missing_og: 8,
  missing_keywords: 8,
  missing_product_schema: 6,
  missing_faq_schema: 4,
  missing_breadcrumb_schema: 4,
  internal_linking: 6,
  title_length: 4,
  description_length: 4,
};

const ACTION_BY_KEY: Record<string, string> = {
  missing_title: "Add SEO title",
  title_length: "Shorten SEO title",
  missing_description: "Add meta description",
  description_length: "Shorten meta description",
  thin_content: "Expand product content",
  keyword_stuffing: "Reduce keyword repetition",
  missing_keywords: "Add target keywords",
  missing_product_schema: "Enable product schema",
  missing_faq_schema: "Add FAQ schema",
  missing_breadcrumb_schema: "Add breadcrumb schema",
  missing_og: "Add social share image",
  missing_alt: "Add image alt text",
  internal_linking: "Add related products",
};

const RECOMMENDATION_BY_KEY: Record<string, string> = {
  missing_title: "Add an SEO title so this listing appears in search results.",
  title_length: "Shorten the SEO title to under 60 characters so it isn't truncated.",
  missing_description: "Add a meta description to boost click-through from search.",
  description_length: "Trim the meta description under 160 characters.",
  thin_content: "Expand the product description — thin content ranks poorly.",
  keyword_stuffing: "Reduce keyword repetition to avoid a search penalty.",
  missing_keywords: "Add target keywords to guide schema and internal linking.",
  missing_product_schema: "Enable Product structured data for rich results.",
  missing_faq_schema: "Add FAQ schema to win extra SERP real estate.",
  missing_breadcrumb_schema: "Add breadcrumb schema to improve navigation in results.",
  missing_og: "Add a share image so social previews render.",
  missing_alt: "Add image alt text for accessibility and image search.",
  internal_linking: "Link to related products to spread authority and aid discovery.",
};

function scoreAdvisory(a: SeoAdvisory): number {
  const base = IMPACT_BY_KEY[a.key] ?? (a.severity === "warning" ? 10 : 5);
  return a.severity === "critical" ? base + 10 : base;
}

function derivePotentialImpact(top: SeoAdvisory | undefined, score: number): PotentialImpact {
  if (!top) return "Low";
  if (top.severity === "critical") return "High";
  const impact = IMPACT_BY_KEY[top.key] ?? 0;
  if (top.severity === "warning" && (impact >= 15 || score < 60)) return "High";
  if (top.severity === "warning") return "Medium";
  return score < 70 ? "Medium" : "Low";
}

export function analyzeSeoIntelligence(input: SeoIntelligenceInput): SeoIntelligenceModule {
  const raw = analyzeSeo(input);

  // Sort advisories by weighted impact; critical/warning first.
  const sorted = [...raw.advisories].sort((a, b) => {
    const rank = (s: SeoAdvisory["severity"]) => (s === "critical" ? 0 : s === "warning" ? 1 : 2);
    const r = rank(a.severity) - rank(b.severity);
    if (r !== 0) return r;
    return scoreAdvisory(b) - scoreAdvisory(a);
  });

  const top = sorted[0];

  const evidence: Evidence[] = sorted.map((a) => ({
    key: a.key,
    message: a.label + " — " + a.why,
    severity: a.severity,
    impact: scoreAdvisory(a),
  }));

  const recommendation = top
    ? RECOMMENDATION_BY_KEY[top.key] ?? top.label
    : "SEO looks complete — no action needed.";
  const action = top ? ACTION_BY_KEY[top.key] ?? "Review SEO" : "Review SEO";
  const actionHref = input.slug ? `/admin-product/${input.slug}/seo` : undefined;

  const potentialImpact = derivePotentialImpact(top, raw.score);

  // Confidence: lower when the draft lacks the signals we scored on.
  let confidence = 100;
  if (!input.seoTitle && !input.seoDescription) confidence -= 15;
  if (!input.description) confidence -= 10;
  confidence = Math.max(0, Math.min(100, confidence));

  return {
    moduleId: "seo_intelligence",
    score: raw.score,
    confidence,
    status: statusFromScore(raw.score),
    recommendation,
    action,
    actionHref,
    potentialImpact,
    evidence,
    advisories: sorted,
  };
}
