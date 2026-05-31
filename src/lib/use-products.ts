import { useEffect, useState } from "react";
import { fetchProducts, fetchProduct, type Product } from "./products";
import { supabase } from "@/integrations/supabase/client";

let realtimeBound = false;
let lastFreshAt = 0;
const FRESH_TTL = 2_000; // only de-dupe rapid duplicate events; never keep stale admin shipping

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
  // Admins (who can read the base table) get instant realtime updates.
  supabase
    .channel("rt-products-public")
    .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => invalidateProducts())
    .on("postgres_changes", { event: "*", schema: "public", table: "shipping_state" }, () => invalidateProducts())
    .on("postgres_changes", { event: "*", schema: "public", table: "store_settings" }, () => invalidateProducts())
    .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, () => invalidateProducts())
    .subscribe();
  // Customers read the products_public VIEW and never receive base-table
  // realtime events (RLS blocks it), so refresh on focus/visibility instead.
  window.addEventListener("focus", refreshIfStale);
  document.addEventListener("visibilitychange", refreshIfStale);
}


let cache: Product[] | null = null;
let inflight: Promise<Product[]> | null = null;
const subscribers = new Set<(p: Product[]) => void>();

export async function loadProducts(force = false): Promise<Product[]> {
  if (cache && !force) return cache;
  if (!inflight) {
    inflight = fetchProducts().then((p) => {
      cache = p;
      inflight = null;
      subscribers.forEach((s) => s(p));
      return p;
    });
  }
  return inflight;
}

export function invalidateProducts() {
  cache = null;
  loadProducts(true);
}

export function useProducts() {
  const [products, setProducts] = useState<Product[]>(cache ?? []);
  const [loading, setLoading] = useState(!cache);
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
  const [product, setProduct] = useState<Product | null>(
    cache?.find((p) => p.slug === slug) ?? null
  );
  const [loading, setLoading] = useState(!product);
  useEffect(() => {
    let active = true;
    if (cache) {
      const found = cache.find((p) => p.slug === slug) ?? null;
      setProduct(found);
      setLoading(false);
      if (found) return;
    }
    fetchProduct(slug).then((p) => { if (active) { setProduct(p); setLoading(false); } });
    return () => { active = false; };
  }, [slug]);
  return { product, loading };
}
