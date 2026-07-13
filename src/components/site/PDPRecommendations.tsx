import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRegion } from "@/lib/region";
import { useRecommendationRail } from "@/lib/recommendations/context";
import { priorityMultiplier } from "@/lib/recommendations/performance";
import { getGraphEdgeSets } from "@/lib/recommendations/graph.functions";
import { RecommendationRailSection } from "./RecommendationRailSection";
import type { RecommendationItem, RecommendationSource } from "@/lib/recommendations/types";
import type { Product } from "@/lib/products";

/**
 * Intelligent PDP recommendation stack.
 *
 * Every rail is produced by the centralized recommendation engine (scored,
 * confidence-ranked, reason-tagged, diversity-passed, purchase/cart/OOS
 * filtered). Sections render in a smart priority order that is continuously
 * nudged by the self-improving performance tracker, and any rail without
 * enough quality items is hidden rather than shown weak.
 */

const MIN_ITEMS = 3;

type SectionSpec = {
  source: RecommendationSource;
  title: string;
  subtitle?: string;
  eyebrow: string;
  basePriority: number;
  items: RecommendationItem[];
};

export function PDPRecommendations({
  product,
  alsoBoughtSlugs = [],
  alsoBoughtScores,
}: {
  product: Product;
  /** Slugs from real co-purchase / co-view history (customers also bought). */
  alsoBoughtSlugs?: string[];
  /** Optional co-count scores keyed by slug to blend into the ranking. */
  alsoBoughtScores?: Map<string, number>;
}) {
  const { priceOf } = useRegion();
  const seedPrice = priceOf(product);

  // Each rail is a fixed hook call (stable order). The engine memoizes, so idle
  // rails cost almost nothing.
  const alsoBought = useRecommendationRail({
    strategy: "customers_also_bought",
    seed: product,
    restrictTo: alsoBoughtSlugs.length ? alsoBoughtSlugs : undefined,
    seedScores: alsoBoughtScores,
    limit: 10,
  });

  const similar = useRecommendationRail({
    strategy: "similar",
    seed: product,
    limit: 10,
  });

  const completeLook = useRecommendationRail({
    strategy: "complete_the_look",
    seed: product,
    differentCategoryFromSeed: true,
    limit: 10,
  });

  const trendingCat = useRecommendationRail({
    strategy: "trending_in_category",
    seed: product,
    sameCategoryAsSeed: true,
    limit: 10,
  });

  const alternatives = useRecommendationRail({
    strategy: "recently_viewed_alternatives",
    seed: product,
    limit: 10,
  });

  const budget = useRecommendationRail({
    strategy: "budget_alternative",
    seed: product,
    priceMax: seedPrice > 0 ? seedPrice * 0.9 : undefined,
    limit: 10,
  });

  const upgrade = useRecommendationRail({
    strategy: "upgrade",
    seed: product,
    priceMin: seedPrice > 0 ? seedPrice * 1.1 : undefined,
    priceMax: seedPrice > 0 ? seedPrice * 2.2 : undefined,
    limit: 10,
  });

  const isFashion =
    /fashion|apparel|clothing|shoe|footwear|wear|accessor/i.test(product.category ?? "");

  const sections = useMemo<SectionSpec[]>(() => {
    const specs: SectionSpec[] = [
      {
        source: "customers_also_bought",
        title: "Customers also bought",
        subtitle: "Popular pairings from real shopper orders",
        eyebrow: "Shoppers like you",
        basePriority: 90,
        items: alsoBought.items,
      },
      {
        source: "similar",
        title: "Similar products",
        subtitle: "Matched on brand, price, rating and features",
        eyebrow: "Compare",
        basePriority: 80,
        items: similar.items,
      },
      {
        source: "complete_the_look",
        title: isFashion ? "Complete the look" : "Pairs well with this",
        subtitle: isFashion
          ? "Curated pieces that go together"
          : "Accessories and add-ons for this product",
        eyebrow: isFashion ? "Style it" : "Add-ons",
        basePriority: 70,
        items: completeLook.items,
      },
      {
        source: "trending_in_category",
        title: `Trending in ${product.category ?? "this category"}`,
        subtitle: "What's popular right now",
        eyebrow: "Trending",
        basePriority: 60,
        items: trendingCat.items,
      },
      {
        source: "recently_viewed_alternatives",
        title: "Alternatives to consider",
        subtitle: "Comparable options based on what you've viewed",
        eyebrow: "You might prefer",
        basePriority: 50,
        items: alternatives.items,
      },
      {
        source: "budget_alternative",
        title: "Budget-friendly alternatives",
        subtitle: "Similar products for less",
        eyebrow: "Save more",
        basePriority: 40,
        items: budget.items,
      },
      {
        source: "upgrade",
        title: "Upgrade picks",
        subtitle: "Step up for better specs and features",
        eyebrow: "Level up",
        basePriority: 30,
        items: upgrade.items,
      },
    ];

    return specs
      .filter((s) => s.items.length >= MIN_ITEMS)
      .map((s) => ({ ...s, _score: s.basePriority * priorityMultiplier(s.source) }))
      .sort((a, b) => (b as any)._score - (a as any)._score);
  }, [
    alsoBought.items,
    similar.items,
    completeLook.items,
    trendingCat.items,
    alternatives.items,
    budget.items,
    upgrade.items,
    isFashion,
    product.category,
  ]);

  // De-duplicate: a product shown in an earlier rail never repeats below.
  const seen = new Set<string>([product.slug]);
  const rails = sections
    .map((s) => {
      const items = s.items.filter((it) => !seen.has(it.product.slug)).slice(0, 8);
      items.forEach((it) => seen.add(it.product.slug));
      return { ...s, items };
    })
    .filter((s) => s.items.length >= MIN_ITEMS);

  if (rails.length === 0) return null;

  return (
    <div data-pdp-recommendations>
      {rails.map((s) => (
        <RecommendationRailSection
          key={s.source}
          source={s.source}
          title={s.title}
          subtitle={s.subtitle}
          eyebrow={s.eyebrow}
          items={s.items}
        />
      ))}
    </div>
  );
}
