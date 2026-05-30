import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchTrafficIntelligence, type TrafficIntelligence } from "@/lib/traffic-intelligence";

/**
 * Live traffic intelligence hook.
 * - Full recompute when `days` changes.
 * - Lightweight realtime refresh on new page_views / analytics_events (debounced).
 * - 20s poll fallback so the live war-room stays fresh even without realtime.
 */
export function useTrafficIntelligence(days: number) {
  const [data, setData] = useState<TrafficIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetchTrafficIntelligence(days);
      if (mounted.current) setData(res);
    } finally {
      if (mounted.current) { setLoading(false); setRefreshing(false); }
    }
  }, [days]);

  useEffect(() => {
    mounted.current = true;
    load(false);
    return () => { mounted.current = false; };
  }, [load]);

  // realtime: debounce a silent refresh on any new traffic row
  useEffect(() => {
    const trigger = () => {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => load(true), 2500);
    };
    const suffix = Math.random().toString(36).slice(2, 8);
    const ch = supabase
      .channel(`traffic-intel-${suffix}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "page_views" }, trigger)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "analytics_events" }, trigger)
      .on("postgres_changes", { event: "*", schema: "public", table: "visitor_sessions" }, trigger)
      .subscribe();
    const poll = setInterval(() => load(true), 20000);
    return () => { void supabase.removeChannel(ch); clearInterval(poll); if (debounce.current) clearTimeout(debounce.current); };
  }, [load]);

  return { data, loading, refreshing, refresh: () => load(true) };
}
