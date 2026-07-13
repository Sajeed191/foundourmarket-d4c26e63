import type { Product } from "@/lib/products";
import type { MarketRegion } from "@/lib/region.functions";

/**
 * Marketplace Intelligence — shared types for the centralized recommendation
 * engine. Every discovery surface (home, PDP, category, wishlist, cart, quick
 * view) consumes this one engine so scoring logic is never scattered across
 * components.
 */

/** Where a recommendation ultimately came from (for analytics + debug mode). */
export type RecommendationSource =
  | "personalized"
  | "trending"
  | "popular"
  | "best_sellers"
  | "top_rated"
  | "new_arrivals"
  | "similar"
  | "because_you_viewed"
  | "frequently_bought_together"
  | "customers_also_bought"
  | "wishlist_inspired"
  | "continue_shopping"
  | "popular_near_you"
  | "complete_the_look"
  | "compatible_accessories"
  | "trending_in_category"
  | "recently_viewed_alternatives"
  | "upgrade"
  | "budget_alternative"
  | "cold_start";

/** A recommendation strategy = a preset weighting of the scoring factors. */
export type StrategyKey = RecommendationSource;

/** A single scored recommendation returned by the engine. */
export type RecommendationItem = {
  product: Product;
  /** Raw engine score (higher = better). */
  score: number;
  /** Normalized 0–1 confidence relative to the strongest item in the set. */
  confidence: number;
  /** Human-readable reason (debug mode / analytics only, never shown to users). */
  reason: string;
  /** Where this recommendation originated. */
  source: RecommendationSource;
  /** Structured, explainable per-factor breakdown (debug / analytics only). */
  breakdown?: ScoreBreakdown;
};

/** Explainable AI — per-factor contribution to a recommendation's score. */
export type ScoreBreakdown = {
  behaviour: number;
  similarity: number;
  trend: number;
  popularity: number;
  personalization: number;
  inventory: number;
  freshness: number;
  seasonal: number;
  businessRule: number;
  seasonLabel?: string | null;
};

/** Coarse location signal — never personally identifying. */
export type LocationSignal = {
  country?: string | null;
  state?: string | null;
  city?: string | null;
};

/** All behaviour + context signals fed into the engine. */
export type RecommendationSignals = {
  catalog: Product[];
  /** Recently viewed slugs, newest first. */
  recent: string[];
  wishlist: string[];
  cart: string[];
  purchased: Set<string>;
  market: MarketRegion | null;
  location: LocationSignal;
  /** Region-aware price accessor (admin-defined, no conversion). */
  priceOf: (p: Product) => number;
};

/** Admin merchandising overrides applied without permanently altering scoring. */
export type RecommendationBoosts = {
  /** Slugs pinned to the top, in order. */
  pinnedSlugs?: string[];
  /** Slugs never recommended in this context. */
  excludedSlugs?: string[];
};

export type EngineConfig = {
  strategy: StrategyKey;
  limit: number;
  /** Slugs to hard-exclude (current product, cart contents, already shown, …). */
  exclude?: string[];
  /** Seed product for similarity strategies (similar / because-you-viewed). */
  seed?: Product;
  /**
   * Externally-resolved base scores keyed by slug (e.g. trending_products
   * trend_score, get_fbt co_count). Blended into the final score.
   */
  seedScores?: Map<string, number>;
  /** Restrict candidate set to these slugs (e.g. FBT / also-bought results). */
  restrictTo?: string[];
  /** Only candidates whose region price is >= this value. */
  priceMin?: number;
  /** Only candidates whose region price is <= this value. */
  priceMax?: number;
  /** Restrict candidates to the seed's category (trending-in-category, etc.). */
  sameCategoryAsSeed?: boolean;
  /** Restrict candidates to a DIFFERENT category than the seed (complementary). */
  differentCategoryFromSeed?: boolean;
  /** Allow out-of-stock products (restock surfaces). Default false. */
  includeOutOfStock?: boolean;
  /** Apply the diversity pass (brand / price / colour spread). Default true. */
  diversity?: boolean;
  /** Deterministic rotation seed so repeat visits vary without randomness. */
  rotationSeed?: number;
  /** Admin overrides. */
  boosts?: RecommendationBoosts;
  /**
   * Per-slug additive score deltas from admin business rules (boost/reduce).
   * Applied after scoring, before the diversity/sort pass. Positive promotes,
   * negative de-emphasizes. Purely additive — never rewrites the scorer.
   */
  ruleAdjust?: Map<string, number>;
};
