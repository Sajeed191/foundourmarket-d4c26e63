import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, CheckCircle2, Clock, Download, Loader2, Play, RefreshCw,
  RotateCcw, ShieldAlert, ShieldCheck, Pause, Wrench, X, Zap, Search, XCircle, Ban,
  ChevronDown, Users, Gauge, Archive,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchExecutions, executionAnalytics, computeHealth, runAutomations,
  retryExecution, retryAllFailed, fetchAutomationSettings, setAutomationSettings,
  systemBlocked, TEMPLATE_BY_KEY, fmtNum,
  type AutomationExecution, type Automation, type AutomationSettings, type RunSummary,
  type HealthLevel,
} from "@/lib/marketing-automation";

/* ------------------------------------------------------- status helpers */

type FilterKey = "all" | "success" | "failed" | "blocked" | "running" | "retried" | "permanent";

const HEALTH_TONE: Record<HealthLevel, string> = {
  healthy: "text-emerald-300 bg-emerald-400/10 ring-emerald-400/30",
  warning: "text-amber-300 bg-amber-400/10 ring-amber-400/30",
  critical: "text-rose-300 bg-rose-400/10 ring-rose-400/30",
};

function statusBadge(e: AutomationExecution) {
  if (e.failed_permanently) return { label: "Failed permanently", cls: "text-rose-300 bg-rose-400/10 ring-rose-400/30", icon: <XCircle className="size-3" /> };
  if (e.blocked) return { label: "Blocked", cls: "text-orange-300 bg-orange-400/10 ring-orange-400/30", icon: <Ban className="size-3" /> };
  if (e.status === "failed") return { label: "Failed", cls: "text-rose-300 bg-rose-400/10 ring-rose-400/30", icon: <AlertTriangle className="size-3" /> };
  if (e.status === "skipped") return { label: "Skipped", cls: "text-muted-foreground bg-muted/40 ring-border", icon: <Clock className="size-3" /> };
  return { label: "Success", cls: "text-emerald-300 bg-emerald-400/10 ring-emerald-400/30", icon: <CheckCircle2 className="size-3" /> };
}

function dur(ms: number) { return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`; }
function triggerLabel(k: string) { return TEMPLATE_BY_KEY[k]?.label ?? k; }

/* ============================================================= banner */

export function AutomationStatusBanner({ settings }: { settings: AutomationSettings | null }) {
  if (!settings) return null;
  const blocked = systemBlocked(settings);
  const maint = settings.maintenance_mode;
  const tone = settings.emergency_stop
    ? "text-rose-200 bg-rose-500/15 border-rose-500/40"
    : settings.global_pause
      ? "text-amber-200 bg-amber-500/15 border-amber-500/40"
      : maint
        ? "text-sky-200 bg-sky-500/15 border-sky-500/40"
        : "text-emerald-200 bg-emerald-500/10 border-emerald-500/30";
  const label = settings.emergency_stop ? "Emergency Stop Active — all automation actions halted"
    : settings.global_pause ? "Automation System Paused — actions are suspended"
      : maint ? "Maintenance Mode — automations run in evaluation-only mode"
        : "Automation System Active";
  const Icon = settings.emergency_stop ? ShieldAlert : settings.global_pause ? Pause : maint ? Wrench : ShieldCheck;
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${tone}`}>
      <Icon className="size-4 shrink-0" />
      <span>{label}</span>
      {(blocked || maint) && <span className="ml-auto text-[10px] uppercase tracking-widest opacity-80">System status</span>}
    </div>
  );
}

/* ============================================================= main */

export type ExecutionsView = "feed" | "failures" | "run" | "health";

