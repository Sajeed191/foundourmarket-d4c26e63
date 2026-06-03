import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SupportStatusMode = "auto" | "online" | "high_volume";

export type SupportSettings = {
  supportStatus: SupportStatusMode;
  responseMinutes: number;
  whatsappNumbers: string[];
};

export const DEFAULT_SUPPORT_SETTINGS: SupportSettings = {
  supportStatus: "auto",
  responseMinutes: 8,
  whatsappNumbers: [],
};

function normalize(row: Record<string, unknown> | null): SupportSettings {
  if (!row) return DEFAULT_SUPPORT_SETTINGS;
  const status = row.support_status;
  const nums = Array.isArray(row.support_whatsapp_numbers)
    ? (row.support_whatsapp_numbers as string[]).filter((n) => typeof n === "string" && n.trim())
    : DEFAULT_SUPPORT_SETTINGS.whatsappNumbers;
  return {
    supportStatus:
      status === "online" || status === "high_volume" || status === "auto"
        ? (status as SupportStatusMode)
        : "auto",
    responseMinutes: Number(row.support_response_minutes) || DEFAULT_SUPPORT_SETTINGS.responseMinutes,
    whatsappNumbers: nums.length ? nums : DEFAULT_SUPPORT_SETTINGS.whatsappNumbers,
  };
}



/**
 * Live support-channel settings (status banner, response time, WhatsApp
 * numbers). Public read via RLS; admin edits stream in realtime so the Help
 * Center reflects changes instantly.
 */
export function useSupportSettings() {
  const [settings, setSettings] = useState<SupportSettings>(DEFAULT_SUPPORT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      // Status & response time are public; WhatsApp numbers are only readable
      // by signed-in users (base table requires authentication).
      const { data: pub } = await supabase.from("store_settings_public")
        .select("support_status,support_response_minutes").limit(1).maybeSingle();
      const { data: { user } } = await supabase.auth.getUser();
      let nums: unknown = undefined;
      if (user) {
        const { data: priv } = await supabase.from("store_settings")
          .select("support_whatsapp_numbers").limit(1).maybeSingle();
        nums = priv?.support_whatsapp_numbers;
      }
      if (active && (pub || nums)) setSettings(normalize({ ...(pub ?? {}), support_whatsapp_numbers: nums }));
      if (active) setLoading(false);
    };
    void load();

    const channel = supabase
      .channel(`support-settings-live-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "store_settings" }, (payload) => {
        const row = payload.new as Record<string, unknown> | null;
        if (row) setSettings(normalize(row));
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return { settings, loading };
}

/** Resolve the effective live status (auto mode derives from local time). */
export function resolveSupportStatus(s: SupportSettings): { online: boolean; minutes: number } {
  if (s.supportStatus === "online") return { online: true, minutes: s.responseMinutes };
  if (s.supportStatus === "high_volume") return { online: false, minutes: s.responseMinutes };
  // auto: evening peak (18:00–22:00) counts as high volume
  const h = new Date().getHours();
  const peak = h >= 18 && h <= 22;
  return { online: !peak, minutes: s.responseMinutes };
}

/** Admin-only update (RLS enforces admin / super_admin). */
export async function updateSupportSettings(patch: Partial<{
  support_status: SupportStatusMode;
  support_response_minutes: number;
  support_whatsapp_numbers: string[];
}>): Promise<void> {
  const { error } = await supabase.from("store_settings").update(patch).eq("id", true);
  if (error) throw new Error(error.message);
}
