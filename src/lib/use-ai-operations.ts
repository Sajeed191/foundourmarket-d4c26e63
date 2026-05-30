import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { logActivity } from "@/components/admin/AdminShell";
import { useExecutiveIntelligence } from "@/lib/use-executive-intelligence";
import { useFinancialMarketing } from "@/lib/use-financial-marketing";
import {
  buildAIRecommendations, buildDailyBriefing, buildWeeklyReport,
  rankByFeedback,
  type AIRecommendation, type FeedbackVote, type FeedbackTally,
} from "@/lib/ai-operations";

export type RecStatus = "pending" | "approved" | "rejected" | "snoozed" | "archived" | "executed";

export type RecState = {
  rec_key: string;
  title: string | null;
  category: string | null;
  priority: string | null;
  status: RecStatus;
  snooze_until: string | null;
  assigned_to: string | null;
  outcome: string | null;
  outcome_value: number | null;
  executed_at: string | null;
  revenue_impact: number | null;
  profit_impact: number | null;
  conversion_impact: number | null;
  inventory_impact: number | null;
  customer_impact: number | null;
  success_score: number | null;
};

const HIDDEN: RecStatus[] = ["rejected", "archived", "executed"];

/**
 * Realtime AI Commerce Operations hook. Continuously derives prioritized
 * recommendations from live executive + financial intelligence and merges
 * them with persisted lifecycle state (approve / reject / snooze / assign /
 * archive / execute / outcome) plus an admin feedback loop used to rank
 * future recommendations. Every state change is database-backed and audited.
 */
