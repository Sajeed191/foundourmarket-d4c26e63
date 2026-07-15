/**
 * AI Marketplace Search — natural-language query parser.
 *
 * Track B / Phase 1. Presentation-layer intelligence built entirely on top of
 * the frozen Platform v1.0. This module never introduces a new scoring or
 * ranking contract: it converts free-text like
 *   "black leather office backpack under ₹3000"
 * into the existing `Filters` shape used by `/search`, plus a short
 * human-readable list of what it understood ("Under ₹3000 · Black · Leather").
 *
 * Rules:
 *   • Composition-first — outputs only existing search params.
 *   • Explainable — always returns `understood[]` chips so the UI can show
 *     the user what the AI extracted before running the search.
 *   • Fast + local — pure string parsing, no network, safe on every keystroke.
 *   • Typo-tolerant — small Levenshtein for brand / category tokens (≥4 chars).
 */

import type { Filters } from "@/lib/search-filters";

export type AiSearchResult = {
  /** Filters to apply on /search. */
  filters: Filters;
  /** Residual free-text keywords (what wasn't extracted into filters). */
  query: string;
  /** Human-readable list of what was extracted. */
  understood: string[];
  /** True when the parser found any structured intent. */
  hasIntent: boolean;
};

export type AiSearchContext = {
  /** Known brand names (lowercased) from the current catalog. */
  brands: string[];
  /** Known category { slug, name } pairs from the current catalog. */
  categories: Array<{ slug: string; name: string }>;
};

// Basic English colour vocabulary — matches product variant colours.
const COLORS = [
  "black", "white", "grey", "gray", "silver", "gold", "beige", "brown", "tan",
  "red", "maroon", "pink", "orange", "yellow", "green", "olive", "teal",
  "blue", "navy", "purple", "violet", "cream", "ivory",
];

// Material / feature descriptors kept as-is inside the residual query.
const MATERIALS = [
  "leather", "cotton", "linen", "silk", "wool", "denim", "canvas",
  "metal", "wood", "wooden", "glass", "ceramic", "plastic",
];

const STOP = new Set([
  "a", "an", "the", "for", "of", "with", "in", "on", "at", "by",
  "and", "or", "to", "from", "me", "my", "please", "some", "any",
  "show", "find", "get", "give", "want", "need", "looking", "buy",
]);

// Levenshtein for short-token typo correction.
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function fuzzyMatch(token: string, pool: string[]): string | null {
  if (token.length < 4) return pool.includes(token) ? token : null;
  let best: { name: string; d: number } | null = null;
  for (const p of pool) {
    const d = editDistance(token, p);
    if (d <= 1 && (!best || d < best.d)) best = { name: p, d };
  }
  return best?.name ?? null;
}

// Extract price band from phrases like "under 3000", "below ₹500",
// "less than 999", "between 100 and 500", "100-500", "under 3k".
function extractPrice(input: string): { min?: number; max?: number; label?: string; cleaned: string } {
  let s = input;
  let min: number | undefined;
  let max: number | undefined;
  let label: string | undefined;

  const num = (raw: string): number => {
    const t = raw.replace(/[₹$,\s]/g, "").toLowerCase();
    if (t.endsWith("k")) return Math.round(parseFloat(t) * 1000);
    return parseFloat(t);
  };

  const between = s.match(/\bbetween\s+([₹$]?\s?\d[\d,.]*k?)\s+(?:and|to|-)\s+([₹$]?\s?\d[\d,.]*k?)/i);
  if (between) {
    min = num(between[1]);
    max = num(between[2]);
    label = `₹${min}–₹${max}`;
    s = s.replace(between[0], " ");
  }

  const under = s.match(/\b(?:under|below|less\s+than|upto|up\s+to|<=?)\s+([₹$]?\s?\d[\d,.]*k?)/i);
  if (under) {
    max = num(under[1]);
    label = label ?? `Under ₹${max}`;
    s = s.replace(under[0], " ");
  }

  const over = s.match(/\b(?:over|above|more\s+than|>=?)\s+([₹$]?\s?\d[\d,.]*k?)/i);
  if (over) {
    min = num(over[1]);
    label = label ?? `Over ₹${min}`;
    s = s.replace(over[0], " ");
  }

  // Bare "100-500" range.
  const range = s.match(/([₹$]?\s?\d[\d,.]*k?)\s*[-–]\s*([₹$]?\s?\d[\d,.]*k?)/);
  if (range && min == null && max == null) {
    min = num(range[1]);
    max = num(range[2]);
    label = `₹${min}–₹${max}`;
    s = s.replace(range[0], " ");
  }

  return { min, max, label, cleaned: s };
}

