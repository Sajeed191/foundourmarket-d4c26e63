import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProducts } from "@/lib/use-products";
import { useRegion, type Currency } from "@/lib/region";
import type { Product } from "@/lib/products";

export type PriceAlert = {
  id: string;
  product_slug: string;
  target_price: number;
  currency: Currency;
  status: "active" | "triggered" | "cancelled";
  last_price: number | null;
  created_at: string;
  triggered_at: string | null;
};

export type RestockAlert = {
  id: string;
  product_slug: string;
  status: "active" | "notified" | "cancelled";
  created_at: string;
  notified_at: string | null;
};

type Ctx = {
  priceAlerts: PriceAlert[];
  restockAlerts: RestockAlert[];
  priceAlertsFor: (slug: string) => PriceAlert[];
  hasRestock: (slug: string) => boolean;
  addPriceAlert: (slug: string, target: number) => Promise<void>;
  removePriceAlert: (id: string) => Promise<void>;
  toggleRestock: (slug: string) => Promise<void>;
  stats: { active: number; triggered: number; tracking: number; restock: number };
  loading: boolean;
};

const WishlistAlertsContext = createContext<Ctx | null>(null);

/** Currency-specific admin price (mirrors region.priceOf, currency-agnostic). */
export function priceForCurrency(p: Product, currency: Currency): number {
  return currency === "INR" ? p.priceInr ?? 0 : p.priceUsd ?? p.price ?? 0;
}

