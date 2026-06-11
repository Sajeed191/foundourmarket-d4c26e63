import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProducts } from "@/lib/use-products";
import type { Product } from "@/lib/products";
import { useRotationNonce } from "@/lib/use-rotation-nonce";

/** A row from the dedicated flash_deals table (optional flash pricing + window). */
export type DealRow = {
  id: string;
  product_id: string;
  product_slug: string | null;
  flash_price: number;
  start_at: string;
  end_at: string;
  priority: number;
  created_at: string;
};

/** A storefront flash-deal entry built from a catalog product. */
export type FlashItem = {
  product: Product;
  /** Live override price from flash_deals table, if any. */
  flashPrice: number | null;
  /** Countdown end, if a live deal window applies. */
  endAt: string | null;
  dealId: string | null;
  priority: number;
};

/** True when a product is flagged as a flash deal through any supported signal. */
export function isFlashDealProduct(p: Product): boolean {
  if (p.flashDeal) return true;
  const tokens = (p.collections ?? []).map((c) => c.toLowerCase().replace(/[\s_]+/g, "-"));
  return tokens.includes("flash-deal") || tokens.includes("flash-deals");
}

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Returns the timestamp (ms) of the most recent rotation boundary. Flash deals
 * reshuffle every day at 12:00 AM and 12:00 PM. The returned value stays fixed
 * between boundaries so the display order is stable until the next rotation.
 */
export function currentRotationSeed(nowMs: number): number {
  const d = new Date(nowMs);
  const boundary = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() < 12 ? 0 : 12, 0, 0, 0);
  return boundary.getTime();
}

/** Deterministic PRNG (mulberry32) so every surface computes the same order. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded Fisher–Yates shuffle — same seed always yields the same order. */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const rng = mulberry32(seed);
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Single shared source of truth for Flash Deal products. Used by the homepage
 * Flash Deals section, the Deals & Promotions / Offers page, and any "Shop
 * Deals" destination so all surfaces return the exact same products.
 */
export function useFlashDeals() {
  const { products, loading } = useProducts();
  const [deals, setDeals] = useState<DealRow[]>([]);
  const now = useNow();
  const rotationNonce = useRotationNonce();

  function fetchDeals() {
    supabase
      .from("flash_deals")
      .select("id,product_id,flash_price,start_at,end_at,priority,created_at,product:products(slug)")
      .then(({ data }) => {
        const rows = (data as unknown as Array<Omit<DealRow, "product_slug"> & { product: { slug: string } | null }>) ?? [];
        setDeals(rows.map((r) => ({ ...r, product_slug: r.product?.slug ?? null })));
      });
  }

  useEffect(() => {
    fetchDeals();
    const ch = supabase
      .channel("rt-flash-deals-shared")
      .on("postgres_changes", { event: "*", schema: "public", table: "flash_deals" }, fetchDeals)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  // Map of live deal overrides keyed by product slug (only deals in their window).
  const liveDealBySlug = useMemo(() => {
    const map = new Map<string, DealRow>();
    for (const d of deals) {
      if (!d.product_slug) continue;
      const startOk = new Date(d.start_at).getTime() <= now;
      const endOk = new Date(d.end_at).getTime() > now;
      if (!startOk || !endOk) continue;
      const existing = map.get(d.product_slug);
      if (!existing || d.priority > existing.priority) map.set(d.product_slug, d);
    }
    return map;
  }, [deals, now]);

  // Rotation boundary (12:00 AM / 12:00 PM). Stays fixed between boundaries so
  // the randomized order is stable until the next rotation. The manual reshuffle
  // nonce lets admins re-randomize the lineup instantly on demand.
  const rotationSeed = currentRotationSeed(now) + rotationNonce;



  const items = useMemo<FlashItem[]>(() => {
    let totalFlagged = 0;
    const active: FlashItem[] = [];
    let excludedUnavailable = 0;

    for (const p of products) {
      if (!isFlashDealProduct(p)) continue;
      totalFlagged++;
      // Active = published, in stock, and flagged. Inactive products are hidden everywhere.
      const available = p.status === "published" && p.inStock && p.stockQuantity > 0;
      if (!available) {
        excludedUnavailable++;
        continue;
      }
      const live = liveDealBySlug.get(p.slug) ?? null;
      active.push({
        product: p,
        flashPrice: live ? live.flash_price : null,
        endAt: live ? live.end_at : null,
        dealId: live ? live.id : null,
        priority: live ? live.priority : 0,
      });
    }

    // Reshuffle every rotation window using a deterministic seed so the homepage,
    // Offers page and Deals page all compute the exact same randomized order.
    const ordered = seededShuffle(active, rotationSeed);

    if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.info(`[FlashDeals] total Flash Deal products found: ${totalFlagged}`);
      // eslint-disable-next-line no-console
      console.info(`[FlashDeals] active Flash Deal products: ${ordered.length} | excluded (inactive/unavailable): ${excludedUnavailable}`);
      // eslint-disable-next-line no-console
      console.info(`[FlashDeals] current rotation timestamp: ${new Date(rotationSeed).toISOString()}`);
      // eslint-disable-next-line no-console
      console.info("[FlashDeals] current display order:", ordered.map((i) => i.product.slug));
    }

    return ordered;
  }, [products, liveDealBySlug, rotationSeed]);


  return { items, loading, now, products };
}
