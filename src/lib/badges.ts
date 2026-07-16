/**
 * Badge System v4 — legacy compatibility layer.
 *
 * The Badge Manager (`badge_types` table via `use-product-badges`) is the
 * single source of truth for badge styling, priority, and enablement. This
 * file only supplies the enumerated *catalog* of v4 badge slugs and the
 * product-flag → badge derivation used by the storefront rotation engine.
 * All colors/labels shown to users come from the Badge Manager at render
 * time; the fields here are last-resort fallbacks used before the DB
 * catalog has hydrated.
 */
import type { Product } from "./products";

export type BadgeSettings = {
  trendingEnabled: boolean;
  trendingViewsMin: number;
  trendingWishlistMin: number;
  bestsellerEnabled: boolean;
  bestsellerSalesMin: number;
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
  newArrivalEnabled: true,
  newArrivalDays: 14,
  hotDealEnabled: true,
  hotDealDiscountMin: 20,
  maxBadges: 1,
};

/** The 8 canonical Badge System v4 slugs. No others exist. */
export type BadgeKey =
  | "flash_deal"
  | "hot_deal"
  | "bestseller"
  | "trending"
  | "new"
  | "recommended"
  | "best_value"
  | "popular";

export type Badge = {
  key: BadgeKey;
  label: string;
  emoji: string;
  /** Legacy field kept for callers that read it; presentation is DB-driven. */
  className: string;
};

/**
 * Fallback label/emoji used only if the Badge Manager catalog hasn't loaded.
 * Colors and priority are OWNED by the DB (`badge_types`). Do not read colors
 * from here — read the `badge_types` row at render time via `useBadgeCatalog`.
 */
const BADGE_META: Record<BadgeKey, Omit<Badge, "key">> = {
  flash_deal:  { label: "Flash Deal",  emoji: "⚡", className: "" },
  hot_deal:    { label: "Hot Deal",    emoji: "🔥", className: "" },
  bestseller:  { label: "Bestseller",  emoji: "⭐", className: "" },
  trending:    { label: "Trending",    emoji: "📈", className: "" },
  new:         { label: "New",         emoji: "🆕", className: "" },
  recommended: { label: "Recommended", emoji: "✨", className: "" },
  best_value:  { label: "Best Value",  emoji: "💎", className: "" },
  popular:     { label: "Popular",     emoji: "👥", className: "" },
};

/** Storefront priority ladder — must mirror Badge Manager `priority`. */
const PRIORITY: BadgeKey[] = [
  "flash_deal",
  "hot_deal",
  "bestseller",
  "trending",
  "new",
  "recommended",
  "best_value",
  "popular",
];

/** Kept as `1` — v4 rule: at most one badge per card. */
export const MAX_CARD_BADGES = 1;

export function singleBadge(key: BadgeKey): Badge {
  return { key, ...BADGE_META[key] };
}

function daysSince(iso: string): number {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / (1000 * 60 * 60 * 24);
}

/**
 * Derives which of the 8 v4 badges a product currently qualifies for based on
 * product flags + admin thresholds. This is the input the rotation engine
 * uses to pick a single winner. Legacy flags (staffPick, editorsChoice,
 * giftIdea, premium, featured, fastSelling, limited stock) are ignored — they
 * no longer map to any v4 badge.
 */
export function computeBadges(product: Product, s: BadgeSettings, cap?: number): Badge[] {
  const active = new Set<BadgeKey>();
  const age = daysSince(product.createdAt);

  if (product.flashDeal) active.add("flash_deal");

  if (product.hotDeal || (s.hotDealEnabled && (product.discount ?? 0) >= s.hotDealDiscountMin)) {
    active.add("hot_deal");
  }

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

  if (product.newArrival || (s.newArrivalEnabled && age <= s.newArrivalDays)) {
    active.add("new");
  }

  if (product.recommended) active.add("recommended");

  const limit = Math.max(1, cap ?? s.maxBadges);
  return PRIORITY.filter((k) => active.has(k))
    .slice(0, limit)
    .map((key) => ({ key, ...BADGE_META[key] }));
}
