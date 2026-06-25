import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Address & serviceability reliability analytics for the admin dashboard.
 *
 * Reads the soft-warning / block signals the address form already writes to
 * `analytics_events` (no schema changes) and derives the reporting metrics:
 *   - Top confirmed-unsupported PINs (the only hard blocks)
 *   - Top serviceability lookup failures
 *   - PIN/city mismatch frequency
 *   - Checkout completion after a warning
 *   - Payment completion after a warning
 *
 * RLS already restricts SELECT on analytics_events to admins/managers.
 */

type Row = {
  event: string;
  session_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type ServiceabilityAnalytics = {
  windowDays: number;
  totals: {
    pinCityWarnings: number;
    unknownPins: number;
    lookupFailures: number;
    unsupportedBlocks: number;
  };
  topUnsupportedPins: { key: string; count: number }[];
  topLookupFailures: { key: string; count: number }[];
  topUnknownPins: { key: string; count: number }[];
  // Conversion correlation among sessions that saw any soft warning.
  warnedSessions: number;
  checkoutAfterWarning: number;
  paymentAfterWarning: number;
  checkoutAfterWarningRate: number; // % of warned sessions that created an order
  paymentAfterWarningRate: number; // % of warned sessions that paid
};

const WARNING_EVENTS = ["pin_city_warning", "unknown_pin_entered", "serviceability_lookup_failed"];
const CHECKOUT_EVENTS = ["funnel_order_created", "purchase", "funnel_payment_success", "funnel_cod_order_placed"];
const PAYMENT_EVENTS = ["purchase", "funnel_payment_success", "funnel_cod_order_placed"];

const RELEVANT_EVENTS = [
  ...WARNING_EVENTS,
  "unsupported_pincode_blocked",
  ...CHECKOUT_EVENTS,
];

function topGroup(rows: Row[], event: string, metaKey: string, limit = 12) {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.event !== event) continue;
    const raw = (r.metadata?.[metaKey] ?? "") as unknown;
    const key = typeof raw === "string" && raw.trim() ? raw.trim() : "(unknown)";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function compute(rows: Row[], windowDays: number): ServiceabilityAnalytics {
  const count = (names: string[]) => rows.filter((r) => names.includes(r.event)).length;
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

  // Per-session correlation: which sessions saw a warning, and of those which
  // went on to create an order / complete payment.
  const warned = new Set<string>();
  const checkedOut = new Set<string>();
  const paid = new Set<string>();
  for (const r of rows) {
    const sid = r.session_id;
    if (!sid) continue;
    if (WARNING_EVENTS.includes(r.event)) warned.add(sid);
    if (CHECKOUT_EVENTS.includes(r.event)) checkedOut.add(sid);
    if (PAYMENT_EVENTS.includes(r.event)) paid.add(sid);
  }
  let checkoutAfterWarning = 0;
  let paymentAfterWarning = 0;
  for (const sid of warned) {
    if (checkedOut.has(sid)) checkoutAfterWarning++;
    if (paid.has(sid)) paymentAfterWarning++;
  }

  return {
    windowDays,
    totals: {
      pinCityWarnings: count(["pin_city_warning"]),
      unknownPins: count(["unknown_pin_entered"]),
      lookupFailures: count(["serviceability_lookup_failed"]),
      unsupportedBlocks: count(["unsupported_pincode_blocked"]),
    },
    topUnsupportedPins: topGroup(rows, "unsupported_pincode_blocked", "pincode"),
    topLookupFailures: topGroup(rows, "serviceability_lookup_failed", "pincode"),
    topUnknownPins: topGroup(rows, "unknown_pin_entered", "pincode"),
    warnedSessions: warned.size,
    checkoutAfterWarning,
    paymentAfterWarning,
    checkoutAfterWarningRate: pct(checkoutAfterWarning, warned.size),
    paymentAfterWarningRate: pct(paymentAfterWarning, warned.size),
  };
}

export function useServiceabilityAnalytics(windowDays = 30) {
  const [data, setData] = useState<ServiceabilityAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const since = new Date(Date.now() - windowDays * 86400000).toISOString();
      const { data: rows, error: err } = await supabase
        .from("analytics_events")
        .select("event,session_id,metadata,created_at")
        .in("event", RELEVANT_EVENTS)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(50000);
      if (err) throw err;
      setData(compute((rows ?? []) as Row[], windowDays));
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Failed to load analytics");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [windowDays]);

  useEffect(() => {
    void load();
  }, [load]);

  return useMemo(() => ({ data, loading, error, refresh: load }), [data, loading, error, load]);
}
