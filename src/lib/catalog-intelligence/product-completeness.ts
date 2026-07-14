/**
 * Product Completeness Engine — Catalog Intelligence 2.0, Phase 1.
 *
 * Scores every listing across the 7 completeness dimensions (Images, Title,
 * Description, Attributes, Specifications, Variants, SEO) and returns the
 * canonical IntelligenceModule contract. Pure & deterministic — grounded in
 * the product row, never mutates content. Consumes Image Intelligence
 * (imageQuality) rather than duplicating pixel analysis.
 */
import {
  statusFromScore,
  type Evidence,
  type IntelligenceModule,
  type PotentialImpact,
} from "./intelligence-module";
import { analyzeAttributes, type AttributeIntelligence } from "./attribute-intelligence";

export type CompletenessInput = {
  slug?: string;
  name?: string | null;
  category?: string | null;
  description?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  metaKeywords?: string[] | string | null;
  imageCount: number;
  /** 0–100 from Image Intelligence. null if not yet analyzed. */
  imageQuality?: number | null;
  /** Raw attribute bag — Attribute Intelligence owns the analysis. */
  attributes?: Record<string, unknown> | null;
  /** Raw specifications bag — merged into attributes for coverage. */
  specifications?: Record<string, unknown> | null;
  /** Cheap fallback when caller has no attributes bag (e.g. legacy input). */
  attributeCount?: number;
  specCount: number;
  variantCount: number;
};


type Dimension = {
  key: string;
  label: string;
  weight: number; // 0–100
  score: number;  // 0–100
  evidence: Evidence[];
  /** Human label for the "Fix X" action if this dimension is the weakest. */
  action: string;
  /** Sub-path under /admin-product/$slug/ for the action link. */
  actionSubpath: string;
};

const clamp = (n: number) => Math.max(0, Math.min(100, n));

function scoreImages(input: CompletenessInput): Dimension {
  const ev: Evidence[] = [];
  let s = 100;
  if (input.imageCount === 0) {
    s = 0;
    ev.push({ key: "img_none", message: "No product images uploaded.", severity: "critical", impact: 20 });
  } else if (input.imageCount < 3) {
    s -= 40;
    ev.push({ key: "img_few", message: "Add at least 3 images from different angles.", severity: "warning", impact: 12 });
  }
  if (input.imageQuality != null) {
    s = clamp(s * 0.6 + input.imageQuality * 0.4);
    if (input.imageQuality < 60) {
      ev.push({ key: "img_quality", message: "Image quality is below marketplace standard.", severity: "warning", impact: 8 });
    }
  }
  return { key: "images", label: "Images", weight: 20, score: clamp(s), evidence: ev, action: "Improve images", actionSubpath: "details" };
}

function scoreTitle(input: CompletenessInput): Dimension {
  const ev: Evidence[] = [];
  const name = (input.name ?? "").trim();
  let s = 100;
  if (!name) { s = 0; ev.push({ key: "title_none", message: "Product has no title.", severity: "critical", impact: 15 }); }
  else if (name.length < 20) { s -= 40; ev.push({ key: "title_thin", message: "Title is too short — aim for 20–70 characters.", severity: "warning", impact: 8 }); }
  else if (name.length > 90) { s -= 20; ev.push({ key: "title_long", message: "Title is very long — shorten for readability.", severity: "info", impact: 3 }); }
  return { key: "title", label: "Title", weight: 15, score: clamp(s), evidence: ev, action: "Refine title", actionSubpath: "details" };
}

function scoreDescription(input: CompletenessInput): Dimension {
  const ev: Evidence[] = [];
  const len = (input.description ?? "").trim().length;
  let s = 100;
  if (len === 0) { s = 0; ev.push({ key: "desc_none", message: "No product description.", severity: "critical", impact: 15 }); }
  else if (len < 120) { s = 45; ev.push({ key: "desc_thin", message: "Description is thin — expand to at least 120 characters.", severity: "warning", impact: 10 }); }
  else if (len < 300) { s = 75; ev.push({ key: "desc_short", message: "Description could be more detailed.", severity: "info", impact: 5 }); }
  return { key: "description", label: "Description", weight: 15, score: clamp(s), evidence: ev, action: "Expand description", actionSubpath: "details" };
}

function scoreAttributes(input: CompletenessInput): Dimension {
  const ev: Evidence[] = [];
  let s = 100;
  if (input.attributeCount === 0) { s = 20; ev.push({ key: "attrs_none", message: "No attributes set (brand, colour, material, …).", severity: "warning", impact: 12 }); }
  else if (input.attributeCount < 3) { s = 60; ev.push({ key: "attrs_few", message: "Add more attributes to improve filtering & search.", severity: "info", impact: 6 }); }
  return { key: "attributes", label: "Attributes", weight: 15, score: clamp(s), evidence: ev, action: "Add attributes", actionSubpath: "details" };
}

