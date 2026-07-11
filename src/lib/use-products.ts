import { useEffect, useState } from "react";
import { fetchProducts, fetchProduct, type Product } from "./products";
import { supabase } from "@/integrations/supabase/client";
import { recordCacheEvent } from "./cache-metrics";

let realtimeBound = false;
let lastFreshAt = 0;
const FRESH_TTL = 2_000; // only de-dupe rapid duplicate events; never keep stale admin shipping

// Stale-while-revalidate window for the browse/catalog cache. Within this
// window the in-memory cache is served instantly with NO network call (repeat
// visits, back/forward, cross-page navigation). Past it, the cached data is
// still returned immediately but a background refresh is kicked off so the next
// read is fresh. Catalog data only — pricing/stock shown here is advisory; the
// authoritative price/stock is always re-read live at cart/checkout/payment.
const SWR_TTL = 60_000;
let cacheLoadedAt = 0;

/** Force a fresh products fetch, throttled, so stale prices/shipping refresh. */
function refreshIfStale(force = false) {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  const now = Date.now();
  if (!force && now - lastFreshAt < FRESH_TTL) return;
  lastFreshAt = now;
  invalidateProducts();
}

/** Public, throttled refresh trigger for entry points like cart/checkout. */
export function refreshProducts(force = true) {
  refreshIfStale(force);
}

function bindRealtime() {
  if (realtimeBound || typeof window === "undefined") return;
  realtimeBound = true;
  // Admins (who can read the base tables) get instant realtime invalidation
  // whenever any catalog-affecting table changes: product create/update/delete,
  // pricing/inventory edits (products), variants, images, badges, categories,
  // shipping and store settings. Customer sessions (which read the *_public
  // views) fall back to focus/visibility refresh below.
  const onCatalogChange = (detail: string) => () => {
    recordCacheEvent("invalidate", "products", { detail });
    invalidateProducts();
  };
  supabase
    .channel("rt-products-public")
    .on("postgres_changes", { event: "*", schema: "public", table: "products" }, onCatalogChange("products"))
    .on("postgres_changes", { event: "*", schema: "public", table: "product_variants" }, onCatalogChange("product_variants"))
    .on("postgres_changes", { event: "*", schema: "public", table: "product_images" }, onCatalogChange("product_images"))
    .on("postgres_changes", { event: "*", schema: "public", table: "product_badges" }, onCatalogChange("product_badges"))
    .on("postgres_changes", { event: "*", schema: "public", table: "badge_settings" }, onCatalogChange("badge_settings"))
    .on("postgres_changes", { event: "*", schema: "public", table: "shipping_state" }, onCatalogChange("shipping_state"))
    .on("postgres_changes", { event: "*", schema: "public", table: "store_settings" }, onCatalogChange("store_settings"))
    .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, onCatalogChange("categories"))
    .subscribe();
  // Customers read the products_public VIEW and never receive base-table
  // realtime events (RLS blocks it), so refresh on focus/visibility instead.
  const refreshFromBrowserEvent = () => refreshIfStale(false);
  window.addEventListener("focus", refreshFromBrowserEvent);
  document.addEventListener("visibilitychange", refreshFromBrowserEvent);
}


let cache: Product[] | null = null;
let inflight: Promise<Product[]> | null = null;
const subscribers = new Set<(p: Product[]) => void>();

function fetchAndStore(): Promise<Product[]> {
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();
  inflight = fetchProducts()
    .then((p) => {
      cache = p;
      cacheLoadedAt = Date.now();
      inflight = null;
      const ms = (typeof performance !== "undefined" ? performance.now() : Date.now()) - start;
      recordCacheEvent("miss", "products", { ms });
      subscribers.forEach((s) => s(p));
      return p;
    })
    .catch((err) => {
      inflight = null;
      recordCacheEvent("refresh-failed", "products", {
        detail: err instanceof Error ? err.message : String(err),
      });
      throw err;
    });
  return inflight;
}

export async function loadProducts(force = false): Promise<Product[]> {
  if (cache && !force) {
    recordCacheEvent("hit", "products");
    // Stale-while-revalidate: past the TTL, serve the cache now but refresh in
    // the background so the next read is fresh. No extra DB reads within TTL.
    if (!inflight && Date.now() - cacheLoadedAt > SWR_TTL) {
      recordCacheEvent("revalidate", "products");
      void fetchAndStore().catch(() => {});
    }
    return cache;
  }
  if (!inflight) return fetchAndStore();
  return inflight;
}

export function invalidateProducts() {
  cache = null;
  cacheLoadedAt = 0;
  loadProducts(true);
}


export function useProducts() {
  const initial = cache;
  const [products, setProducts] = useState<Product[]>(initial ?? []);
  const [loading, setLoading] = useState(!initial);
  useEffect(() => {
    bindRealtime();
    let active = true;
    const sub = (p: Product[]) => { if (active) setProducts(p); };
    subscribers.add(sub);
    loadProducts().then((p) => { if (active) { setProducts(p); setLoading(false); } });
    return () => { active = false; subscribers.delete(sub); };
  }, []);
  return { products, loading };
}

export function useProduct(slug: string) {
  // Only a FULL cached record (not a lean list entry) can seed the initial
  // state — lean entries omit detail-only fields (features, specifications,
  // attributes, SEO, related products, etc.), so they must be upgraded via a
  // full fetch before the detail page renders those sections.
  const cachedFull = cache?.find((p) => p.slug === slug && !p.__lean) ?? null;
  const [product, setProduct] = useState<Product | null>(cachedFull);
  const [loading, setLoading] = useState(!cachedFull);
  useEffect(() => {
    let active = true;
    const full = cache?.find((p) => p.slug === slug && !p.__lean) ?? null;
    if (full) {
      setProduct(full);
      setLoading(false);
      return;
    }
    // No full record cached (either missing or only a lean list entry) — fetch
    // the complete product so detail-only fields are present.
    setLoading(true);
    fetchProduct(slug).then((p) => { if (active) { setProduct(p); setLoading(false); } });
    return () => { active = false; };
  }, [slug]);
  return { product, loading };
}
