import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProducts } from "@/lib/use-products";
import type { Product } from "@/lib/products";
import { useRotationNonce } from "@/lib/use-rotation-nonce";
import { flashWindowSeed, orderWindowSeed, seededShuffle } from "@/lib/rotation-windows";

/** Maximum products visibly promoted as Flash Deals at any one time. */
const FLASH_VISIBLE_MAX = 10;

/** A row from the dedicated flash_deals table (optional flash pricing + window). */
export type DealRow = {
  id: string;
  product_id: string;
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
      .select("id,product_id,flash_price,start_at,end_at,priority,created_at")
      .then(({ data }) => {
        setDeals((data as DealRow[] | null) ?? []);
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

  // Map of live deal overrides keyed by public product id (only deals in their window).
  const liveDealByProductId = useMemo(() => {
    const map = new Map<string, DealRow>();
    for (const d of deals) {
      if (!d.product_id) continue;
      const startOk = new Date(d.start_at).getTime() <= now;
      const endOk = new Date(d.end_at).getTime() > now;
      if (!startOk || !endOk) continue;
      const existing = map.get(d.product_id);
      if (!existing || d.priority > existing.priority) map.set(d.product_id, d);
    }
    return map;
  }, [deals, now]);

  // Which products are eligible to show as Flash Deals rotates every 6 hours
  // (12AM / 6AM / 12PM / 6PM IST). The visible order inside that set reshuffles
  // every 2 hours. The manual reshuffle nonce lets admins re-randomize instantly.
  const flashSeed = flashWindowSeed(now) + rotationNonce;
  const orderSeed = orderWindowSeed(now) + rotationNonce;



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
      const live = p.id ? liveDealByProductId.get(p.id) ?? null : null;
      active.push({
        product: p,
        flashPrice: live ? live.flash_price : null,
        endAt: live ? live.end_at : null,
        dealId: live ? live.id : null,
        priority: live ? live.priority : 0,
      });
    }

    // Pick the eligible subset for this 6h window (max 10), then reshuffle that
    // subset's display order every 2h. Excluded eligible products keep their
    // Flash/Hot badges in the database but are hidden publicly until selected.
    const selected = seededShuffle(active, flashSeed).slice(0, FLASH_VISIBLE_MAX);
    const ordered = seededShuffle(selected, orderSeed);

    if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.info(`[FlashDeals] eligible: ${active.length} | visible this window: ${ordered.length} | excluded unavailable: ${excludedUnavailable} | flagged: ${totalFlagged}`);
      // eslint-disable-next-line no-console
      console.info("[FlashDeals] current display order:", ordered.map((i) => i.product.slug));
    }

    return ordered;
  }, [products, liveDealByProductId, flashSeed, orderSeed, now]);


  return { items, loading, now, products };
}
