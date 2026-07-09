import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProducts } from "@/lib/use-products";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useWishlist } from "@/lib/wishlist";
import { useCart } from "@/lib/cart";
import { type Product } from "@/lib/products";

/**
 * Premium recommendation engine — deterministic, behaviour-driven, and stable.
 *
 * Recommendations are computed entirely from the in-memory product catalog plus
 * the shopper's own signals (recently viewed → wishlist → cart → purchases), so
 * there are no schema changes and no random product lists. The result only
 * recomputes when a MEANINGFUL signal changes (a new view, a wishlist/cart
 * mutation, or a completed order) — never on a bare page refresh — which keeps
 * the ordering feeling intentional rather than reshuffled.
 *
 * Priority order (higher tier → higher base weight):
 *   1. Products from the categories the user views most
 *   2. Products similar to recently viewed items
 *   3. Products similar to wishlist items
 *   4. Products related to cart items
 *   5. Best-sellers from preferred categories
 *   6. Trending products matching the user's interests
 *   7. Highly rated products
 *   8. Newly launched products matching preferences
 *   9. Recently discounted products matching interests
 *  10. Popular products (fallback when history is thin)
 *
 * Never recommends: purchased items, cart items, duplicates, out-of-stock,
 * hidden/inactive products, or products flagged hideFromRecommendations.
 */

const DAY = 24 * 60 * 60 * 1000;

function isNew(p: Product): boolean {
  const t = Date.parse(p.createdAt ?? "");
  return Number.isFinite(t) && Date.now() - t < 30 * DAY;
}

/** Fetch the current user's purchased product slugs (RLS-scoped). Guests: []. */
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

type Signals = {
  recent: string[];
  wishlist: string[];
  cart: string[];
  purchased: Set<string>;
};

function buildRecommendations(products: Product[], signals: Signals, limit: number): Product[] {
  const bySlug = new Map(products.map((p) => [p.slug, p]));

  // Category affinity weighted by signal strength (views < wishlist < cart).
  const catWeight = new Map<string, number>();
  const bump = (slug: string, w: number) => {
    const p = bySlug.get(slug);
    if (!p) return;
    catWeight.set(p.category, (catWeight.get(p.category) ?? 0) + w);
    for (const c of p.categories ?? []) catWeight.set(c, (catWeight.get(c) ?? 0) + w * 0.5);
  };
  // Recency-decayed view weighting (newest view counts most).
  signals.recent.forEach((s, i) => bump(s, Math.max(1, 6 - i * 0.4)));
  signals.wishlist.forEach((s) => bump(s, 4));
  signals.cart.forEach((s) => bump(s, 5));

  const maxCat = Math.max(1, ...catWeight.values());
  const hasHistory = catWeight.size > 0;

  // Exclusion set: purchased, cart, and already-known-uninteresting.
  const exclude = new Set<string>([...signals.purchased, ...signals.cart]);

  const scored = products
    .filter(
      (p) =>
        p.inStock &&
        !p.hideFromRecommendations &&
        (p.status === "published" || p.status === "preorder") &&
        !exclude.has(p.slug),
    )
    .map((p) => {
      const affinity = (catWeight.get(p.category) ?? 0) / maxCat; // 0..1
      let score = 0;

      // 1 + 2 + 3 + 4 — category affinity from views/wishlist/cart signals
      score += affinity * 50;

      // 5 — best-sellers within preferred categories
      if (affinity > 0 && p.bestseller) score += 14;
      score += Math.min((p.soldCount ?? 0) / 50, 12) * (0.4 + affinity);

      // 6 — trending matching interests
      if (p.trending) score += 8 + affinity * 10;

      // 7 — highly rated
      score += (p.rating ?? 0) * 3;

      // 8 — newly launched matching preferences
      if (isNew(p)) score += 5 + affinity * 8;

      // 9 — recently discounted matching interests
      const disc = p.discount ?? 0;
      if (disc > 0) score += Math.min(disc / 10, 6) * (0.5 + affinity);

      // Curated flags nudge quality without dominating behaviour.
      if (p.recommended) score += 4;
      if (p.staffPick || p.editorsChoice) score += 3;
      if (p.featured) score += 2;

      // 10 — popularity fallback keeps the rail full when history is thin.
      if (!hasHistory) score += (p.rating ?? 0) * 4 + Math.min((p.soldCount ?? 0) / 40, 15);

      // Deterministic tiebreak so equal scores keep a stable order.
      const tiebreak = (p.id ?? p.slug).charCodeAt(0) / 1000;
      return { p, score: score + tiebreak };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((x) => x.p);
}

/**
 * Returns a stable, personalized product list. `loading` is true until the
 * catalog is ready. The list recomputes only when signals meaningfully change.
 */
export function useRecommendations(opts: { limit?: number; excludeSlug?: string } = {}) {
  const { limit = 12, excludeSlug } = opts;
  const { products, loading } = useProducts();
  const { slugs: recent } = useRecentlyViewed();
  const { slugs: wishlistSet } = useWishlist();
  const { items } = useCart();
  const purchased = usePurchasedSlugs();

  const wishlist = useMemo(() => [...wishlistSet], [wishlistSet]);
  const cart = useMemo(() => items.map((i) => i.slug), [items]);

  // Signature captures only meaningful changes → prevents reshuffle on refresh.
  const signature = useMemo(
    () =>
      [
        recent.join(","),
        [...wishlist].sort().join(","),
        [...cart].sort().join(","),
        [...purchased].sort().join(","),
        products.length,
        excludeSlug ?? "",
      ].join("|"),
    [recent, wishlist, cart, purchased, products.length, excludeSlug],
  );

  const cacheRef = useRef<{ sig: string; result: Product[] }>({ sig: "", result: [] });

  const result = useMemo(() => {
    if (cacheRef.current.sig === signature) return cacheRef.current.result;
    if (!products.length) return [];
    const list = buildRecommendations(
      products,
      { recent, wishlist, cart, purchased },
      limit + (excludeSlug ? 1 : 0),
    ).filter((p) => p.slug !== excludeSlug);
    const out = list.slice(0, limit);
    cacheRef.current = { sig: signature, result: out };
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, limit]);

  return { products: result, loading: loading && result.length === 0 };
}
