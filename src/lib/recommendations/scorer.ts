import type { Product } from "@/lib/products";
import type {
  RecommendationSignals,
  StrategyKey,
  ScoreBreakdown,
} from "./types";
import { seasonalRelevance } from "./seasonal";

/**
 * Inventory health in [-1, 1]. Healthy/fast/newly-restocked stock earns a
 * positive boost; near-sold-out is dampened (unless it doubles as urgency).
 * Pure — reads existing product fields only, never writes inventory.
 */
export function inventoryHealth(p: Product): number {
  if (!p.inStock || p.status === "out_of_stock") return -1;
  const qty = p.stockQuantity ?? 0;
  const threshold = Math.max(1, p.lowStockThreshold ?? 5);
  let h = 0;
  if (qty <= 0) h -= 0.8;
  else if (qty <= threshold) h -= 0.35; // almost sold out — soft dampen
  else if (qty >= threshold * 4) h += 0.4; // healthy depth
  else h += 0.15;
  // Newly restocked / fresh inventory.
  const restock = Date.parse(p.restockEta ?? "");
  if (Number.isFinite(restock) && Date.now() - restock < 14 * 24 * 60 * 60 * 1000) h += 0.2;
  // Fast-moving but well-stocked signals a reliable pick.
  if ((p.soldCount ?? 0) > 30 && qty > threshold * 2) h += 0.15;
  return Math.max(-1, Math.min(1, h));
}


/**
 * Deterministic scoring core. No randomness — every product earns a score from
 * measurable factors, and every strategy is just a different weighting of those
 * same factors. This keeps recommendations explainable (each item carries a
 * reason) and stable across renders.
 */

const DAY = 24 * 60 * 60 * 1000;

export function isFresh(p: Product): boolean {
  const t = Date.parse(p.createdAt ?? "");
  return Number.isFinite(t) && Date.now() - t < 30 * DAY;
}

/** Colour signal for a product (variant default → attribute fallback). */
function colourOf(p: Product): string | null {
  const c = p.defaultVariantColor ?? p.attributes?.color ?? p.attributes?.Colour ?? null;
  return c ? String(c).toLowerCase() : null;
}

export type AffinityModel = {
  category: Map<string, number>;
  brand: Map<string, number>;
  colour: Map<string, number>;
  /** Preferred price band derived from weighted signals. */
  avgPrice: number;
  maxCategory: number;
  maxBrand: number;
  maxColour: number;
  hasHistory: boolean;
};

/**
 * Build a user affinity model from behaviour signals. Views are recency-decayed
 * (newest counts most); wishlist and cart weigh progressively higher because
 * they signal stronger intent.
 */
export function buildAffinity(signals: RecommendationSignals): AffinityModel {
  const bySlug = new Map(signals.catalog.map((p) => [p.slug, p]));
  const category = new Map<string, number>();
  const brand = new Map<string, number>();
  const colour = new Map<string, number>();
  let priceSum = 0;
  let priceWeight = 0;

  const bump = (slug: string, w: number) => {
    const p = bySlug.get(slug);
    if (!p) return;
    category.set(p.category, (category.get(p.category) ?? 0) + w);
    for (const c of p.categories ?? []) category.set(c, (category.get(c) ?? 0) + w * 0.5);
    if (p.brand) brand.set(p.brand, (brand.get(p.brand) ?? 0) + w);
    const col = colourOf(p);
    if (col) colour.set(col, (colour.get(col) ?? 0) + w);
    const price = signals.priceOf(p);
    if (price > 0) {
      priceSum += price * w;
      priceWeight += w;
    }
  };

  signals.recent.forEach((s, i) => bump(s, Math.max(1, 6 - i * 0.4)));
  signals.wishlist.forEach((s) => bump(s, 4));
  signals.cart.forEach((s) => bump(s, 5));

  return {
    category,
    brand,
    colour,
    avgPrice: priceWeight ? priceSum / priceWeight : 0,
    maxCategory: Math.max(1, ...category.values()),
    maxBrand: Math.max(1, ...brand.values()),
    maxColour: Math.max(1, ...colour.values()),
    hasHistory: category.size > 0,
  };
}

