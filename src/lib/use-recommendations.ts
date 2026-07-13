import { useRecommendationRail } from "@/lib/recommendations";
import { type Product } from "@/lib/products";

/**
 * Premium recommendation engine — now a thin adapter over the centralized
 * Marketplace Intelligence engine (`@/lib/recommendations`). Kept for backward
 * compatibility: existing callers keep the same `{ products, loading }` shape,
 * while all scoring lives in one place. The "personalized" strategy blends
 * behaviour affinity (views → wishlist → cart → purchases) with popularity,
 * trending, rating, freshness and discount, and falls back to popularity when
 * history is thin — never random, never repetitive.
 *
 * Never recommends: purchased items, cart items, duplicates, out-of-stock,
 * hidden/inactive products, or products flagged hideFromRecommendations.
 */
export function useRecommendations(opts: { limit?: number; excludeSlug?: string } = {}) {
  const { limit = 12, excludeSlug } = opts;
  const { products, loading, personalized } = useRecommendationRail({
    strategy: personalizedStrategy(),
    limit,
    exclude: excludeSlug ? [excludeSlug] : undefined,
  });
  return { products: products as Product[], loading, personalized };
}

/** The default homepage/PDP rail uses the personalized strategy; the engine
 * itself degrades to a cold-start popularity blend when history is empty. */
function personalizedStrategy() {
  return "personalized" as const;
}
