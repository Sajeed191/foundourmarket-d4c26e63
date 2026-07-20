import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Product } from "@/lib/products";
import { computeBadges, singleBadge, DEFAULT_BADGE_SETTINGS, type Badge, type BadgeKey, type BadgeSettings } from "@/lib/badges";
import { useProducts } from "@/lib/use-products";
import { useBadgeSettings } from "@/lib/use-badge-settings";
import { useRotationNonce } from "@/lib/use-rotation-nonce";
import { hasAssignedCollectionBadge, useBadgeCatalog, type RenderBadge } from "@/lib/use-product-badges";
import {
  flashWindowSeed,
  dayWindowSeed,
  seededShuffle,
  hashString,
} from "@/lib/rotation-windows";

/**
 * Where a product card is being rendered. Each surface has its own badge
 * visibility policy so the storefront never looks cluttered and promotional
 * Flash/Hot badges stay exclusive to the currently-selected rotation.
 */
export type BadgeContext =
  | "flash" // Flash Deal section — show Flash/Hot badges
  | "bestseller" // Best Seller section — Best Seller badge only
  | "trending" // Trending section — Trending badge only
  | "new_arrivals" // hide Best Seller / Trending / Flash / Hot
  | "category"
  | "search"
  | "recently_viewed"
  | "related"
  | "product_page"
  | "default";

/** Maximum badges visible on any single product card across the storefront. */
export const MAX_VISIBLE_BADGES = 3;

const FLASH_KEYS: BadgeKey[] = ["flash_deal", "hot_deal"];
// Storefront badge priority — mirrors Badge Manager priority ladder.
const PRIORITY_KEYS: BadgeKey[] = [
  "flash_deal",
  "hot_deal",
  "bestseller",
  "trending",
  "new",
  "recommended",
  "best_value",
  "popular",
];

const isFlashKey = (k: BadgeKey) => FLASH_KEYS.includes(k);

type BadgeEngineValue = {
  /** Slugs of the products currently selected for the live Flash Deal rotation. */
  activeFlashSlugs: Set<string>;
  /**
   * For each selected Flash Deal product, the single promotional badge it may
   * display website-wide (`flash_deal` or `hot_deal`). Products with BOTH flags
   * are assigned whichever badge is currently rarer among the selected 10, so
   * the distribution stays balanced.
   */
  flashBadgeBySlug: Map<string, BadgeKey>;
  /** 24h-stable seed driving the rotating "third badge" selection. */
  daySeed: number;
  /** Live admin-configured badge rules (thresholds, enable flags, max badges). */
  settings: BadgeSettings;
};

const BadgeEngineContext = createContext<BadgeEngineValue>({
  activeFlashSlugs: new Set(),
  flashBadgeBySlug: new Map(),
  daySeed: 0,
  settings: DEFAULT_BADGE_SETTINGS,
});

/** How many products may be visibly promoted as Flash Deals at any one time. */
export const FLASH_VISIBLE_MAX = 10;

export type FlashSelection = {
  slugs: Set<string>;
  badgeBySlug: Map<string, BadgeKey>;
};

/**
 * Selects the products currently allowed to display Flash/Hot badges and appear
 * in the Flash Deal section, and decides which single promotional badge each one
 * shows. Eligible = flagged Flash/Hot, published, in stock. When more than
 * {@link FLASH_VISIBLE_MAX} qualify, the full eligible list is shuffled per
 * 6-hour window (12AM/6AM/12PM/6PM IST) and the first 10 are picked — every
 * product has an equal chance and selection never depends on id/date order.
 *
 * Badge balancing: a product carrying both Flash Deal and Hot Deal shows only
 * one. It is given whichever badge is currently less frequent among the already
 * selected products, keeping the two badge types evenly distributed.
 */
export function selectActiveFlash(
  products: Product[],
  seed: number,
  _settings: BadgeSettings,
  badgeMap?: Map<string, RenderBadge[]>,
  now = Date.now(),
): FlashSelection {
  const eligible = products.filter(
    (p) =>
      hasAssignedCollectionBadge(badgeMap?.get(p.slug), ["flash_deal", "hot_deal"], now) &&
      p.status === "published" &&
      p.inStock &&
      p.stockQuantity > 0,
  );
  const chosen = seededShuffle(eligible, seed).slice(0, FLASH_VISIBLE_MAX);
  const slugs = new Set(chosen.map((p) => p.slug));
  const badgeBySlug = new Map<string, BadgeKey>();
  let flashCount = 0;
  let hotCount = 0;
  for (const p of chosen) {
    const assignedBadges = badgeMap?.get(p.slug);
    const hasFlash = hasAssignedCollectionBadge(assignedBadges, ["flash_deal"], now);
    const hasHot = hasAssignedCollectionBadge(assignedBadges, ["hot_deal"], now);
    let key: BadgeKey | null = null;
    if (hasFlash && hasHot) {
      // Pick the rarer badge so far to balance the distribution (ties → Flash).
      key = flashCount <= hotCount ? "flash_deal" : "hot_deal";
    } else if (hasFlash) {
      key = "flash_deal";
    } else if (hasHot) {
      key = "hot_deal";
    }
    if (key) {
      badgeBySlug.set(p.slug, key);
      if (key === "flash_deal") flashCount++;
      else hotCount++;
    }
  }
  return { slugs, badgeBySlug };
}

