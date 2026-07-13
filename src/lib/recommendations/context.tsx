import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProducts } from "@/lib/use-products";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useWishlist } from "@/lib/wishlist";
import { useCart } from "@/lib/cart";
import { useRegion } from "@/lib/region";
import type { Product } from "@/lib/products";
import type {
  EngineConfig,
  RecommendationItem,
  RecommendationSignals,
} from "./types";
import { runEngine } from "./engine";
import { resolveBusinessRules, type ResolvedRules, type BusinessRule } from "./rules";
import { listActiveRules } from "./rules.functions";

/**
 * RecommendationProvider + hooks. Gathers every behaviour/context signal ONCE
 * (catalog, recently viewed, wishlist, cart, purchases, region) and shares it,
 * so any number of recommendation rails on a page read from a single source
 * instead of each re-querying. Rails call `useRecommendationRail(config)`.
 */

/** Fetch the signed-in user's purchased slugs once (RLS-scoped). Guests: []. */
function usePurchasedSlugs(): Set<string> {
  const [slugs, setSlugs] = useState<Set<string>>(new Set());
  useEffect(() => {
    let active = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        if (active) setSlugs(new Set());
        return;
      }
      const { data } = await supabase
        .from("orders")
        .select("order_items(product_slug)")
        .eq("user_id", auth.user.id)
        .limit(200);
      if (!active) return;
      const set = new Set<string>();
      for (const o of (data ?? []) as { order_items: { product_slug: string | null }[] }[]) {
        for (const it of o.order_items ?? []) if (it.product_slug) set.add(it.product_slug);
      }
      setSlugs(set);
    })();
    return () => {
      active = false;
    };
  }, []);
  return slugs;
}

type SignalsContextValue = {
  signals: RecommendationSignals;
  /** Stable per-day rotation seed so repeat visits vary deterministically. */
  rotationSeed: number;
  /** True until the catalog is ready. */
  loading: boolean;
  /** True once the shopper has meaningful history (returning user). */
  personalized: boolean;
  /** Admin business rules resolved against the current catalog. */
  businessRules: ResolvedRules;
};

const EMPTY_RULES: ResolvedRules = { ruleAdjust: new Map(), excludedSlugs: [], activeCount: 0 };

/** Load enabled admin merchandising rules once (cheap, non-sensitive). */
function useBusinessRules(products: Product[]): ResolvedRules {
  const [rules, setRules] = useState<BusinessRule[]>([]);
  useEffect(() => {
    let active = true;
    listActiveRules()
      .then((r) => {
        if (active) setRules(r);
      })
      .catch(() => {
        if (active) setRules([]);
      });
    return () => {
      active = false;
    };
  }, []);
  return useMemo(
    () => (rules.length && products.length ? resolveBusinessRules(products, rules) : EMPTY_RULES),
    [rules, products],
  );
}

const SignalsContext = createContext<SignalsContextValue | null>(null);

function dayBucket(): number {
  return Math.floor(Date.now() / (1000 * 60 * 60 * 24));
}

export function RecommendationProvider({ children }: { children: ReactNode }) {
  const { products, loading } = useProducts();
  const { slugs: recent } = useRecentlyViewed();
  const { slugs: wishlistSet } = useWishlist();
  const { items } = useCart();
  const { market, countryCode, priceOf } = useRegion();
  const purchased = usePurchasedSlugs();

  const wishlist = useMemo(() => [...wishlistSet], [wishlistSet]);
  const cart = useMemo(() => items.map((i) => i.slug), [items]);

  const signals = useMemo<RecommendationSignals>(
    () => ({
      catalog: products,
      recent,
      wishlist,
      cart,
      purchased,
      market,
      location: { country: countryCode ?? null },
      priceOf,
    }),
    [products, recent, wishlist, cart, purchased, market, countryCode, priceOf],
  );

  const personalized = recent.length + wishlist.length + cart.length + purchased.size > 0;
  const businessRules = useBusinessRules(products);

  const value = useMemo<SignalsContextValue>(
    () => ({ signals, rotationSeed: dayBucket(), loading, personalized, businessRules }),
    [signals, loading, personalized, businessRules],
  );

  return <SignalsContext.Provider value={value}>{children}</SignalsContext.Provider>;
}