export function useAIOperations() {
  const { user } = useAuth();
  const { model, today, loading: execLoading, currency } = useExecutiveIntelligence();
  const { model: fm } = useFinancialMarketing(365);

  // Single source-data timestamp for the current intelligence snapshot.
  const [generatedAt, setGeneratedAt] = useState<string>(() => new Date().toISOString());
  useEffect(() => {
    if (!execLoading) setGeneratedAt(new Date().toISOString());
  }, [execLoading, model, fm]);

  const allRecs = useMemo(() => buildAIRecommendations(model, fm), [model, fm]);
  const [states, setStates] = useState<Record<string, RecState>>({});
  const [feedback, setFeedback] = useState<Record<string, FeedbackTally>>({});
  const [myVotes, setMyVotes] = useState<Record<string, FeedbackVote>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const loggedRef = useRef(false);

  // Load persisted lifecycle state + realtime subscription
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await supabase
        .from("ai_recommendations")
        .select("rec_key,title,category,priority,status,snooze_until,assigned_to,outcome,outcome_value,executed_at,revenue_impact,profit_impact,conversion_impact,inventory_impact,customer_impact,success_score");
      if (!alive || !data) return;
      const map: Record<string, RecState> = {};
      for (const r of data as RecState[]) map[r.rec_key] = r;
      setStates(map);
    };
    load();
    const ch = supabase
      .channel(`ai-ops-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_recommendations" }, load)
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, []);

  // Load feedback tallies + my votes + realtime subscription
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await supabase
        .from("ai_recommendation_feedback")
        .select("rec_key,vote,user_id");
      if (!alive || !data) return;
      const tally: Record<string, FeedbackTally> = {};
      const mine: Record<string, FeedbackVote> = {};
      for (const f of data as { rec_key: string; vote: FeedbackVote; user_id: string }[]) {
        const t = (tally[f.rec_key] ??= { helpful: 0, not_helpful: 0, incorrect: 0, already_handled: 0 });
        if (t[f.vote] !== undefined) t[f.vote] += 1;
        if (f.user_id === user?.id) mine[f.rec_key] = f.vote;
      }
      setFeedback(tally);
      setMyVotes(mine);
    };
    load();
    const ch = supabase
      .channel(`ai-fb-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_recommendation_feedback" }, load)
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [user?.id]);

  // Audit: recommendations generated (once per session load)
  useEffect(() => {
    if (loggedRef.current || execLoading || allRecs.length === 0) return;
    loggedRef.current = true;
    logActivity("ai_recommendation_generated", "ai_operations", undefined, { count: allRecs.length });
  }, [execLoading, allRecs.length]);

  const stateFor = useCallback((key: string): RecState | undefined => states[key], [states]);

  // Active list: hide rejected/archived/executed, not-yet-due snoozed, and
  // "already handled" feedback. Then rank by feedback signal.
  const active = useMemo(() => {
    const now = Date.now();
    const filtered = allRecs.filter((r) => {
      const st = states[r.key];
      if (st) {
        if (HIDDEN.includes(st.status)) return false;
        if (st.status === "snoozed" && st.snooze_until && +new Date(st.snooze_until) > now) return false;
      }
      const tally = feedback[r.key];
      if (tally && tally.already_handled > 0) return false;
      return true;
    });
    return rankByFeedback(filtered, feedback);
  }, [allRecs, states, feedback]);

  // Executed recommendations with outcomes (best / failed performers)
  const executed = useMemo(() => {
    return Object.values(states)
      .filter((s) => s.status === "executed")
      .sort((a, b) => (b.success_score ?? 0) - (a.success_score ?? 0));
  }, [states]);

  const briefing = useMemo(() => buildDailyBriefing(model, today, active, currency), [model, today, active, currency]);
  const weekly = useMemo(() => buildWeeklyReport(model, active, currency), [model, active, currency]);

  /** Persist a lifecycle change for a recommendation + audit it. */
  const act = useCallback(async (
    rec: AIRecommendation,
    status: RecStatus,
    extra?: {
      snoozeHours?: number; assignTo?: string | null;
      outcome?: string; outcomeValue?: number;
      revenueImpact?: number; profitImpact?: number; conversionImpact?: number;
      inventoryImpact?: number; customerImpact?: number; successScore?: number;
    },
  ) => {
    setBusy(rec.key);
    const isExecute = status === "executed";
    const row = {
      rec_key: rec.key,
      title: rec.title,
      category: rec.category,
      priority: rec.priority,
      affected_systems: rec.systems,
      impact: rec.impact,
      confidence: rec.confidence,
      reasoning: rec.detail,
      action_kind: rec.actionKind,
      deep_link: rec.to ?? null,
      payload: { campaignId: rec.campaignId ?? null },
      source_timestamp: generatedAt,
      status,
      snooze_until: extra?.snoozeHours ? new Date(Date.now() + extra.snoozeHours * 3600_000).toISOString() : null,
      assigned_to: extra?.assignTo ?? null,
      outcome: extra?.outcome ?? null,
      outcome_value: extra?.outcomeValue ?? null,
      executed_at: isExecute ? new Date().toISOString() : null,
      revenue_impact: extra?.revenueImpact ?? (isExecute ? rec.impact : null),
      profit_impact: extra?.profitImpact ?? null,
      conversion_impact: extra?.conversionImpact ?? null,
      inventory_impact: extra?.inventoryImpact ?? null,
      customer_impact: extra?.customerImpact ?? null,
      success_score: extra?.successScore ?? null,
      acted_by: user?.id ?? null,
      acted_at: new Date().toISOString(),
      created_by: user?.id ?? null,
    };
    const { error } = await supabase.from("ai_recommendations").upsert(row, { onConflict: "rec_key" });
    setBusy(null);
    if (!error) {
      logActivity(`ai_recommendation_${status}`, "ai_operations", undefined, {
        rec_key: rec.key, title: rec.title, priority: rec.priority, category: rec.category,
        systems: rec.systems, ...(extra?.outcome ? { outcome: extra.outcome } : {}),
      });
    }
    return { error: error?.message };
  }, [user?.id, generatedAt]);

  /** Record (or toggle) an admin feedback vote for a recommendation. */
  const vote = useCallback(async (rec: AIRecommendation, v: FeedbackVote) => {
    if (!user?.id) return { error: "Not authenticated" };
    setBusy(rec.key);
    const { error } = await supabase
      .from("ai_recommendation_feedback")
      .upsert({ rec_key: rec.key, vote: v, user_id: user.id }, { onConflict: "rec_key,user_id" });
    setBusy(null);
    if (!error) {
      logActivity("ai_recommendation_feedback", "ai_operations", undefined, {
        rec_key: rec.key, title: rec.title, vote: v,
      });
    }
    return { error: error?.message };
  }, [user?.id]);

  return {
    loading: execLoading,
    currency,
    generatedAt,
    recs: active,
    allRecs,
    executed,
    states,
    stateFor,
    feedback,
    myVotes,
    busy,
    briefing,
    weekly,
    today,
    model,
    act,
    vote,
  };
}
