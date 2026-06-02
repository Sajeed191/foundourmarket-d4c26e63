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
  | "flash_deal"
  | "staff_pick"
  | "editors_choice"
  | "gift_idea"
  | "bestseller"
  | "trending"
  | "fast_selling"
  | "premium"
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
  flash_deal: { label: "Flash Deal", emoji: "⚡", className: "bg-red-500/95 text-white" },
  staff_pick: { label: "Staff Pick", emoji: "🏆", className: "bg-accent text-accent-foreground shadow-[var(--shadow-ember)]" },
  editors_choice: { label: "Editor's Choice", emoji: "✨", className: "bg-violet-500/90 text-white" },
  gift_idea: { label: "Gift Idea", emoji: "🎁", className: "bg-pink-500/90 text-white" },
  bestseller: { label: "Bestseller", emoji: "⭐", className: "bg-amber-400/95 text-black" },
  trending: { label: "Trending", emoji: "🔥", className: "bg-accent text-accent-foreground shadow-[var(--shadow-ember)]" },
  fast_selling: { label: "Fast Selling", emoji: "⚡", className: "bg-fuchsia-500/90 text-white" },
  premium: { label: "Premium", emoji: "💎", className: "bg-indigo-500/90 text-white" },
  hot_deal: { label: "Hot Deal", emoji: "🔥", className: "bg-red-500/90 text-white" },
  limited_stock: { label: "Limited Stock", emoji: "⚠️", className: "bg-orange-600/90 text-white" },
  new: { label: "New", emoji: "🆕", className: "bg-emerald-500/90 text-white" },
};

// Priority order: highest-signal merchandising badges first. Admin-driven
// promotional labels (flash deal, staff pick, gift idea) outrank computed ones.
// Priority order (premium marketplace single-badge logic):
// Flash Deal → Best Seller → New Arrival → Premium → Trending, then the
// remaining promotional/computed labels as lower-priority fallbacks.
const PRIORITY: BadgeKey[] = [
  "flash_deal",
  "bestseller",
  "new",
  "premium",
  "trending",
  "staff_pick",
  "editors_choice",
  "gift_idea",
  "fast_selling",
  "hot_deal",
  "limited_stock",
];

/** Maximum badges shown on a storefront product card. */
export const MAX_CARD_BADGES = 3;

function daysSince(iso: string): number {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / (1000 * 60 * 60 * 24);
}

/**
 * Compute which badges apply to a product, ordered by priority and capped.
 * Merges admin-driven flags (flash deal, staff pick, gift idea, trending,
 * bestseller, new arrival, hot deal) with automatically derived labels
 * (premium and fast selling, computed from analytics + pricing).
 */
export function computeBadges(product: Product, s: BadgeSettings, cap?: number): Badge[] {
  const active = new Set<BadgeKey>();
  const age = daysSince(product.createdAt);

  // Admin-controlled promotional labels — always honored when flagged.
  if (product.flashDeal) active.add("flash_deal");
  if (product.staffPick) active.add("staff_pick");
  if (product.editorsChoice) active.add("editors_choice");
  if (product.giftIdea) active.add("gift_idea");

  // Manual flags OR computed thresholds.
  if (
    product.bestseller ||
    (s.bestsellerEnabled && (product.soldCount ?? 0) >= s.bestsellerSalesMin)
  ) {
    active.add("bestseller");
  }
  if (
    product.trending ||
    (s.trendingEnabled &&
      ((product.viewsCount ?? 0) >= s.trendingViewsMin ||
        (product.wishlistCount ?? 0) >= s.trendingWishlistMin))
  ) {
    active.add("trending");
  }
  if (product.hotDeal || (s.hotDealEnabled && (product.discount ?? 0) >= s.hotDealDiscountMin)) {
    active.add("hot_deal");
  }
  if (product.newArrival || (s.newArrivalEnabled && age <= s.newArrivalDays)) {
    active.add("new");
  }

  // Fast Selling — manual flag OR computed sales velocity.
  if (product.fastSelling) {
    active.add("fast_selling");
  } else if (s.fastSellingEnabled && age > 0 && Number.isFinite(age)) {
    const perDay = (product.soldCount ?? 0) / Math.max(1, age);
    if (perDay >= s.fastSellingPerDayMin) active.add("fast_selling");
  }

  // Premium — manual flag OR high rating + proven demand or premium pricing.
  const ratingStrong = (product.rating ?? 0) >= 4.7 && (product.reviews ?? 0) >= 25;
  const pricePremium = (product.priceInr ?? product.price ?? 0) >= 9999;
  if (product.premium || ratingStrong || pricePremium) {
    active.add("premium");
  }


  // Computed-only: limited stock.
  if (s.limitedStockEnabled && product.stockQuantity > 0 && product.stockQuantity <= s.limitedStockMax) {
    active.add("limited_stock");
  }

  const limit = Math.max(1, cap ?? s.maxBadges);
  return PRIORITY.filter((k) => active.has(k))
    .slice(0, limit)
    .map((key) => ({ key, ...BADGE_STYLES[key] }));
}