/**
 * Parse a free-text query into structured search filters.
 * Safe to call on every keystroke; returns unchanged input when nothing
 * structured is detected.
 */
export function parseAiQuery(raw: string, ctx: AiSearchContext): AiSearchResult {
  const filters: Filters = {};
  const understood: string[] = [];
  const input = (raw ?? "").trim().toLowerCase();

  if (!input) {
    return { filters, query: "", understood, hasIntent: false };
  }

  // 1) Price band.
  const price = extractPrice(input);
  if (price.min != null) filters.min = price.min;
  if (price.max != null) filters.max = price.max;
  if (price.label) understood.push(price.label);

  // 2) Sale / discount intent.
  let s = price.cleaned;
  if (/\b(on\s+sale|discount(ed)?|deals?|offer)\b/.test(s)) {
    filters.sale = "1";
    understood.push("On sale");
    s = s.replace(/\b(on\s+sale|discounted|discount|deals?|offer)\b/g, " ");
  }
  if (/\bfree\s+shipping\b/.test(s)) {
    filters.free = "1";
    understood.push("Free shipping");
    s = s.replace(/\bfree\s+shipping\b/g, " ");
  }
  if (/\b(in\s+stock|available)\b/.test(s)) {
    filters.stock = "in";
    understood.push("In stock");
    s = s.replace(/\b(in\s+stock|available)\b/g, " ");
  }
  const rating = s.match(/\b([1-5])\s*(?:\+|and\s+up|stars?\+?)\b/);
  if (rating) {
    filters.rating = parseInt(rating[1], 10);
    understood.push(`${rating[1]}★ & up`);
    s = s.replace(rating[0], " ");
  }

  // 3) Tokenise the remainder for colour / brand / category matching.
  const brandsPool = ctx.brands.map((b) => b.toLowerCase());
  const catPool = ctx.categories.map((c) => c.name.toLowerCase());
  const catBySlugLower = new Map(ctx.categories.map((c) => [c.name.toLowerCase(), c.slug]));

  const tokens = s
    .split(/[^a-z0-9₹$]+/i)
    .map((t) => t.trim())
    .filter((t) => t && !STOP.has(t));

  const kept: string[] = [];
  const takenColors = new Set<string>();
  const takenBrands = new Set<string>();
  let matchedCategory: { slug: string; name: string } | null = null;

  for (const tok of tokens) {
    if (COLORS.includes(tok) && !takenColors.has(tok)) {
      takenColors.add(tok);
      continue;
    }
    const b = fuzzyMatch(tok, brandsPool);
    if (b && !takenBrands.has(b)) {
      takenBrands.add(b);
      continue;
    }
    const c = fuzzyMatch(tok, catPool);
    if (c && !matchedCategory) {
      const slug = catBySlugLower.get(c);
      const original = ctx.categories.find((x) => x.slug === slug);
      if (original) matchedCategory = original;
      continue;
    }
    kept.push(tok);
  }

  if (takenColors.size) {
    const cap = [...takenColors].map(cap1);
    filters.color = cap.join(",");
    understood.push(cap.join(" / "));
  }
  if (takenBrands.size) {
    const cap = [...takenBrands].map(cap1);
    filters.brand = cap.join(",");
    understood.push(cap.join(" / "));
  }
  if (matchedCategory) {
    filters.cat = matchedCategory.slug;
    understood.push(matchedCategory.name);
  }

  // Preserve material words in the residual keyword string — they're search
  // signal, not filters — and add them to the explanation chips.
  const materialsSeen: string[] = [];
  for (const m of MATERIALS) {
    if (kept.includes(m)) materialsSeen.push(m);
  }
  if (materialsSeen.length) understood.push(materialsSeen.map(cap1).join(" / "));

  const query = kept.join(" ").replace(/\s+/g, " ").trim();
  const hasIntent = understood.length > 0;

  return { filters, query, understood, hasIntent };
}

function cap1(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Merge parsed filters into a `/search` navigation-search object.
 * Only defined values are copied so we never overwrite existing params
 * with undefined.
 */
export function toSearchParams(
  q: string,
  filters: Filters,
): Record<string, string | number | undefined> {
  const out: Record<string, string | number | undefined> = { q };
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== "") out[k] = v as string | number;
  }
  return out;
}