/** Per-strategy factor weights. Missing keys default to sensible baselines. */
type Weights = {
  affinity: number;
  brand: number;
  colour: number;
  price: number;
  trending: number;
  bestseller: number;
  rating: number;
  popularity: number;
  freshness: number;
  discount: number;
  similarity: number;
  seedScore: number;
  location: number;
  curated: number;
  seasonal: number;
  inventory: number;
};

const BASE: Weights = {
  affinity: 50,
  brand: 8,
  colour: 5,
  price: 6,
  trending: 10,
  bestseller: 14,
  rating: 3,
  popularity: 12,
  freshness: 6,
  discount: 6,
  similarity: 40,
  seedScore: 30,
  location: 0,
  curated: 4,
  seasonal: 12,
  inventory: 8,
};

const STRATEGY_WEIGHTS: Partial<Record<StrategyKey, Partial<Weights>>> = {
  trending: { trending: 40, popularity: 20, freshness: 10, affinity: 15 },
  popular: { popularity: 40, rating: 8, bestseller: 20, affinity: 10 },
  best_sellers: { bestseller: 45, popularity: 25, rating: 6, affinity: 8 },
  top_rated: { rating: 30, popularity: 12, bestseller: 8, affinity: 8 },
  new_arrivals: { freshness: 45, trending: 12, affinity: 10 },
  similar: { similarity: 55, affinity: 15, brand: 12, colour: 8, price: 10, rating: 4 },
  because_you_viewed: { similarity: 45, affinity: 25, brand: 10, price: 8, trending: 6 },
  frequently_bought_together: { seedScore: 50, affinity: 12, bestseller: 10, rating: 4 },
  customers_also_bought: { seedScore: 45, popularity: 15, affinity: 12, rating: 4 },
  wishlist_inspired: { affinity: 40, discount: 14, rating: 8, freshness: 8, brand: 10 },
  continue_shopping: { affinity: 20, discount: 12, freshness: 6, trending: 8 },
  popular_near_you: { location: 40, popularity: 25, bestseller: 12, rating: 6 },
  complete_the_look: { affinity: 12, curated: 14, rating: 10, popularity: 16, colour: 10, price: 8, bestseller: 10 },
  compatible_accessories: { affinity: 10, curated: 10, rating: 8, popularity: 20, bestseller: 14, price: 6, brand: 6 },
  trending_in_category: { trending: 42, popularity: 24, bestseller: 12, rating: 6, freshness: 8 },
  recently_viewed_alternatives: { similarity: 48, brand: 10, price: 12, rating: 6, popularity: 8 },
  upgrade: { similarity: 40, rating: 18, bestseller: 14, popularity: 12, brand: 10 },
  budget_alternative: { similarity: 42, price: 16, rating: 12, popularity: 10, discount: 10 },
  personalized: {},
  cold_start: { popularity: 25, rating: 16, bestseller: 12, trending: 10, freshness: 6 },
};

function weightsFor(strategy: StrategyKey): Weights {
  return { ...BASE, ...(STRATEGY_WEIGHTS[strategy] ?? {}) };
}

function similarity(a: Product, b: Product, priceOf: (p: Product) => number): number {
  let s = 0;
  if (a.category === b.category) s += 4;
  const overlap = (a.categories ?? []).filter((c) => (b.categories ?? []).includes(c)).length;
  s += overlap * 1.5;
  if (a.productType && a.productType === b.productType) s += 2;
  if (a.brand && a.brand === b.brand) s += 3;
  if (colourOf(a) && colourOf(a) === colourOf(b)) s += 1.5;
  const pa = priceOf(a);
  const pb = priceOf(b);
  if (pa > 0 && pb > 0) {
    const gap = Math.abs(pa - pb) / Math.max(pa, pb);
    s += Math.max(0, 3 - gap * 4);
  }
  s += Math.max(0, 2 - Math.abs(a.rating - b.rating));
  const tagOverlap = (a.collections ?? []).filter((c) => (b.collections ?? []).includes(c)).length;
  s += tagOverlap;
  return s;
}