function scoreSpecs(input: CompletenessInput): Dimension {
  const ev: Evidence[] = [];
  let s = 100;
  if (input.specCount === 0) { s = 20; ev.push({ key: "specs_none", message: "No specifications listed.", severity: "warning", impact: 12 }); }
  else if (input.specCount < 4) { s = 60; ev.push({ key: "specs_few", message: `Add ${4 - input.specCount} more specification${4 - input.specCount === 1 ? "" : "s"} to improve discoverability.`, severity: "info", impact: 6 }); }
  return { key: "specifications", label: "Specifications", weight: 15, score: clamp(s), evidence: ev, action: "Improve specifications", actionSubpath: "details" };
}

function scoreVariants(input: CompletenessInput): Dimension {
  const ev: Evidence[] = [];
  let s = input.variantCount > 0 ? 100 : 70;
  if (input.variantCount === 0) ev.push({ key: "variants_none", message: "No variants — consider offering size or colour options.", severity: "info", impact: 4 });
  return { key: "variants", label: "Variants", weight: 10, score: clamp(s), evidence: ev, action: "Add variants", actionSubpath: "variants" };
}

function scoreSeo(input: CompletenessInput): Dimension {
  const ev: Evidence[] = [];
  let s = 100;
  const kw = Array.isArray(input.metaKeywords)
    ? input.metaKeywords
    : (input.metaKeywords ?? "").split(",").map((k) => k.trim()).filter(Boolean);
  if (!input.seoTitle?.trim()) { s -= 40; ev.push({ key: "seo_title", message: "SEO title is missing.", severity: "warning", impact: 8 }); }
  else if (input.seoTitle.length > 60) { s -= 10; ev.push({ key: "seo_title_len", message: "SEO title exceeds 60 characters.", severity: "info", impact: 2 }); }
  if (!input.seoDescription?.trim()) { s -= 40; ev.push({ key: "seo_desc", message: "Meta description is missing.", severity: "warning", impact: 8 }); }
  else if (input.seoDescription.length > 160) { s -= 10; ev.push({ key: "seo_desc_len", message: "Meta description exceeds 160 characters.", severity: "info", impact: 2 }); }
  if (kw.length === 0) { s -= 20; ev.push({ key: "seo_kw", message: "Add target keywords.", severity: "info", impact: 4 }); }
  return { key: "seo", label: "SEO", weight: 10, score: clamp(s), evidence: ev, action: "Complete SEO", actionSubpath: "seo" };
}

export type ProductCompleteness = IntelligenceModule & {
  dimensions: { key: string; label: string; score: number; weight: number }[];
};

export function scoreProductCompleteness(input: CompletenessInput): ProductCompleteness {
  const dims: Dimension[] = [
    scoreImages(input),
    scoreTitle(input),
    scoreDescription(input),
    scoreAttributes(input),
    scoreSpecs(input),
    scoreVariants(input),
    scoreSeo(input),
  ];

  const totalW = dims.reduce((a, d) => a + d.weight, 0);
  const score = Math.round(dims.reduce((a, d) => a + d.score * d.weight, 0) / totalW);

  const evidence = dims.flatMap((d) => d.evidence).sort((a, b) => b.impact - a.impact);

  // Confidence lowers when we lack Image Intelligence signal or fields are absent.
  let confidence = 100;
  if (input.imageQuality == null && input.imageCount > 0) confidence -= 10;
  if (evidence.some((e) => e.severity === "critical")) confidence -= 5;
  confidence = clamp(confidence);

  // Pick the weakest weighted dimension for the single recommendation.
  const weakest = [...dims].sort((a, b) => (a.score * a.weight) - (b.score * b.weight))[0];
  const topEv = weakest.evidence[0];

  const recommendation = topEv
    ? topEv.message
    : "Listing looks complete — no action needed.";
  const action = topEv ? weakest.action : "Review listing";
  const actionHref = input.slug
    ? `/admin-product/${input.slug}/${weakest.actionSubpath}`
    : undefined;

  return {
    moduleId: "product_completeness",
    score,
    confidence,
    status: statusFromScore(score),
    recommendation,
    action,
    actionHref,
    evidence,
    dimensions: dims.map((d) => ({ key: d.key, label: d.label, score: d.score, weight: d.weight })),
  };
}