function money(amount: number, currency: Currency): string {
  return currency === "INR"
    ? `₹${Math.round(amount).toLocaleString("en-IN")}`
    : `$${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function WishlistAlertsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { products } = useProducts();
  const { currency } = useRegion();

  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
  const [restockAlerts, setRestockAlerts] = useState<RestockAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const evaluatedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setPriceAlerts([]);
      setRestockAlerts([]);
      return;
    }
    setLoading(true);
    const [pa, ra] = await Promise.all([
      supabase
        .from("wishlist_price_alerts")
        .select("id,product_slug,target_price,currency,status,last_price,created_at,triggered_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("wishlist_restock_alerts")
        .select("id,product_slug,status,created_at,notified_at")
        .order("created_at", { ascending: false }),
    ]);
    setPriceAlerts((pa.data ?? []) as PriceAlert[]);
    setRestockAlerts((ra.data ?? []) as RestockAlert[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime sync for this user's alerts.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`wishlist-alerts-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wishlist_price_alerts", filter: `user_id=eq.${user.id}` },
        () => refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wishlist_restock_alerts", filter: `user_id=eq.${user.id}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, refresh]);

  // On-load monitor: evaluate active alerts against live product data, fire
  // notifications into the shared inbox, and flip alert status. Runs once per
  // products+alerts settle to avoid polling loops or duplicate notifications.
  useEffect(() => {
    if (!user || products.length === 0) return;
    if (priceAlerts.length === 0 && restockAlerts.length === 0) return;
    if (evaluatedRef.current) return;
    evaluatedRef.current = true;

    const bySlug = new Map(products.map((p) => [p.slug, p]));

    (async () => {
      const notifications: {
        user_id: string;
        type: string;
        title: string;
        body: string;
        link: string;
        data: Record<string, unknown>;
        priority: string;
      }[] = [];

      // Price drops
      for (const a of priceAlerts) {
        if (a.status !== "active") continue;
        const p = bySlug.get(a.product_slug);
        if (!p) continue;
        const cur = priceForCurrency(p, a.currency);
        if (cur > 0 && cur <= a.target_price) {
          await supabase
            .from("wishlist_price_alerts")
            .update({ status: "triggered", triggered_at: new Date().toISOString(), last_price: cur })
            .eq("id", a.id);
          notifications.push({
            user_id: user.id,
            type: "price_drop",
            title: "🔥 Price dropped",
            body: `${p.name} is now ${money(cur, a.currency)} — at or below your target of ${money(a.target_price, a.currency)}.`,
            link: `/products/${p.slug}`,
            data: { product_slug: p.slug, price: cur, target: a.target_price },
            priority: "high",
          });
          await supabase.from("wishlist_activity_logs").insert({
            user_id: user.id,
            action: "price_alert_triggered",
            product_slug: p.slug,
            metadata: { price: cur, target: a.target_price, currency: a.currency },
          });
        }
      }

      // Restocks
      for (const a of restockAlerts) {
        if (a.status !== "active") continue;
        const p = bySlug.get(a.product_slug);
        if (!p) continue;
        if (p.inStock) {
          await supabase
            .from("wishlist_restock_alerts")
            .update({ status: "notified", notified_at: new Date().toISOString() })
            .eq("id", a.id);
          notifications.push({
            user_id: user.id,
            type: "back_in_stock",
            title: "✅ Back in stock",
            body: `${p.name} is available again. Grab it before it sells out.`,
            link: `/products/${p.slug}`,
            data: { product_slug: p.slug },
            priority: "high",
          });
          await supabase.from("wishlist_activity_logs").insert({
            user_id: user.id,
            action: "restock_alert_triggered",
            product_slug: p.slug,
          });
        }
      }

      if (notifications.length) {
        await supabase.from("notifications").insert(notifications as never);
        await refresh();
      }
    })().catch(() => {
      /* swallow — monitoring is best-effort */
    });
  }, [user, products, priceAlerts, restockAlerts, refresh]);

  const priceAlertsFor = useCallback(
    (slug: string) => priceAlerts.filter((a) => a.product_slug === slug && a.status !== "cancelled"),
    [priceAlerts],
  );

  const hasRestock = useCallback(
    (slug: string) =>
      restockAlerts.some((a) => a.product_slug === slug && a.status === "active"),
    [restockAlerts],
  );

  const addPriceAlert = useCallback(
    async (slug: string, target: number) => {
      if (!user || !(target > 0)) return;
      await supabase
        .from("wishlist_price_alerts")
        .upsert(
          {
            user_id: user.id,
            product_slug: slug,
            target_price: target,
            currency,
            status: "active",
            triggered_at: null,
          },
          { onConflict: "user_id,product_slug,currency,target_price" },
        );
      await supabase.from("wishlist_activity_logs").insert({
        user_id: user.id,
        action: "price_alert_created",
        product_slug: slug,
        metadata: { target, currency },
      });
      await refresh();
    },
    [user, currency, refresh],
  );

  const removePriceAlert = useCallback(
    async (id: string) => {
      if (!user) return;
      await supabase.from("wishlist_price_alerts").delete().eq("id", id);
      await refresh();
    },
    [user, refresh],
  );

  const toggleRestock = useCallback(
    async (slug: string) => {
      if (!user) return;
      const existing = restockAlerts.find((a) => a.product_slug === slug);
      if (existing && existing.status === "active") {
        await supabase.from("wishlist_restock_alerts").delete().eq("id", existing.id);
      } else {
        await supabase.from("wishlist_restock_alerts").upsert(
          {
            user_id: user.id,
            product_slug: slug,
            status: "active",
            notified_at: null,
          },
          { onConflict: "user_id,product_slug" },
        );
        await supabase.from("wishlist_activity_logs").insert({
          user_id: user.id,
          action: "restock_alert_created",
          product_slug: slug,
        });
      }
      await refresh();
    },
    [user, restockAlerts, refresh],
  );

  const stats = useMemo(() => {
    const active = priceAlerts.filter((a) => a.status === "active").length;
    const triggered = priceAlerts.filter((a) => a.status === "triggered").length;
    const tracking = new Set(
      priceAlerts.filter((a) => a.status !== "cancelled").map((a) => a.product_slug),
    ).size;
    const restock = restockAlerts.filter((a) => a.status === "active").length;
    return { active, triggered, tracking, restock };
  }, [priceAlerts, restockAlerts]);

  const value: Ctx = {
    priceAlerts,
    restockAlerts,
    priceAlertsFor,
    hasRestock,
    addPriceAlert,
    removePriceAlert,
    toggleRestock,
    stats,
    loading,
  };

  return (
    <WishlistAlertsContext.Provider value={value}>{children}</WishlistAlertsContext.Provider>
  );
}

export function useWishlistAlerts() {
  const ctx = useContext(WishlistAlertsContext);
  if (!ctx) throw new Error("useWishlistAlerts must be inside WishlistAlertsProvider");
  return ctx;
}