/** Access the shared signal bundle. Falls back gracefully outside a provider. */
export function useRecommendationSignals(): SignalsContextValue {
  const ctx = useContext(SignalsContext);
  // Fallback: components used outside the provider still work via local hooks.
  const fallbackProducts = useProducts();
  const fallbackRecent = useRecentlyViewed();
  const fallbackWishlist = useWishlist();
  const fallbackCart = useCart();
  const fallbackRegion = useRegion();
  const purchased = usePurchasedSlugs();

  const fallback = useMemo<SignalsContextValue>(() => {
    const wishlist = [...fallbackWishlist.slugs];
    const cart = fallbackCart.items.map((i) => i.slug);
    const signals: RecommendationSignals = {
      catalog: fallbackProducts.products,
      recent: fallbackRecent.slugs,
      wishlist,
      cart,
      purchased,
      market: fallbackRegion.market,
      location: { country: fallbackRegion.countryCode ?? null },
      priceOf: fallbackRegion.priceOf,
    };
    const personalized = fallbackRecent.slugs.length + wishlist.length + cart.length + purchased.size > 0;
    return { signals, rotationSeed: dayBucket(), loading: fallbackProducts.loading, personalized, businessRules: EMPTY_RULES };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    fallbackProducts.products,
    fallbackProducts.loading,
    fallbackRecent.slugs,
    fallbackWishlist.slugs,
    fallbackCart.items,
    fallbackRegion.market,
    fallbackRegion.countryCode,
    purchased,
  ]);

  return ctx ?? fallback;
}

type RailOptions = Omit<EngineConfig, "rotationSeed"> & {
  /** Override the shared per-day rotation seed. */
  rotationSeed?: number;
};

/**
 * The one hook every recommendation rail uses. Returns scored items plus a
 * loading flag. Recomputes only when signals or config meaningfully change
 * (memoized against a signature), never on a bare refresh.
 */
export function useRecommendationRail(options: RailOptions): {
  items: RecommendationItem[];
  products: Product[];
  loading: boolean;
  personalized: boolean;
} {
  const { signals, rotationSeed, loading, personalized, businessRules } = useRecommendationSignals();

  // Merge admin business rules into the engine config (additive deltas + hard
  // excludes) without callers needing to know rules exist.
  const config: EngineConfig = {
    rotationSeed,
    ...options,
    ruleAdjust: businessRules.ruleAdjust.size ? businessRules.ruleAdjust : options.ruleAdjust,
    boosts: businessRules.excludedSlugs.length
      ? {
          ...options.boosts,
          excludedSlugs: [...(options.boosts?.excludedSlugs ?? []), ...businessRules.excludedSlugs],
        }
      : options.boosts,
  };

  const signature = useMemo(
    () =>
      [
        config.strategy,
        config.limit,
        config.seed?.slug ?? "",
        (config.exclude ?? []).join(","),
        (config.restrictTo ?? []).join(","),
        config.priceMin ?? "",
        config.priceMax ?? "",
        config.sameCategoryAsSeed ? 1 : 0,
        config.differentCategoryFromSeed ? 1 : 0,
        config.includeOutOfStock ? 1 : 0,
        config.diversity === false ? 0 : 1,
        config.rotationSeed ?? 0,
        [...(config.seedScores?.keys() ?? [])].join(","),
        (config.boosts?.pinnedSlugs ?? []).join(","),
        (config.boosts?.excludedSlugs ?? []).join(","),
        signals.catalog.length,
        signals.recent.join(","),
        [...signals.wishlist].sort().join(","),
        [...signals.cart].sort().join(","),
        [...signals.purchased].sort().join(","),
        signals.market ?? "",
        businessRules.activeCount,
        businessRules.ruleAdjust.size,
        businessRules.excludedSlugs.join(","),
      ].join("|"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      config.strategy,
      config.limit,
      config.seed?.slug,
      config.exclude,
      config.restrictTo,
      config.priceMin,
      config.priceMax,
      config.sameCategoryAsSeed,
      config.differentCategoryFromSeed,
      config.includeOutOfStock,
      config.diversity,
      config.rotationSeed,
      config.seedScores,
      config.boosts,
      signals,
      businessRules,
    ],
  );

  const cacheRef = useRef<{ sig: string; items: RecommendationItem[] }>({ sig: "", items: [] });

  const items = useMemo(() => {
    if (cacheRef.current.sig === signature) return cacheRef.current.items;
    if (!signals.catalog.length) return [];
    const result = runEngine(signals, config);
    cacheRef.current = { sig: signature, items: result };
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const products = useMemo(() => items.map((it) => it.product), [items]);

  return { items, products, loading: loading && items.length === 0, personalized };
}
