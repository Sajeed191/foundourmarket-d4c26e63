import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFinancialMarketing } from "@/lib/use-financial-marketing";
import {
  computeExecutiveModel, fetchTodaySnapshot, fetchExecutiveTimeline,
  type ExecutiveModel, type TodaySnapshot, type TimelineEvent,
} from "@/lib/executive-intelligence";

/**
 * Realtime executive intelligence hook. Composes the shared financial /
 * marketing / customer / inventory model with a today snapshot and a unified
 * activity timeline. All figures are database-backed and update instantly.
 */
export function useExecutiveIntelligence() {
  const { data, loading } = useFinancialMarketing(365);
  const [today, setToday] = useState<TodaySnapshot | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [t, tl] = await Promise.all([fetchTodaySnapshot(), fetchExecutiveTimeline(40)]);
      if (!alive) return;
      setToday(t);
      setTimeline(tl);
    };
    load();
    const ch = supabase
      .channel(`exec-intel-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "returns" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "marketing_campaigns" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_activity_logs" }, load)
      .subscribe();
    const poll = setInterval(load, 60_000);
    return () => { alive = false; supabase.removeChannel(ch); clearInterval(poll); };
  }, []);

  const model: ExecutiveModel | null = useMemo(() => (data ? computeExecutiveModel(data) : null), [data]);

  return {
    model,
    today,
    timeline,
    loading: loading || !model,
    currency: data?.financial.currency ?? "USD",
  };
}
