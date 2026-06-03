import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PaymentMode = "sandbox" | "production";
export type GatewayRegion = "india" | "international" | "all";

export type PaymentGateway = {
  provider: string;
  display_name: string;
  enabled: boolean;
  mode: PaymentMode;
  publishable_key_present: boolean;
  secret_key_present: boolean;
  webhook_configured: boolean;
  supports_region: GatewayRegion;
  configured: boolean;
  last_checked_at: string | null;
  updated_at: string;
};

function normalize(row: Record<string, any>): PaymentGateway {
  return {
    provider: row.provider,
    display_name: row.display_name ?? row.provider,
    enabled: !!row.enabled,
    mode: (row.mode === "production" ? "production" : "sandbox") as PaymentMode,
    publishable_key_present: !!row.publishable_key_present,
    secret_key_present: !!row.secret_key_present,
    webhook_configured: !!row.webhook_configured,
    supports_region: (row.supports_region ?? "international") as GatewayRegion,
    configured: !!row.configured,
    last_checked_at: row.last_checked_at ?? null,
    updated_at: row.updated_at,
  };
}

/** A gateway is "live" when it's enabled AND its keys are configured. */
export function isGatewayLive(g: PaymentGateway): boolean {
  return g.enabled && g.configured;
}

/** Missing-configuration warnings for an admin status center. */
export function gatewayWarnings(g: PaymentGateway): string[] {
  const out: string[] = [];
  if (!g.publishable_key_present) out.push("Publishable/client key missing");
  if (!g.secret_key_present) out.push("Secret key missing");
  if (!g.webhook_configured) out.push("Webhook not configured");
  if (g.configured && !g.enabled) out.push("Keys present but gateway is disabled");
  return out;
}

/**
 * Live payment-gateway registry. Public read via RLS, streamed in realtime so
 * checkout unlocks the instant a gateway is connected — no code changes needed.
 */
export function usePaymentGateways(adminFull = false) {
  const [gateways, setGateways] = useState<PaymentGateway[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const table = (adminFull ? "payment_gateways" : "payment_gateways_public") as "payment_gateways";
      const { data } = await supabase
        .from(table)
        .select("*")
        .order("provider", { ascending: true });
      if (active) {
        if (data) setGateways(data.map(normalize));
        setLoading(false);
      }
    };
    load();

    // The payment-gateways-live realtime channel is staff-only. Customers read
    // initial status from the public view and don't subscribe to live updates.
    if (!adminFull) {
      return () => {
        active = false;
      };
    }

    const channel = supabase
      .channel("payment-gateways-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payment_gateways" },
        () => load(),
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [adminFull]);

  const internationalLive = gateways.some(
    (g) =>
      isGatewayLive(g) &&
      (g.supports_region === "international" || g.supports_region === "all"),
  );

  return { gateways, loading, internationalLive };
}