/** Back-compat helper: just the active Flash Deal slug set. */
export function selectActiveFlashSlugs(
  products: Product[],
  seed: number,
  settings: BadgeSettings = DEFAULT_BADGE_SETTINGS,
): Set<string> {
  return selectActiveFlash(products, seed, settings).slugs;
}

/**
 * Provider that computes the shared merchandising state once for the whole app:
 * the active Flash Deal rotation and the daily badge-rotation seed. A single
 * one-minute clock drives boundary crossings, so individual product cards never
 * subscribe to timers or the product cache themselves — preventing badge
 * flicker and excessive re-renders.
 */
export function BadgeEngineProvider({ children }: { children: ReactNode }) {
  const { products } = useProducts();
  const { map: badgeAssignments } = useBadgeCatalog();
  const nonce = useRotationNonce();
  const settings = useBadgeSettings();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const flashSeed = flashWindowSeed(now) + nonce;
  const daySeed = dayWindowSeed(now);

  const { activeFlashSlugs, flashBadgeBySlug } = useMemo(() => {
    const sel = selectActiveFlash(products, flashSeed, settings, badgeAssignments, now);
    return { activeFlashSlugs: sel.slugs, flashBadgeBySlug: sel.badgeBySlug };
  }, [products, badgeAssignments, flashSeed, settings, now]);

  // Memoize by the stable inputs so the context identity only changes when a
  // rotation window actually crosses or admin rules change — not every minute.
  const value = useMemo<BadgeEngineValue>(
    () => ({ activeFlashSlugs, flashBadgeBySlug, daySeed, settings }),
    [activeFlashSlugs, flashBadgeBySlug, daySeed, settings],
  );

  return <BadgeEngineContext.Provider value={value}>{children}</BadgeEngineContext.Provider>;
}

export function useBadgeEngine(): BadgeEngineValue {
  return useContext(BadgeEngineContext);
}

/**
 * Caps a badge list at the admin-configured max (1–3), always keeping the
 * highest priority badges (Flash/Hot when allowed, Best Seller, Trending) and
 * filling any remaining slot with ONE other eligible badge that rotates once
 * every 24h.
 */
function capWithRotation(product: Product, pool: Badge[], daySeed: number, max: number): Badge[] {
  const cap = Math.min(MAX_VISIBLE_BADGES, Math.max(1, max));
  if (pool.length <= cap) return pool;
  const must = pool.filter((b) => PRIORITY_KEYS.includes(b.key)).slice(0, cap);
  const rest = pool.filter((b) => !PRIORITY_KEYS.includes(b.key));
  const slots = cap - must.length;
  if (slots <= 0 || rest.length === 0) return must.slice(0, cap);

  const offset = hashString(`${product.slug}:${daySeed}`);
  const picked: Badge[] = [];
  for (let i = 0; i < slots && i < rest.length; i++) {
    picked.push(rest[(offset + i) % rest.length]);
  }
  return [...must, ...picked].slice(0, cap);
}

/**
 * Computes the badges that should be visible for a product in a given surface,
 * honoring the admin-configured rules: enable flags + thresholds, max badges,
 * Best Seller/Trending priority, the 24h-rotating third badge, and Flash/Hot
 * badges hidden everywhere unless the product is in the active Flash Deal
 * rotation.
 */
export function computeContextBadges(
  product: Product,
  context: BadgeContext,
  engine: BadgeEngineValue,
): Badge[] {
  const { settings } = engine;
  const all = computeBadges(product, settings, 99);
  const flashActive = engine.activeFlashSlugs.has(product.slug);
  // The single Flash/Hot badge this product is allowed to show (already balanced
  // at selection time). Only set for products in the active rotation.
  const chosenFlash = engine.flashBadgeBySlug.get(product.slug) ?? null;
  const max = settings.maxBadges;

  switch (context) {
    case "flash":
      // Flash section only ever renders the one balanced badge per selected deal.
      if (chosenFlash) return [singleBadge(chosenFlash)];
      return all.filter((b) => isFlashKey(b.key)).slice(0, 1);
    case "bestseller":
      return all.filter((b) => b.key === "bestseller").slice(0, 1);
    case "trending":
      return all.filter((b) => b.key === "trending").slice(0, 1);
    case "new_arrivals": {
      const pool = all.filter(
        (b) => !["bestseller", "trending", "flash_deal", "hot_deal"].includes(b.key),
      );
      return capWithRotation(product, pool, engine.daySeed, max);
    }
    default: {
      // category, search, recently_viewed, related, product_page, default:
      // hide Flash/Hot entirely unless this product is in the active rotation,
      // and then only the single balanced badge.
      const nonFlash = all.filter((b) => !isFlashKey(b.key));
      const pool = flashActive && chosenFlash ? [singleBadge(chosenFlash), ...nonFlash] : nonFlash;
      return capWithRotation(product, pool, engine.daySeed, max);
    }
  }
}

/**
 * Hook returning the visible badges for a product card. Pass a forced badge for
 * dedicated section grids that should show only one specific badge.
 */
export function useVisibleBadges(
  product: Product,
  context: BadgeContext = "default",
  forceBadge?: BadgeKey | null,
): Badge[] {
  const engine = useBadgeEngine();
  return useMemo(() => {
    if (forceBadge) return [singleBadge(forceBadge)];
    return computeContextBadges(product, context, engine);
  }, [product, context, forceBadge, engine]);
}
