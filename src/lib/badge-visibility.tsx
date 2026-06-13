import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Product } from "@/lib/products";
import { computeBadges, singleBadge, DEFAULT_BADGE_SETTINGS, type Badge, type BadgeKey } from "@/lib/badges";
import { useProducts } from "@/lib/use-products";
import { useRotationNonce } from "@/lib/use-rotation-nonce";
import { isFlashDealProduct } from "@/lib/use-flash-deals";
import {
  flashWindowSeed,
  orderWindowSeed,
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
const PRIORITY_KEYS: BadgeKey[] = ["flash_deal", "hot_deal", "bestseller", "trending"];

const isFlashKey = (k: BadgeKey) => FLASH_KEYS.includes(k);

type BadgeEngineValue = {
  /** Slugs of the products currently selected for the live Flash Deal rotation. */
  activeFlashSlugs: Set<string>;
  /** 24h-stable seed driving the rotating "third badge" selection. */
  daySeed: number;
};

const BadgeEngineContext = createContext<BadgeEngineValue>({
  activeFlashSlugs: new Set(),
  daySeed: 0,
});

/** How many products may be visibly promoted as Flash Deals at any one time. */
export const FLASH_VISIBLE_MAX = 10;

/**
 * Selects the products currently allowed to display Flash/Hot badges and appear
 * in the Flash Deal section. Eligible = flagged Flash/Hot, published, in stock.
 * When more than {@link FLASH_VISIBLE_MAX} qualify, a deterministic random
 * subset is chosen per 6-hour window so the lineup rotates automatically.
 */
export function selectActiveFlashSlugs(products: Product[], seed: number): Set<string> {
  const eligible = products.filter(
    (p) => isFlashDealProduct(p) && p.status === "published" && p.inStock && p.stockQuantity > 0,
  );
  const chosen = seededShuffle(eligible, seed).slice(0, FLASH_VISIBLE_MAX);
  return new Set(chosen.map((p) => p.slug));
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
  const nonce = useRotationNonce();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const flashSeed = flashWindowSeed(now) + nonce;
  const daySeed = dayWindowSeed(now);

  const activeFlashSlugs = useMemo(
    () => selectActiveFlashSlugs(products, flashSeed),
    [products, flashSeed],
  );

  // Memoize by the stable inputs so the context identity only changes when a
  // rotation window actually crosses — not every minute.
  const value = useMemo<BadgeEngineValue>(
    () => ({ activeFlashSlugs, daySeed }),
    [activeFlashSlugs, daySeed],
  );

  return <BadgeEngineContext.Provider value={value}>{children}</BadgeEngineContext.Provider>;
}

export function useBadgeEngine(): BadgeEngineValue {
  return useContext(BadgeEngineContext);
}

/**
 * Caps a badge list at {@link MAX_VISIBLE_BADGES}, always keeping the highest
 * priority badges (Flash/Hot when allowed, Best Seller, Trending) and filling
 * any remaining slot with ONE other eligible badge that rotates once every 24h.
 */
function capWithRotation(product: Product, pool: Badge[], daySeed: number): Badge[] {
  if (pool.length <= MAX_VISIBLE_BADGES) return pool;
  const must = pool.filter((b) => PRIORITY_KEYS.includes(b.key)).slice(0, MAX_VISIBLE_BADGES);
  const rest = pool.filter((b) => !PRIORITY_KEYS.includes(b.key));
  const slots = MAX_VISIBLE_BADGES - must.length;
  if (slots <= 0 || rest.length === 0) return must.slice(0, MAX_VISIBLE_BADGES);

  const offset = hashString(`${product.slug}:${daySeed}`);
  const picked: Badge[] = [];
  for (let i = 0; i < slots && i < rest.length; i++) {
    picked.push(rest[(offset + i) % rest.length]);
  }
  return [...must, ...picked].slice(0, MAX_VISIBLE_BADGES);
}

/**
 * Computes the badges that should be visible for a product in a given surface,
 * honoring the global rules: max 3 badges, Best Seller/Trending priority, the
 * 24h-rotating third badge, and Flash/Hot badges hidden everywhere unless the
 * product is in the active Flash Deal rotation.
 */
export function computeContextBadges(
  product: Product,
  context: BadgeContext,
  engine: BadgeEngineValue,
): Badge[] {
  const all = computeBadges(product, DEFAULT_BADGE_SETTINGS, 99);
  const flashActive = engine.activeFlashSlugs.has(product.slug);

  switch (context) {
    case "flash":
      // Flash section only ever renders actively-selected deals.
      return all.filter((b) => isFlashKey(b.key)).slice(0, MAX_VISIBLE_BADGES);
    case "bestseller":
      return all.filter((b) => b.key === "bestseller").slice(0, 1);
    case "trending":
      return all.filter((b) => b.key === "trending").slice(0, 1);
    case "new_arrivals": {
      const pool = all.filter(
        (b) => !["bestseller", "trending", "flash_deal", "hot_deal"].includes(b.key),
      );
      return capWithRotation(product, pool, engine.daySeed);
    }
    default: {
      // category, search, recently_viewed, related, product_page, default:
      // hide Flash/Hot unless this product is in the active rotation.
      const pool = all.filter((b) => !isFlashKey(b.key) || flashActive);
      return capWithRotation(product, pool, engine.daySeed);
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