/** Score one candidate. Returns the score, dominant reason and a breakdown. */
export function scoreProduct(
  p: Product,
  strategy: StrategyKey,
  model: AffinityModel,
  signals: RecommendationSignals,
  seedScores?: Map<string, number>,
  seed?: Product,
): { score: number; reason: string; breakdown: ScoreBreakdown } {
  const w = weightsFor(strategy);
  const reasons: Array<[string, number]> = [];
  const bd: ScoreBreakdown = {
    behaviour: 0,
    similarity: 0,
    trend: 0,
    popularity: 0,
    personalization: 0,
    inventory: 0,
    freshness: 0,
    seasonal: 0,
    businessRule: 0,
    seasonLabel: null,
  };
  const add = (label: string, value: number, bucket?: keyof ScoreBreakdown) => {
    if (value > 0) reasons.push([label, value]);
    if (bucket && typeof bd[bucket] === "number") {
      (bd[bucket] as number) += value;
    }
    return value;
  };

  let score = 0;
  const affinity = (model.category.get(p.category) ?? 0) / model.maxCategory; // 0..1
  score += add(`matches ${p.category}`, affinity * w.affinity, "personalization");

  if (p.brand) {
    const b = (model.brand.get(p.brand) ?? 0) / model.maxBrand;
    score += add(`brand ${p.brand}`, b * w.brand, "personalization");
  }
  const col = colourOf(p);
  if (col) {
    const c = (model.colour.get(col) ?? 0) / model.maxColour;
    score += add(`colour ${col}`, c * w.colour, "personalization");
  }
  if (model.avgPrice > 0) {
    const gap = Math.abs(signals.priceOf(p) - model.avgPrice) / model.avgPrice;
    score += add("in your price range", Math.max(0, w.price - gap * w.price), "personalization");
  }

  if (p.trending) score += add("trending", w.trending * (0.6 + affinity * 0.4), "trend");
  if (p.bestseller) score += add("best seller", w.bestseller * (0.6 + affinity * 0.4), "popularity");
  score += add("well rated", (p.rating ?? 0) * w.rating * 0.2, "popularity");
  score += add("popular", Math.min((p.soldCount ?? 0) / 50, 12) * (w.popularity / 12) * (0.4 + affinity), "popularity");
  if (isFresh(p)) score += add("new arrival", w.freshness * (0.6 + affinity * 0.4), "freshness");
  const disc = p.discount ?? 0;
  if (disc > 0) score += add(`${disc}% off`, Math.min(disc / 10, 6) * (w.discount / 6), "businessRule");

  if (seed) score += add("similar item", similarity(p, seed, signals.priceOf) * (w.similarity / 10), "similarity");

  const seedScore = seedScores?.get(p.slug);
  if (seedScore && seedScore > 0) {
    score += add("bought together", Math.min(seedScore, 20) * (w.seedScore / 20), "behaviour");
  }

  // Seasonal intelligence — boost products that fit the active season(s).
  const season = seasonalRelevance(p);
  if (season.score > 0) {
    bd.seasonLabel = season.label;
    score += add(`${season.label} pick`, season.score * w.seasonal, "seasonal");
  }

  // Inventory intelligence — reward healthy/fast/restocked, dampen near-sold-out.
  const health = inventoryHealth(p);
  const invContribution = health * w.inventory;
  score += invContribution;
  bd.inventory += invContribution;
  if (health > 0.3) reasons.push(["in stock & shipping fast", invContribution]);

  if (p.recommended) score += add("recommended", w.curated, "businessRule");
  if (p.staffPick || p.editorsChoice) score += add("staff pick", w.curated * 0.75, "businessRule");
  if (p.featured) score += add("featured", w.curated * 0.5, "businessRule");
  if (typeof p.priorityScore === "number") {
    const pv = (p.priorityScore / 100) * 3;
    score += pv;
    bd.businessRule += pv;
  }

  // Popularity fallback keeps cold-start / thin-history rails full.
  if (!model.hasHistory) {
    const fb = (p.rating ?? 0) * 2 + Math.min((p.soldCount ?? 0) / 40, 15);
    score += fb;
    bd.popularity += fb;
  }

  // Deterministic tiebreak so equal scores keep a stable order.
  const tiebreak = (p.id ?? p.slug).charCodeAt(0) / 1000;

  const topReason = reasons.sort((a, b) => b[1] - a[1])[0]?.[0] ?? "popular pick";
  return { score: score + tiebreak, reason: topReason, breakdown: bd };
}

