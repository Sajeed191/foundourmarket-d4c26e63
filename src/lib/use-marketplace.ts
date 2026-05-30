import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type MarketplaceSettings = Tables<"marketplace_settings">;
export type Vendor = Tables<"vendors">;
export type VendorProduct = Tables<"vendor_products">;
export type VendorAnalytics = Tables<"vendor_analytics">;
export type VendorCommission = Tables<"vendor_commissions">;
export type VendorPayout = Tables<"vendor_payouts">;
export type VendorSupportTicket = Tables<"vendor_support_tickets">;

export type MarketplaceData = {
  settings: MarketplaceSettings | null;
  vendors: Vendor[];
  products: VendorProduct[];
  analytics: VendorAnalytics[];
  commissions: VendorCommission[];
  payouts: VendorPayout[];
  tickets: VendorSupportTicket[];
};

const EMPTY: MarketplaceData = {
  settings: null,
  vendors: [],
  products: [],
  analytics: [],
  commissions: [],
  payouts: [],
  tickets: [],
};

/**
 * Dormant multi-vendor marketplace data layer.
 * All tables are RLS-protected to super_admins only — non-super-admins
 * receive empty results and the toggle calls fail silently at the DB layer.
 */
export function useMarketplace(enabled = true) {
  const [data, setData] = useState<MarketplaceData>(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!enabled) return;
    const [settings, vendors, products, analytics, commissions, payouts, tickets] =
      await Promise.all([
        supabase.from("marketplace_settings").select("*").limit(1).maybeSingle(),
        supabase.from("vendors").select("*").order("created_at", { ascending: false }).limit(1000),
        supabase.from("vendor_products").select("*").limit(1000),
        supabase.from("vendor_analytics").select("*").order("day", { ascending: false }).limit(1000),
        supabase.from("vendor_commissions").select("*").order("created_at", { ascending: false }).limit(1000),
        supabase.from("vendor_payouts").select("*").order("created_at", { ascending: false }).limit(1000),
        supabase.from("vendor_support_tickets").select("*").order("created_at", { ascending: false }).limit(1000),
      ]);
    setData({
      settings: settings.data ?? null,
      vendors: vendors.data ?? [],
      products: products.data ?? [],
      analytics: analytics.data ?? [],
      commissions: commissions.data ?? [],
      payouts: payouts.data ?? [],
      tickets: tickets.data ?? [],
    });
    setLoading(false);
  }, [enabled]);

  useEffect(() => { load(); }, [load]);

  // Realtime sync across all marketplace tables
  useEffect(() => {
    if (!enabled) return;
    const ch = supabase
      .channel("admin-marketplace-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "marketplace_settings" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "vendors" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "vendor_products" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "vendor_analytics" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "vendor_commissions" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "vendor_payouts" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "vendor_support_tickets" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [enabled, load]);

  const setMarketplaceEnabled = useCallback(async (next: boolean) => {
    if (!data.settings) return { error: new Error("Marketplace not initialized") };
    const { error } = await supabase
      .from("marketplace_settings")
      .update({ enabled: next })
      .eq("id", data.settings.id);
    if (!error) await load();
    return { error };
  }, [data.settings, load]);

  return { ...data, loading, reload: load, setMarketplaceEnabled };
}
