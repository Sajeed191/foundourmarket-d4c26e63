import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Zap, ArrowUpRight, Play, AlertTriangle, Activity, Loader2,
  ShieldAlert, Pause as PauseIcon, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchExecutions, fetchAutomationSettings, executionAnalytics, computeHealth,
  runAutomations, systemStatusLabel,
  type AutomationExecution, type Automation, type AutomationSettings, type HealthLevel,
} from "@/lib/marketing-automation";

const EASE = [0.16, 1, 0.3, 1] as const;

const HEALTH_TONE: Record<HealthLevel, string> = {
  healthy: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10",
  warning: "text-amber-300 border-amber-400/30 bg-amber-400/10",
  critical: "text-rose-300 border-rose-400/30 bg-rose-400/10",
};

async function fetchAutomationsLite(): Promise<Automation[]> {
  const { data } = await supabase
    .from("marketing_automations")
    .select("id,name,status,enabled")
    .order("priority", { ascending: false });
  return ((data as Record<string, unknown>[]) ?? []).map((r) => ({
    ...(r as object),
    enabled: (r as { enabled?: boolean }).enabled === true,
    status: (r as { status?: Automation["status"] }).status ?? "draft",
  })) as Automation[];
}

/** Compact Marketing Automation summary for the Executive Dashboard. */
export function AutomationSummaryWidget() {
  const nav = useNavigate();
  const [rows, setRows] = useState<AutomationExecution[] | null>(null);
  const [autos, setAutos] = useState<Automation[]>([]);
  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    const [ex, a, st] = await Promise.all([
      fetchExecutions(200), fetchAutomationsLite(), fetchAutomationSettings(),
    ]);
    setRows(ex); setAutos(a); setSettings(st);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel("exec-automation-widget")
      .on("postgres_changes", { event: "*", schema: "public", table: "automation_executions" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "automation_settings" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "marketing_automations" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const analytics = useMemo(() => executionAnalytics(rows ?? []), [rows]);
  const health = useMemo(() => computeHealth(rows ?? [], autos), [rows, autos]);

  const actionsToday = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return (rows ?? []).filter(
      (r) => new Date(r.created_at) >= start && r.action_taken && r.action_taken !== "campaign_exists",
    ).length;
  }, [rows]);

  if (!rows) return null;

  const lastRun = analytics.lastRunAt
    ? new Date(analytics.lastRunAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

  async function runNow() {
    if (running) return;
    if (!confirm("Run all active marketing automations now?")) return;
    setRunning(true);
    const { summary, error } = await runAutomations();
    setRunning(false);
    if (error) { toast.error(`Run failed: ${error}`); return; }
    toast.success(`Automations ran — ${summary?.actions_taken ?? 0} action(s), ${summary?.total_matches ?? 0} matched`);
    load();
  }

  const statusIcon = settings?.emergency_stop ? ShieldAlert : settings?.global_pause ? PauseIcon : CheckCircle2;
  const StatusIcon = statusIcon;
  const blocked = settings?.emergency_stop || settings?.global_pause;

  return (
    <motion.section id="automation-summary" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
      className="relative overflow-hidden rounded-2xl glass glass-reflect scroll-mt-24"
      style={{ boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.05), 0 22px 50px -32px oklch(0 0 0 / 0.85)" }}>
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Zap className="size-4 text-accent shrink-0" />
          <h2 className="text-[13px] font-medium truncate">Marketing Automation</h2>
          <span className={`text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${HEALTH_TONE[health.level]}`}>{health.level}</span>
        </div>
        <Link to="/admin-marketing-automation" search={{ tab: "executions" }} className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-full bg-accent/15 text-accent border border-accent/30 inline-flex items-center gap-1">Open <ArrowUpRight className="size-3" /></Link>
      </div>

      <div className="px-4 pb-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Success rate" value={`${Math.round(analytics.successRate * 100)}%`} tone="emerald" />
        <Stat label="Failure rate" value={`${Math.round(analytics.failureRate * 100)}%`} tone={analytics.failureRate > 0 ? "rose" : "muted"} />
        <Stat label="Active" value={String(health.active)} />
        <Stat label="Paused" value={String(health.paused)} tone={health.paused > 0 ? "amber" : "muted"} />
        <Stat label="Actions today" value={String(actionsToday)} tone="emerald" />
        <Stat label="Critical alerts" value={String(health.level === "critical" ? Math.max(1, analytics.permanentlyFailed) : 0)} tone={health.level === "critical" ? "rose" : "muted"} />
        <Stat label="Failed runs" value={String(analytics.failed)} tone={analytics.failed > 0 ? "rose" : "muted"} />
        <Stat label="Last run" value={lastRun} small />
      </div>

      <div className="px-4 pb-4 flex flex-wrap items-center gap-2">
        <div className={`text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-full border inline-flex items-center gap-1 mr-auto ${blocked ? HEALTH_TONE.critical : HEALTH_TONE.healthy}`}>
          <StatusIcon className="size-3" /> {settings ? systemStatusLabel(settings) : "—"}
        </div>
        <button onClick={runNow} disabled={running || blocked}
          className="h-8 px-3 rounded-full bg-accent text-accent-foreground text-[11px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
          {running ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />} Run now
        </button>
        <button onClick={() => nav({ to: "/admin-marketing-automation", search: { view: "failures" } })}
          className="h-8 px-3 rounded-full bg-card border border-border text-[11px] inline-flex items-center gap-1.5 hover:border-accent/40">
          <AlertTriangle className="size-3 text-rose-400" /> Failure Center {analytics.failed ? `(${analytics.failed})` : ""}
        </button>
        <button onClick={() => nav({ to: "/admin-marketing-automation", search: { view: "health" } })}
          className="h-8 px-3 rounded-full bg-card border border-border text-[11px] inline-flex items-center gap-1.5 hover:border-accent/40">
          <Activity className="size-3 text-accent" /> Health
        </button>
      </div>
    </motion.section>
  );
}

function Stat({ label, value, tone = "muted", small }: { label: string; value: string; tone?: "emerald" | "rose" | "amber" | "muted"; small?: boolean }) {
  const toneCls = tone === "emerald" ? "text-emerald-300" : tone === "rose" ? "text-rose-300" : tone === "amber" ? "text-amber-300" : "text-foreground";
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground block mb-1">{label}</span>
      <span className={`${small ? "text-[12px]" : "text-lg"} font-display font-semibold tabular-nums ${toneCls}`}>{value}</span>
    </div>
  );
}
