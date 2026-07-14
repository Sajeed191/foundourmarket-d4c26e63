/**
 * SEO Intelligence 2.0 — advisory layer.
 *
 * Extends the existing AI SEO generation with explainable *advisories* over a
 * product draft: schema coverage, keyword stuffing, thin/duplicate content,
 * missing structured data, and internal-linking / cross-sell SEO suggestions.
 * It never rewrites content — it explains WHY and recommends. Deterministic.
 */
import { tokenize } from "@/lib/duplicate-detection";

export type SeoAdvisoryKey =
  | "missing_title"
  | "title_length"
  | "missing_description"
  | "description_length"
  | "thin_content"
  | "keyword_stuffing"
  | "missing_keywords"
  | "missing_product_schema"
  | "missing_faq_schema"
  | "missing_breadcrumb_schema"
  | "missing_og"
  | "missing_alt"
  | "internal_linking";

export type SeoAdvisory = {
  key: SeoAdvisoryKey;
  label: string;
  why: string;
  severity: "critical" | "warning" | "info";
};

export type SeoDraft = {
  name: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  description?: string | null;
  keywords?: string | string[] | null;
  imageAlt?: string | null;
  category?: string | null;
  hasFaq?: boolean;
  hasRelated?: boolean;
  hasImage?: boolean;
};

export type SeoIntelligence = {
  score: number; // 0–100
  advisories: SeoAdvisory[];
};

export function analyzeSeo(draft: SeoDraft): SeoIntelligence {
  const advisories: SeoAdvisory[] = [];
  const add = (a: SeoAdvisory) => advisories.push(a);

  const title = draft.seoTitle?.trim() ?? "";
  const desc = draft.seoDescription?.trim() ?? "";
  const body = draft.description?.trim() ?? "";
  const kw = Array.isArray(draft.keywords)
    ? draft.keywords
    : (draft.keywords ?? "").split(",").map((k) => k.trim()).filter(Boolean);

  if (!title) add({ key: "missing_title", label: "Missing SEO title", why: "Search engines show the title as the clickable headline.", severity: "warning" });
  else if (title.length > 60) add({ key: "title_length", label: "SEO title too long", why: "Titles over ~60 chars get truncated in results.", severity: "info" });

  if (!desc) add({ key: "missing_description", label: "Missing meta description", why: "The meta description drives click-through from search.", severity: "warning" });
  else if (desc.length > 160) add({ key: "description_length", label: "Meta description too long", why: "Descriptions over ~160 chars get cut off.", severity: "info" });

  if (body.length < 120) add({ key: "thin_content", label: "Thin product content", why: "Short descriptions rank poorly and reduce conversions.", severity: "warning" });

  // Keyword stuffing: any single token repeated excessively in title+desc+body.
  const allTokens = tokenize(`${title} ${desc} ${body}`);
  const freq = new Map<string, number>();
  for (const t of allTokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  const stuffed = [...freq.entries()].find(([t, n]) => t.length > 3 && n >= 6 && n / allTokens.length > 0.05);
  if (stuffed) add({ key: "keyword_stuffing", label: `Possible keyword stuffing ("${stuffed[0]}")`, why: "Over-repeating a keyword risks a search penalty.", severity: "warning" });

  if (kw.length === 0) add({ key: "missing_keywords", label: "No target keywords", why: "Keywords guide internal linking and schema.", severity: "info" });

  // Structured data coverage.
  add({ key: "missing_product_schema", label: "Product schema recommended", why: "Product JSON-LD enables rich results (price, rating).", severity: "info" });
  if (!draft.hasFaq) add({ key: "missing_faq_schema", label: "Add FAQ schema", why: "FAQ structured data can win extra SERP real estate.", severity: "info" });
  add({ key: "missing_breadcrumb_schema", label: "Breadcrumb schema recommended", why: "Breadcrumb JSON-LD improves navigation in results.", severity: "info" });

  if (!draft.hasImage) add({ key: "missing_og", label: "No image for social cards", why: "OpenGraph/Twitter cards need a product image.", severity: "info" });
  else if (!draft.imageAlt?.trim()) add({ key: "missing_alt", label: "Missing image alt text", why: "Alt text aids accessibility and image SEO.", severity: "info" });

  if (!draft.hasRelated) add({ key: "internal_linking", label: "Add internal links / cross-sells", why: "Related-product links spread authority and aid discovery.", severity: "info" });

  let score = 100;
  for (const a of advisories) score -= a.severity === "critical" ? 20 : a.severity === "warning" ? 10 : 3;
  score = Math.max(0, Math.min(100, score));

  return { score, advisories };
}