export function MarketingExecutionsCenter({ automations, estAudience, initialView }: {
  automations: Automation[];
  estAudience: number;
  initialView?: ExecutionsView;
}) {
  const [rows, setRows] = useState<AutomationExecution[] | null>(null);
  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<"date" | "duration" | "matches" | "failures">("date");
  const [showRun, setShowRun] = useState(false);
  const [showFailures, setShowFailures] = useState(false);

  // Deep-link: open the requested view once on mount / when it changes.
  useEffect(() => {
    if (initialView === "failures") setShowFailures(true);
    else if (initialView === "run") setShowRun(true);
    else if (initialView === "health") {
      requestAnimationFrame(() => document.getElementById("automation-health")?.scrollIntoView({ behavior: "smooth", block: "center" }));
    }
  }, [initialView]);

  const load = useCallback(async () => {
    const [ex, st] = await Promise.all([fetchExecutions(200), fetchAutomationSettings()]);
    setRows(ex); setSettings(st);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel("mkt-exec-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "automation_executions" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "automation_settings" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const analytics = useMemo(() => executionAnalytics(rows ?? []), [rows]);
  const health = useMemo(() => computeHealth(rows ?? [], automations), [rows, automations]);
  const activeAutomations = useMemo(() => automations.filter((a) => a.enabled && a.status === "active"), [automations]);

  const filtered = useMemo(() => {
    let list = [...(rows ?? [])];
    if (filter === "success") list = list.filter((r) => r.status === "success" && !r.blocked);
    else if (filter === "failed") list = list.filter((r) => r.status === "failed");
    else if (filter === "blocked") list = list.filter((r) => r.blocked);
    else if (filter === "running") list = list.filter((r) => r.triggered_by === "manual" && Date.now() - new Date(r.created_at).getTime() < 5000);
    else if (filter === "retried") list = list.filter((r) => r.retry_count > 0);
    else if (filter === "permanent") list = list.filter((r) => r.failed_permanently);
    const term = q.trim().toLowerCase();
    if (term) {
      list = list.filter((r) =>
        triggerLabel(r.trigger_key).toLowerCase().includes(term) ||
        r.trigger_key.toLowerCase().includes(term) ||
        (r.action_taken ?? "").toLowerCase().includes(term),
      );
    }
    list.sort((a, b) => {
      if (sortKey === "duration") return b.duration_ms - a.duration_ms;
      if (sortKey === "matches") return b.matched_count - a.matched_count;
      if (sortKey === "failures") return (b.status === "failed" ? 1 : 0) - (a.status === "failed" ? 1 : 0);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return list;
  }, [rows, filter, q, sortKey]);

  const failures = useMemo(() => (rows ?? []).filter((r) => r.status === "failed"), [rows]);

  function download(name: string, content: string, mime: string) {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }
  function exportCSV() {
    const head = ["created_at", "trigger", "status", "matched", "action", "duration_ms", "retry_count", "blocked", "failed_permanently", "triggered_by", "error"];
    const lines = filtered.map((r) => [
      r.created_at, triggerLabel(r.trigger_key), r.status, r.matched_count, r.action_taken ?? "",
      r.duration_ms, r.retry_count, r.blocked, r.failed_permanently, r.triggered_by, (r.error ?? "").replace(/"/g, "'"),
    ].map((v) => `"${String(v)}"`).join(","));
    download(`automation-executions-${new Date().toISOString().slice(0, 10)}.csv`, [head.join(","), ...lines].join("\n"), "text/csv;charset=utf-8");
    toast.success("Exported CSV");
  }
  function exportJSON() {
    download(`automation-executions-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(filtered, null, 2), "application/json");
    toast.success("Exported JSON");
  }

  if (!rows) {
    return <div className="grid place-items-center py-24 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>;
  }

  const FILTERS: [FilterKey, string, number][] = [
    ["all", "All", analytics.totalRuns],
    ["success", "Success", analytics.successful],
    ["failed", "Failed", analytics.failed],
    ["blocked", "Blocked", analytics.blocked],
    ["retried", "Retried", analytics.retried],
    ["permanent", "Permanently Failed", analytics.permanentlyFailed],
  ];

  return (
    <div className="space-y-5">
      <AutomationStatusBanner settings={settings} />

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setShowRun(true)}
          className="h-9 px-3 rounded-xl bg-accent text-accent-foreground text-xs font-medium inline-flex items-center gap-2">
          <Play className="size-3.5" /> Run automations now
        </button>
        <button onClick={() => setShowFailures(true)}
          className="h-9 px-3 rounded-xl bg-card border border-border text-xs inline-flex items-center gap-2 hover:border-accent/40">
          <AlertTriangle className="size-3.5 text-rose-400" /> Failure Center {failures.length ? `(${failures.length})` : ""}
        </button>
        <button onClick={load} className="h-9 px-3 rounded-xl bg-card border border-border text-xs inline-flex items-center gap-2 hover:border-accent/40">
          <RefreshCw className="size-3.5" /> Refresh
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={exportCSV} className="h-9 px-3 rounded-xl bg-card border border-border text-xs inline-flex items-center gap-2 hover:border-accent/40"><Download className="size-3.5" /> CSV</button>
          <button onClick={exportJSON} className="h-9 px-3 rounded-xl bg-card border border-border text-xs inline-flex items-center gap-2 hover:border-accent/40"><Download className="size-3.5" /> JSON</button>
        </div>
      </div>

      {/* Health + Safety */}
      <div id="automation-health" className="grid lg:grid-cols-2 gap-4 scroll-mt-24">>
        <HealthCard health={health} />
        <SafetyPanel settings={settings} onChanged={setSettings} />
      </div>

      {/* Filters + search + sort */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(([k, l, n]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`h-8 px-3 rounded-full text-xs whitespace-nowrap transition-colors ${filter === k ? "bg-accent text-accent-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}>
            {l} <span className="opacity-70">({n})</span>
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search automation / action / trigger"
            className="h-9 pl-9 pr-3 rounded-xl bg-card border border-border text-xs w-56" />
        </div>
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
          className="h-9 rounded-xl bg-card border border-border px-3 text-xs">
          <option value="date">Sort: Date</option>
          <option value="duration">Sort: Duration</option>
          <option value="matches">Sort: Matches</option>
          <option value="failures">Sort: Failures</option>
        </select>
      </div>

      {/* Feed */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center text-xs text-muted-foreground">No executions match.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => <ExecutionRow key={e.id} e={e} onRetried={load} />)}
        </div>
      )}

      {showRun && (
        <RunNowModal
          estAutomations={activeAutomations.length}
          estAudience={estAudience}
          blocked={settings ? systemBlocked(settings) : false}
          onClose={() => setShowRun(false)}
          onDone={load}
        />
      )}
      {showFailures && (
        <FailureCenter failures={failures} onClose={() => setShowFailures(false)} onChanged={load} />
      )}
    </div>
  );
}

/* ------------------------------------------------------- health card */

function HealthCard({ health }: { health: ReturnType<typeof computeHealth> }) {
  return (
    <section className="card-premium rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium flex items-center gap-2"><Activity className="size-4 text-accent" /> Automation Health</h2>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ring-1 ring-inset capitalize ${HEALTH_TONE[health.level]}`}>{health.level}</span>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <Mini label="Success rate" value={`${(health.successRate * 100).toFixed(0)}%`} tone="text-emerald-300" />
        <Mini label="Failure rate" value={`${(health.failureRate * 100).toFixed(0)}%`} tone={health.failureRate > 0 ? "text-rose-300" : undefined} />
        <Mini label="Blocked rate" value={`${(health.blockedRate * 100).toFixed(0)}%`} tone={health.blockedRate > 0 ? "text-orange-300" : undefined} />
        <Mini label="Avg duration" value={dur(health.avgDuration)} />
        <Mini label="Active" value={fmtNum(health.active)} />
        <Mini label="Paused" value={fmtNum(health.paused)} />
        <Mini label="Failed" value={fmtNum(health.failed)} tone={health.failed > 0 ? "text-rose-300" : undefined} />
        <div className="col-span-2 rounded-lg bg-card/60 border border-border px-2.5 py-2">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Last run</p>
          <p className="text-xs font-medium mt-0.5">{health.lastRunAt ? new Date(health.lastRunAt).toLocaleString() : "—"}</p>
        </div>
      </div>
    </section>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-card/60 border border-border px-2.5 py-2">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-sm font-display font-semibold tabular-nums mt-0.5 ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

/* ------------------------------------------------------- safety panel */

function SafetyPanel({ settings, onChanged }: { settings: AutomationSettings | null; onChanged: (s: AutomationSettings) => void }) {
  const [confirm, setConfirm] = useState<null | { key: "emergency_stop" | "global_pause" | "maintenance_mode"; next: boolean; label: string }>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (!settings) return null;

  async function apply() {
    if (!confirm || !settings) return;
    setBusy(true);
    const next = { emergency_stop: settings.emergency_stop, global_pause: settings.global_pause, maintenance_mode: settings.maintenance_mode };
    next[confirm.key] = confirm.next;
    const { settings: updated, error } = await setAutomationSettings(next, reason);
    setBusy(false);
    if (error) { toast.error(error); return; }
    toast.success(`${confirm.label} ${confirm.next ? "enabled" : "disabled"}`);
    if (updated) onChanged(updated);
    setConfirm(null); setReason("");
  }

  const toggles: { key: "emergency_stop" | "global_pause" | "maintenance_mode"; label: string; icon: React.ReactNode; desc: string; on: boolean }[] = [
    { key: "emergency_stop", label: "Emergency Stop", icon: <ShieldAlert className="size-4 text-rose-400" />, desc: "Immediately halt all automation actions.", on: settings.emergency_stop },
    { key: "global_pause", label: "Global Pause", icon: <Pause className="size-4 text-amber-400" />, desc: "Suspend automated actions; keep evaluating.", on: settings.global_pause },
    { key: "maintenance_mode", label: "Maintenance Mode", icon: <Wrench className="size-4 text-sky-400" />, desc: "Evaluate triggers only — no actions fire.", on: settings.maintenance_mode },
  ];

  return (
    <section className="card-premium rounded-2xl p-5">
      <h2 className="text-sm font-medium flex items-center gap-2 mb-3"><ShieldCheck className="size-4 text-accent" /> Safety Controls</h2>
      <div className="space-y-2">
        {toggles.map((t) => (
          <div key={t.key} className="flex items-center justify-between gap-3 rounded-xl bg-card/60 border border-border px-3 py-2">
            <div className="flex items-start gap-2.5 min-w-0">
              <span className="mt-0.5">{t.icon}</span>
              <div className="min-w-0">
                <p className="text-xs font-medium">{t.label}</p>
                <p className="text-[11px] text-muted-foreground">{t.desc}</p>
              </div>
            </div>
            <button onClick={() => setConfirm({ key: t.key, next: !t.on, label: t.label })}
              className={`h-7 px-3 rounded-full text-[11px] font-medium shrink-0 ${t.on ? "bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30" : "bg-card border border-border hover:border-accent/40"}`}>
              {t.on ? "Active" : "Enable"}
            </button>
          </div>
        ))}
      </div>

      {confirm && (
        <Modal title={`${confirm.next ? "Enable" : "Disable"} ${confirm.label}`} onClose={() => { setConfirm(null); setReason(""); }}>
          <p className="text-xs text-muted-foreground mb-3">
            {confirm.key === "emergency_stop" && confirm.next
              ? "This immediately halts every automated action across the platform."
              : `Confirm you want to ${confirm.next ? "enable" : "disable"} ${confirm.label.toLowerCase()}.`}
          </p>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Reason (audited)</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
            placeholder="Why are you changing this control?"
            className="mt-1 w-full rounded-xl bg-card border border-border px-3 py-2 text-sm" />
          <button disabled={busy} onClick={apply}
            className="mt-3 w-full h-10 rounded-xl bg-accent text-accent-foreground text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-60">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} Confirm
          </button>
        </Modal>
      )}
    </section>
  );
}

/* ------------------------------------------------------- execution row */

function ExecutionRow({ e, onRetried }: { e: AutomationExecution; onRetried: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const b = statusBadge(e);
  async function retry() {
    setBusy(true);
    const { error } = await retryExecution(e.id);
    setBusy(false);
    if (error) toast.error(error); else { toast.success("Retry triggered"); onRetried(); }
  }
  return (
    <div className="card-premium rounded-2xl p-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`text-[10px] px-2 py-0.5 rounded-full ring-1 ring-inset inline-flex items-center gap-1 ${b.cls}`}>{b.icon}{b.label}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{triggerLabel(e.trigger_key)}</p>
          <p className="text-[11px] text-muted-foreground">{new Date(e.created_at).toLocaleString()} · {e.triggered_by}</p>
        </div>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Users className="size-3" /> {fmtNum(e.matched_count)}</span>
          <span className="inline-flex items-center gap-1"><Clock className="size-3" /> {dur(e.duration_ms)}</span>
          {e.retry_count > 0 && <span className="inline-flex items-center gap-1 text-amber-300"><RotateCcw className="size-3" /> {e.retry_count}</span>}
          {e.status === "failed" && !e.failed_permanently && (
            <button disabled={busy} onClick={retry} className="h-7 px-2.5 rounded-lg bg-card border border-border hover:border-accent/40 inline-flex items-center gap-1 disabled:opacity-50">
              {busy ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />} Retry
            </button>
          )}
          <button onClick={() => setOpen((o) => !o)} className="size-7 grid place-items-center rounded-lg border border-border bg-card hover:border-accent/40">
            <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-3 grid sm:grid-cols-2 gap-2 text-[11px]">
          {e.summary && <Detail label="Summary" value={e.summary} />}
          {e.action_taken && <Detail label="Action" value={e.action_taken} />}
          {e.error && <Detail label="Error" value={e.error} tone="text-rose-300" />}
          <Detail label="Run ID" value={e.run_id} />
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-card/60 border border-border px-2.5 py-1.5">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-0.5 break-words ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

/* ------------------------------------------------------- run now modal */

function RunNowModal({ estAutomations, estAudience, blocked, onClose, onDone }: {
  estAutomations: number; estAudience: number; blocked: boolean; onClose: () => void; onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RunSummary | null>(null);

  async function run() {
    setBusy(true);
    const { summary, error } = await runAutomations();
    setBusy(false);
    if (error) { toast.error(error); return; }
    setResult(summary ?? null);
    onDone();
  }

  return (
    <Modal title={result ? "Run complete" : "Run automations now"} onClose={onClose}>
      {!result ? (
        <div className="space-y-3">
          {blocked && (
            <div className="rounded-xl bg-amber-500/15 border border-amber-500/40 px-3 py-2 text-xs text-amber-200 flex items-center gap-2">
              <AlertTriangle className="size-4" /> System is paused — automations will be evaluated but actions are blocked.
            </div>
          )}
          <div className="grid grid-cols-2 gap-2.5">
            <Mini label="Automations" value={fmtNum(estAutomations)} />
            <Mini label="Est. audience" value={fmtNum(estAudience)} />
          </div>
          <div className="rounded-xl bg-card/60 border border-border px-3 py-2 text-[11px] text-muted-foreground flex items-center gap-2">
            {blocked ? <Ban className="size-3.5 text-amber-300" /> : <ShieldCheck className="size-3.5 text-emerald-300" />}
            Safety status: {blocked ? "Blocked" : "Active"}
          </div>
          <p className="text-xs text-muted-foreground">This manually evaluates all active automations and fires due actions. The run is fully audited.</p>
          <button disabled={busy} onClick={run}
            className="w-full h-10 rounded-xl bg-accent text-accent-foreground text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-60">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />} Run now
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <Mini label="Automations evaluated" value={fmtNum(result.automations_evaluated)} />
            <Mini label="Actions executed" value={fmtNum(result.actions_taken)} tone="text-emerald-300" />
            <Mini label="Audience matched" value={fmtNum(result.total_matches)} />
            <Mini label="Failures" value={fmtNum(result.failures)} tone={result.failures > 0 ? "text-rose-300" : undefined} />
          </div>
          {result.blocked && (
            <div className="rounded-xl bg-amber-500/15 border border-amber-500/40 px-3 py-2 text-xs text-amber-200">Actions were blocked by an active safety control.</div>
          )}
          <button onClick={onClose} className="w-full h-10 rounded-xl bg-card border border-border text-sm font-medium inline-flex items-center justify-center gap-2 hover:border-accent/40">
            <CheckCircle2 className="size-4" /> Done
          </button>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------- failure center */

function FailureCenter({ failures, onClose, onChanged }: {
  failures: AutomationExecution[]; onClose: () => void; onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [archived, setArchived] = useState<Set<string>>(new Set());

  async function retryOne(id: string) {
    setBusy(id);
    const { error } = await retryExecution(id);
    setBusy(null);
    if (error) toast.error(error); else { toast.success("Retry triggered"); onChanged(); }
  }
  async function retryAll() {
    setBusy("all");
    const { count, error } = await retryAllFailed();
    setBusy(null);
    if (error) toast.error(error); else { toast.success(`Retrying ${count ?? 0} execution(s)`); onChanged(); }
  }

  const visible = failures.filter((f) => !archived.has(f.id));

  return (
    <Modal title="Automation Failure Center" onClose={onClose} wide>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">{visible.length} failed execution(s)</p>
        <button disabled={busy === "all" || !visible.some((f) => !f.failed_permanently)} onClick={retryAll}
          className="h-8 px-3 rounded-xl bg-accent text-accent-foreground text-xs font-medium inline-flex items-center gap-2 disabled:opacity-50">
          {busy === "all" ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />} Retry all
        </button>
      </div>
      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center text-xs text-muted-foreground">No active failures. 🎉</div>
      ) : (
        <div className="space-y-2 max-h-[55vh] overflow-y-auto">
          {visible.map((f) => (
            <div key={f.id} className="rounded-xl bg-card/60 border border-border px-3 py-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{triggerLabel(f.trigger_key)}</span>
                {f.failed_permanently
                  ? <span className="text-[10px] px-2 py-0.5 rounded-full ring-1 ring-inset text-rose-300 bg-rose-400/10 ring-rose-400/30">Permanently failed</span>
                  : <span className="text-[10px] px-2 py-0.5 rounded-full ring-1 ring-inset text-amber-300 bg-amber-400/10 ring-amber-400/30">Retry {f.retry_count}/3</span>}
                <span className="ml-auto text-[11px] text-muted-foreground">{new Date(f.created_at).toLocaleString()}</span>
              </div>
              {f.error && <p className="text-[11px] text-rose-300 mt-1 break-words">{f.error}</p>}
              <div className="flex items-center gap-2 mt-2">
                {!f.failed_permanently && (
                  <button disabled={busy === f.id} onClick={() => retryOne(f.id)}
                    className="h-7 px-2.5 rounded-lg bg-card border border-border hover:border-accent/40 text-[11px] inline-flex items-center gap-1 disabled:opacity-50">
                    {busy === f.id ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />} Retry
                  </button>
                )}
                <button onClick={() => setArchived((s) => new Set(s).add(f.id))}
                  className="h-7 px-2.5 rounded-lg bg-card border border-border hover:border-accent/40 text-[11px] inline-flex items-center gap-1">
                  <Archive className="size-3" /> Archive
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------- modal primitive */

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div className={`w-full ${wide ? "sm:max-w-lg" : "sm:max-w-md"} bg-card border border-border rounded-t-3xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium flex items-center gap-2"><Gauge className="size-4 text-accent" /> {title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
