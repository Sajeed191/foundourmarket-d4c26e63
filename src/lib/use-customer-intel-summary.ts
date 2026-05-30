import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchCustomerIntel, buildCustomerIntel, computeHealth,
  type HealthOverview,
} from "@/lib/customer-intelligence";

/**
 * Lightweight, module-cached summary of Customer Intelligence health counts.
 * Used for sidebar/toolbar badges so the heavy intel fetch runs at most once
 * per TTL window across every admin surface that mounts this hook.
 * Realtime-aware: invalidates the cache on order/profile changes.
 */
const TTL = 5 * 60 * 1000; // 5 minutes

let cache: { at: number; data: HealthOverview } | null = null;
let inflight: Promise<HealthOverview> | null = null;
const subscribers = new Set<(h: HealthOverview) => void>();
let channelBound = false;

async function compute(): Promise<HealthOverview> {
  const data = await fetchCustomerIntel();
  const health = computeHealth(buildCustomerIntel(data));
  cache = { at: Date.now(), data: health };
  subscribers.forEach((fn) => fn(health));
  return health;
}

function getSummary(force = false): Promise<HealthOverview> {
  if (!force && cache && Date.now() - cache.at < TTL) return Promise.resolve(cache.data);
  if (inflight) return inflight;
  inflight = compute().finally(() => { inflight = null; });
  return inflight;
}

function bindRealtime() {
  if (channelBound) return;
  channelBound = true;
  supabase
    .channel("cust-intel-summary")
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => { cache = null; if (subscribers.size) getSummary(true); })
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => { cache = null; if (subscribers.size) getSummary(true); })
    .subscribe();
}

export function useCustomerIntelSummary(enabled = true) {
  const [summary, setSummary] = useState<HealthOverview | null>(cache?.data ?? null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const update = (h: HealthOverview) => { if (active) setSummary(h); };
    subscribers.add(update);
    bindRealtime();
    getSummary().then(update).catch(() => {});
    return () => { active = false; subscribers.delete(update); };
  }, [enabled]);

  return summary;
}
