import type { Product } from "./products";

export type BadgeSettings = {
  trendingEnabled: boolean;
  trendingViewsMin: number;
  trendingWishlistMin: number;
  bestsellerEnabled: boolean;
  bestsellerSalesMin: number;
  fastSellingEnabled: boolean;
  fastSellingPerDayMin: number;
  limitedStockEnabled: boolean;
  limitedStockMax: number;
  newArrivalEnabled: boolean;
  newArrivalDays: number;
  hotDealEnabled: boolean;
  hotDealDiscountMin: number;
  maxBadges: number;
};

export const DEFAULT_BADGE_SETTINGS: BadgeSettings = {
  trendingEnabled: true,
  trendingViewsMin: 200,
  trendingWishlistMin: 15,
  bestsellerEnabled: true,
  bestsellerSalesMin: 50,
  fastSellingEnabled: true,
  fastSellingPerDayMin: 3,
  limitedStockEnabled: true,
  limitedStockMax: 5,
  newArrivalEnabled: true,
  newArrivalDays: 14,
  hotDealEnabled: true,
  hotDealDiscountMin: 20,
  maxBadges: 2,
};

export type BadgeKey =
  | "bestseller"
  | "trending"
  | "fast_selling"
  | "hot_deal"
  | "limited_stock"
  | "new";

export type Badge = {
  key: BadgeKey;
  label: string;
  emoji: string;
  /** tailwind classes for the badge pill */
  className: string;
};

const BADGE_STYLES: Record<BadgeKey, Omit<Badge, "key">> = {
  bestseller: { label: "Bestseller", emoji: "⭐", className: "bg-amber-400/95 text-black" },
  trending: { label: "Trending", emoji: "🔥", className: "bg-accent text-accent-foreground shadow-[var(--shadow-ember)]" },
  fast_selling: { label: "Fast Selling", emoji: "⚡", className: "bg-fuchsia-500/90 text-white" },
  hot_deal: { label: "Hot Deal", emoji: "🔥", className: "bg-red-500/90 text-white" },
  limited_stock: { label: "Limited Stock", emoji: "⚠️", className: "bg-orange-600/90 text-white" },
  new: { label: "New", emoji: "🆕", className: "bg-emerald-500/90 text-white" },
};

// Priority order: highest-signal badges first.
const PRIORITY: BadgeKey[] = [
  "bestseller",
  "trending",
  "fast_selling",
  "hot_deal",
  "limited_stock",
  "new",
];

function daysSince(iso: string): number {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / (1000 * 60 * 60 * 24);
}

/** Compute which badges apply to a product, ordered by priority and capped. */
export function computeBadges(product: Product, s: BadgeSettings): Badge[] {
  const active = new Set<BadgeKey>();
  const age = daysSince(product.createdAt);

  if (s.bestsellerEnabled && (product.soldCount ?? 0) >= s.bestsellerSalesMin) {
    active.add("bestseller");
  }
  if (
    s.trendingEnabled &&
    ((product.viewsCount ?? 0) >= s.trendingViewsMin ||
      (product.wishlistCount ?? 0) >= s.trendingWishlistMin)
  ) {
    active.add("trending");
  }
  if (s.fastSellingEnabled && age > 0 && Number.isFinite(age)) {
    const perDay = (product.soldCount ?? 0) / Math.max(1, age);
    if (perDay >= s.fastSellingPerDayMin) active.add("fast_selling");
  }
  if (s.hotDealEnabled && (product.discount ?? 0) >= s.hotDealDiscountMin) {
    active.add("hot_deal");
  }
  if (
    s.limitedStockEnabled &&
    product.stockQuantity > 0 &&
    product.stockQuantity <= s.limitedStockMax
  ) {
    active.add("limited_stock");
  }
  if (s.newArrivalEnabled && age <= s.newArrivalDays) {
    active.add("new");
  }

  return PRIORITY.filter((k) => active.has(k))
    .slice(0, Math.max(1, s.maxBadges))
    .map((key) => ({ key, ...BADGE_STYLES[key] }));
}
