import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchOrderOps, type OrderOps } from "@/lib/order-operations";

/**
 * Live Order Operations hook.
 * - Loads the role-gated `admin_order_operations` RPC.
 * - Realtime: silent refresh on orders / shipments / returns / refunds / support changes.
 * - 30s poll fallback.
 */
export function useOrderOperations(limit = 400) {
  const [data, setData] = useState<OrderOps | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetchOrderOps(limit);
      if (mounted.current) { setData(res); setError(null); }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (mounted.current) { setLoading(false); setRefreshing(false); }
    }
  }, [limit]);

  useEffect(() => {
    mounted.current = true;
    load(false);
    return () => { mounted.current = false; };
  }, [load]);

  useEffect(() => {
    const trigger = () => {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => load(true), 3000);
    };
    const suffix = Math.random().toString(36).slice(2, 8);
    const ch = supabase
      .channel(`order-ops-${suffix}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, trigger)
      .on("postgres_changes", { event: "*", schema: "public", table: "shipments" }, trigger)
      .on("postgres_changes", { event: "*", schema: "public", table: "returns" }, trigger)
      .on("postgres_changes", { event: "*", schema: "public", table: "refunds" }, trigger)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, trigger)
      .subscribe();
    const poll = setInterval(() => load(true), 30000);
    return () => { void supabase.removeChannel(ch); clearInterval(poll); if (debounce.current) clearTimeout(debounce.current); };
  }, [load]);

  return { data, loading, refreshing, error, refresh: () => load(true) };
}
