import type { RecommendationItem } from "./types";
import type { Product } from "@/lib/products";

/**
 * Diversity pass — prevents a rail from showing ten near-identical products.
 * Greedily reorders a scored list so consecutive items vary by brand, price
 * band and colour, while never promoting a materially weaker item over a much
 * stronger one (a soft penalty, not a hard reshuffle).
 */

function priceBand(price: number): string {
  if (price <= 0) return "na";
  if (price < 1000) return "b0";
  if (price < 5000) return "b1";
  if (price < 15000) return "b2";
  if (price < 50000) return "b3";
  return "b4";
}

function colourOf(p: Product): string {
  return (p.defaultVariantColor ?? p.attributes?.color ?? "").toLowerCase();
}

export function diversify(
  items: RecommendationItem[],
  priceOf: (p: Product) => number,
): RecommendationItem[] {
  if (items.length <= 2) return items;

  const out: RecommendationItem[] = [];
  const pool = [...items];
  const brandSeen = new Map<string, number>();
  const bandSeen = new Map<string, number>();
  const colourSeen = new Map<string, number>();

  // Guarantee no more than this many of the same brand in a row.
  const MAX_BRAND_RUN = 2;
  let lastBrand = "";
  let runLength = 0;

  while (pool.length) {
    let bestIdx = 0;
    let bestAdjusted = -Infinity;
    // Only look ahead a small window so the strongest items still lead.
    const window = Math.min(pool.length, 6);
    for (let i = 0; i < window; i++) {
      const it = pool[i];
      const p = it.product;
      const brand = p.brand ?? "";
      const band = priceBand(priceOf(p));
      const colour = colourOf(p);
      // Hard anti-fatigue: once a brand run hits the cap, any further same-brand
      // candidate is pushed to the back of the window unless nothing else fits.
      const runBlock =
        brand === lastBrand && runLength >= MAX_BRAND_RUN ? 1000 : 0;
      const penalty =
        (brandSeen.get(brand) ?? 0) * 4 +
        (bandSeen.get(band) ?? 0) * 1.5 +
        (colourSeen.get(colour) ?? 0) * 1 +
        runBlock;
      // Rank inside the window is a proxy for score gap (pool is sorted).
      const adjusted = -i * 0.5 - penalty;
      if (adjusted > bestAdjusted) {
        bestAdjusted = adjusted;
        bestIdx = i;
      }
    }
    const [chosen] = pool.splice(bestIdx, 1);
    out.push(chosen);
    const p = chosen.product;
    const chosenBrand = p.brand ?? "";
    runLength = chosenBrand === lastBrand ? runLength + 1 : 1;
    lastBrand = chosenBrand;
    brandSeen.set(chosenBrand, (brandSeen.get(chosenBrand) ?? 0) + 1);
    bandSeen.set(priceBand(priceOf(p)), (bandSeen.get(priceBand(priceOf(p))) ?? 0) + 1);
    colourSeen.set(colourOf(p), (colourSeen.get(colourOf(p)) ?? 0) + 1);
  }


  return out;
}
