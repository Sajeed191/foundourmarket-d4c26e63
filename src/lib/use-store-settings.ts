import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type StoreSettings = {
  cod_enabled: boolean;
  prepaid_discount_percent: number;
  shipping_mode: "free" | "flat" | "region" | "product" | "category";
  free_shipping_enabled: boolean;
  flat_shipping_inr: number;
  flat_shipping_usd: number;
  free_shipping_threshold_inr: number | null;
  free_shipping_threshold_usd: number | null;
};

const DEFAULTS: StoreSettings = {
  cod_enabled: false,
  prepaid_discount_percent: 0,
  shipping_mode: "product",
  free_shipping_enabled: false,
  flat_shipping_inr: 0,
  flat_shipping_usd: 0,
  free_shipping_threshold_inr: null,
  free_shipping_threshold_usd: null,
};

/**
 * Live store settings (COD toggle, prepaid discount).
 * Public read via RLS; updates stream in realtime so checkout reflects
 * admin changes instantly.
 */
export function useStoreSettings() {
  const [settings, setSettings] = useState<StoreSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase
        .from("store_settings")
        .select("cod_enabled,prepaid_discount_percent,shipping_mode,free_shipping_enabled,flat_shipping_inr,flat_shipping_usd,free_shipping_threshold_inr,free_shipping_threshold_usd")
        .limit(1)
        .maybeSingle();
      if (active && data) {
        setSettings(normalizeSettings(data));
      }
      if (active) setLoading(false);
    };
    load();

    const channel = supabase
      .channel("store-settings-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "store_settings" },
        (payload) => {
          const row = payload.new as Partial<StoreSettings> | null;
          if (row) {
            setSettings(normalizeSettings(row));
          }
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return { settings, loading };
}

function normalizeSettings(row: Record<string, unknown>): StoreSettings {
  const mode = row.shipping_mode;
  return {
    cod_enabled: !!row.cod_enabled,
    prepaid_discount_percent: Number(row.prepaid_discount_percent) || 0,
    shipping_mode:
      mode === "free" || mode === "flat" || mode === "region" || mode === "product" || mode === "category"
        ? mode
        : "product",
    free_shipping_enabled: !!row.free_shipping_enabled,
    flat_shipping_inr: Number(row.flat_shipping_inr) || 0,
    flat_shipping_usd: Number(row.flat_shipping_usd) || 0,
    free_shipping_threshold_inr: row.free_shipping_threshold_inr == null ? null : Number(row.free_shipping_threshold_inr),
    free_shipping_threshold_usd: row.free_shipping_threshold_usd == null ? null : Number(row.free_shipping_threshold_usd),
  };
}
