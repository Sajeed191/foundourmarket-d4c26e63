import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type StoreSettings = {
  cod_enabled: boolean;
  prepaid_discount_percent: number;
};

const DEFAULTS: StoreSettings = { cod_enabled: false, prepaid_discount_percent: 0 };

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
        .select("cod_enabled,prepaid_discount_percent")
        .limit(1)
        .maybeSingle();
      if (active && data) {
        setSettings({
          cod_enabled: !!data.cod_enabled,
          prepaid_discount_percent: Number(data.prepaid_discount_percent) || 0,
        });
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
            setSettings({
              cod_enabled: !!row.cod_enabled,
              prepaid_discount_percent: Number(row.prepaid_discount_percent) || 0,
            });
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
