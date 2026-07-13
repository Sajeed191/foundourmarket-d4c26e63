import type { Product } from "@/lib/products";
import { isProductVisible } from "@/lib/product-availability";
import type {
  EngineConfig,
  RecommendationItem,
  RecommendationSignals,
} from "./types";
import { buildAffinity, scoreProduct } from "./scorer";
import { diversify } from "./diversity";

/**
 * RecommendationEngine — the single, centralized entry point for every
 * discovery surface. Pure and deterministic: same signals + config → same
 * ordered result. No component computes its own recommendations.
 */

/** Deterministic rotation: rotate the tail of the list by a stable offset so
 * repeat visits vary without ever being random or losing the strongest picks. */
function rotate<T>(items: T[], seed: number, keepTop: number): T[] {
  if (items.length <= keepTop + 1 || !seed) return items;
  const head = items.slice(0, keepTop);
  const tail = items.slice(keepTop);
  const offset = Math.abs(seed) % tail.length;
  return [...head, ...tail.slice(offset), ...tail.slice(0, offset)];
}

export function runEngine(
  signals: RecommendationSignals,
  config: EngineConfig,
): RecommendationItem[] {
  const {
    strategy,
    limit,
    exclude = [],
    seed,
    seedScores,
    restrictTo,
    priceMin,
    priceMax,
    sameCategoryAsSeed,
    differentCategoryFromSeed,
    includeOutOfStock = false,
    diversity = true,
    rotationSeed = 0,
    boosts,
  } = config;

  const excludeSet = new Set<string>([
    ...exclude,
    ...signals.purchased,
    ...signals.cart,
    ...(boosts?.excludedSlugs ?? []),
  ]);
  if (seed) excludeSet.add(seed.slug);

  const restrictSet = restrictTo ? new Set(restrictTo) : null;
  const model = buildAffinity(signals);

  const candidates = signals.catalog.filter((p) => {
    if (excludeSet.has(p.slug)) return false;
    if (restrictSet && !restrictSet.has(p.slug)) return false;
    if (!isProductVisible(p, signals.market)) return false;
    if (p.hideFromRecommendations) return false;
    if (!includeOutOfStock && (!p.inStock || p.status === "out_of_stock")) return false;
    if (seed && sameCategoryAsSeed && p.category !== seed.category) return false;
    if (seed && differentCategoryFromSeed && p.category === seed.category) return false;
    if (priceMin != null || priceMax != null) {
      const price = signals.priceOf(p);
      if (price <= 0) return false;
      if (priceMin != null && price < priceMin) return false;
      if (priceMax != null && price > priceMax) return false;
    }
    return true;
  });

  const scored: RecommendationItem[] = candidates.map((p) => {
    const { score, reason } = scoreProduct(p, strategy, model, signals, seedScores, seed);
    return { product: p, score, confidence: 0, reason, source: strategy };
  });

  scored.sort((a, b) => b.score - a.score);

  // Normalize confidence relative to the strongest candidate in this set.
  const top = scored[0]?.score ?? 1;
  for (const it of scored) it.confidence = top > 0 ? Math.max(0, Math.min(1, it.score / top)) : 0;

  let ordered = diversity ? diversify(scored, signals.priceOf) : scored;
  ordered = rotate(ordered, rotationSeed, Math.min(3, Math.ceil(limit / 3)));

  // Pinned admin boosts jump to the front, in order, without re-scoring.
  if (boosts?.pinnedSlugs?.length) {
    const pinned = new Set(boosts.pinnedSlugs);
    const bySlug = new Map(ordered.map((it) => [it.product.slug, it]));
    const front: RecommendationItem[] = [];
    for (const slug of boosts.pinnedSlugs) {
      const it = bySlug.get(slug);
      if (it) front.push({ ...it, reason: "featured by store", confidence: 1 });
    }
    ordered = [...front, ...ordered.filter((it) => !pinned.has(it.product.slug))];
  }

  return ordered.slice(0, limit);
}

/** Convenience: return just the products (for components that only need cards). */
export function runEngineProducts(
  signals: RecommendationSignals,
  config: EngineConfig,
): Product[] {
  return runEngine(signals, config).map((it) => it.product);
}
