import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CheckoutFailureCategory } from "@/lib/checkout-logger";

/**
 * Checkout Funnel dashboard data (read-only).
 *
 * Reads the `funnel_*` + payment events already written to `analytics_events`
 * by the storefront checkout logger — no schema changes, no checkout-logic
 * changes. Derives, for a chosen window (24h / 7d / 30d):
 *   - per-step funnel volumes
 *   - failure breakdown by category (count · % · trend vs previous window)
 *   - top raw failure reasons
 *
 * RLS already restricts SELECT on analytics_events to admins/managers.
 */

type Row = {
  event: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export const FAILURE_CATEGORIES: CheckoutFailureCategory[] = [
  "SDK",
  "Network",
  "Gateway",
  "Validation",
  "Authentication",
  "Stock",
  "Other",
];

export type FunnelStep = { key: string; label: string; count: number };

export type CategoryStat = {
  category: CheckoutFailureCategory;
  count: number;
  percentage: number; // share of all failures in window
  trend: number; // % change vs previous equal-length window (rounded)
};

export type ReasonRow = { reason: string; category: string; count: number };

export type FunnelWindow = {
  windowHours: number;
  steps: FunnelStep[];
  totalFailures: number;
  categories: CategoryStat[];
  topReasons: ReasonRow[];
};

// All events we read once and slice locally by timestamp.
const RELEVANT_EVENTS = [
  "checkout_started",
  "funnel_proceed_to_checkout",
  "address_selected",
  "funnel_address_submitted",
  "funnel_order_created",
  "funnel_payment_initialized",
  "payment_methods_shown",
  "purchase",
  "funnel_payment_success",
  "funnel_cod_order_placed",
  "payment_failed",
  "funnel_payment_failed",
  "funnel_payment_init_failed",
  "funnel_order_create_failed",
  "funnel_cod_order_failed",
  "funnel_payment_cancelled",
];

const FAILURE_EVENTS = new Set([
  "payment_failed",
  "funnel_payment_failed",
  "funnel_payment_init_failed",
  "funnel_order_create_failed",
  "funnel_cod_order_failed",
]);

const STEP_DEFS: { key: string; label: string; events: string[] }[] = [
  { key: "started", label: "Checkout Started", events: ["funnel_proceed_to_checkout", "checkout_started"] },
  { key: "address", label: "Address Submitted", events: ["funnel_address_submitted", "address_selected"] },
  { key: "order", label: "Order Created", events: ["funnel_order_created"] },
  { key: "init", label: "Payment Initialized", events: ["funnel_payment_initialized"] },
  { key: "opened", label: "Payment Opened", events: ["payment_methods_shown"] },
  { key: "success", label: "Payment Success", events: ["funnel_payment_success", "purchase"] },
  { key: "cod", label: "COD Success", events: ["funnel_cod_order_placed"] },
  { key: "failed", label: "Payment Failed", events: ["funnel_payment_failed", "payment_failed"] },
  { key: "cancelled", label: "Payment Cancelled", events: ["funnel_payment_cancelled"] },
];

function normalizeCategory(raw: unknown): CheckoutFailureCategory {
  const v = typeof raw === "string" ? raw.trim() : "";
  return (FAILURE_CATEGORIES as string[]).includes(v) ? (v as CheckoutFailureCategory) : "Other";
}

function reasonOf(meta: Record<string, unknown> | null): string {
  const r =
    (meta?.reason as string | undefined) ??
    (meta?.error as string | undefined) ??
    (meta?.code as string | undefined) ??
    "";
  const s = typeof r === "string" ? r.trim() : "";
  if (!s) return "(unspecified)";
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
}

function trendPct(curr: number, prev: number): number {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return Math.round(((curr - prev) / prev) * 100);
}

function buildWindow(rows: Row[], windowHours: number): FunnelWindow {
  const now = Date.now();
  const start = now - windowHours * 3600000;
  const prevStart = start - windowHours * 3600000;

  const inWindow = (r: Row, from: number, to: number) => {
    const t = new Date(r.created_at).getTime();
    return t >= from && t < to;
  };

  const curr = rows.filter((r) => inWindow(r, start, now));
  const prev = rows.filter((r) => inWindow(r, prevStart, start));

  const steps: FunnelStep[] = STEP_DEFS.map((s) => ({
    key: s.key,
    label: s.label,
    count: curr.filter((r) => s.events.includes(r.event)).length,
  }));

  const currFailures = curr.filter((r) => FAILURE_EVENTS.has(r.event));
  const prevFailures = prev.filter((r) => FAILURE_EVENTS.has(r.event));
  const totalFailures = currFailures.length;

  const currByCat = new Map<CheckoutFailureCategory, number>();
  const prevByCat = new Map<CheckoutFailureCategory, number>();
  for (const r of currFailures) {
    const c = normalizeCategory(r.metadata?.category);
    currByCat.set(c, (currByCat.get(c) ?? 0) + 1);
  }
  for (const r of prevFailures) {
    const c = normalizeCategory(r.metadata?.category);
    prevByCat.set(c, (prevByCat.get(c) ?? 0) + 1);
  }

  const categories: CategoryStat[] = FAILURE_CATEGORIES.map((category) => {
    const count = currByCat.get(category) ?? 0;
    const prevCount = prevByCat.get(category) ?? 0;
    return {
      category,
      count,
      percentage: totalFailures > 0 ? Math.round((count / totalFailures) * 100) : 0,
      trend: trendPct(count, prevCount),
    };
  }).sort((a, b) => b.count - a.count);

  const reasonMap = new Map<string, { category: string; count: number }>();
  for (const r of currFailures) {
    const reason = reasonOf(r.metadata);
    const category = normalizeCategory(r.metadata?.category);
    const k = `${reason}::${category}`;
    const existing = reasonMap.get(k);
    if (existing) existing.count += 1;
    else reasonMap.set(k, { category, count: 1 });
  }
  const topReasons: ReasonRow[] = [...reasonMap.entries()]
    .map(([k, v]) => ({ reason: k.split("::")[0], category: v.category, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return { windowHours, steps, totalFailures, categories, topReasons };
}

export type CheckoutFunnelData = {
  last24h: FunnelWindow;
  last7d: FunnelWindow;
  last30d: FunnelWindow;
};

export function useCheckoutFunnel() {
  const [data, setData] = useState<CheckoutFunnelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 60 days covers the 30-day window plus its previous-window trend baseline.
      const since = new Date(Date.now() - 60 * 86400000).toISOString();
      const { data: rows, error: err } = await supabase
        .from("analytics_events")
        .select("event,metadata,created_at")
        .in("event", RELEVANT_EVENTS)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(100000);
      if (err) throw err;
      const r = (rows ?? []) as Row[];
      setData({
        last24h: buildWindow(r, 24),
        last7d: buildWindow(r, 24 * 7),
        last30d: buildWindow(r, 24 * 30),
      });
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Failed to load funnel analytics");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return useMemo(() => ({ data, loading, error, refresh: load }), [data, loading, error, load]);
}
