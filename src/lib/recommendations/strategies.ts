import type { StrategyKey } from "./types";

/**
 * Customer Journey Intelligence — maps where the shopper is in the journey to
 * the recommendation strategies that convert best there. Surfaces read this
 * instead of hardcoding strategy lists, so the "right" recommendation type
 * follows the shopper: discovery on home, alternatives on search, complementary
 * on the PDP, cross-sell in the cart, impulse at checkout, replenishment after
 * purchase.
 */

export type JourneyStage =
  | "home"
  | "search"
  | "product"
  | "cart"
  | "checkout"
  | "post_purchase"
  | "wishlist";

export type JourneyRail = {
  strategy: StrategyKey;
  /** Suggested rail size for this stage/strategy. */
  limit: number;
  /** For complementary/cross-sell rails, prefer a different category to the seed. */
  differentCategoryFromSeed?: boolean;
  /** For checkout impulse buys, cap the price so add-ons stay small. */
  impulse?: boolean;
};

const JOURNEY: Record<JourneyStage, JourneyRail[]> = {
  home: [
    { strategy: "personalized", limit: 12 },
    { strategy: "trending", limit: 12 },
    { strategy: "new_arrivals", limit: 10 },
    { strategy: "best_sellers", limit: 10 },
  ],
  search: [
    { strategy: "recently_viewed_alternatives", limit: 10 },
    { strategy: "similar", limit: 10 },
    { strategy: "trending_in_category", limit: 10 },
  ],
  product: [
    { strategy: "frequently_bought_together", limit: 6 },
    { strategy: "complete_the_look", limit: 8, differentCategoryFromSeed: true },
    { strategy: "customers_also_bought", limit: 10 },
    { strategy: "similar", limit: 10 },
  ],
  cart: [
    { strategy: "frequently_bought_together", limit: 6 },
    { strategy: "compatible_accessories", limit: 8, differentCategoryFromSeed: true },
    { strategy: "customers_also_bought", limit: 8 },
  ],
  checkout: [
    { strategy: "compatible_accessories", limit: 6, differentCategoryFromSeed: true, impulse: true },
  ],
  post_purchase: [
    { strategy: "compatible_accessories", limit: 8, differentCategoryFromSeed: true },
    { strategy: "continue_shopping", limit: 10 },
  ],
  wishlist: [
    { strategy: "wishlist_inspired", limit: 12 },
    { strategy: "similar", limit: 10 },
  ],
};

/** Ordered rail configs for a journey stage. */
export function journeyRails(stage: JourneyStage): JourneyRail[] {
  return JOURNEY[stage] ?? [];
}

/** The single most relevant strategy for a stage (first in the stack). */
export function primaryStrategy(stage: JourneyStage): StrategyKey {
  return (JOURNEY[stage]?.[0]?.strategy ?? "personalized") as StrategyKey;
}
