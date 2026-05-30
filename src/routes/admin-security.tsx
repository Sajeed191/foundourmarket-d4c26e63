import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ShieldAlert, ShieldCheck, ShieldX, Lock, Unlock, Loader2, RefreshCw, Download,
  AlertTriangle, Search, Eye, CheckCircle2, XCircle, Activity, Fingerprint, ChevronRight,
} from "lucide-react";
import { AdminShell, logActivity } from "@/components/admin/AdminShell";
import { KpiCard } from "@/components/admin/KpiCard";
import { downloadCSV } from "@/lib/admin-queries";
import { useFraudIntelligence } from "@/lib/use-fraud-intelligence";
import {
  FRAUD_META, SEVERITY_META, setAlertStatus, lockAccount, unlockAccount, buildReport,
  type Severity, type FraudType, type FraudAlertRow,
} from "@/lib/fraud-intelligence";

export const Route = createFileRoute("/admin-security")({
  head: () => ({ meta: [{ title: "Fraud & Security — Admin" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ view: typeof s.view === "string" ? s.view : undefined }),
  component: SecurityPage,
});

const STATUS_TONE: Record<string, string> = {
  open: "text-rose-300 border-rose-400/30 bg-rose-400/10",
  reviewing: "text-amber-300 border-amber-400/30 bg-amber-400/10",
  resolved: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10",
  dismissed: "text-muted-foreground border-border bg-white/5",
};

function SecurityPage() {
  const nav = useNavigate();
  const { signals, profiles, alerts, locks, loading, refreshing, reload } = useFraudIntelligence();
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<FraudType | "all">("all");
  const [sevFilter, setSevFilter] = useState<Severity | "all">("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [busy, setBusy] = useState<string | null>(null);

  const lockedSet = useMemo(
    () => new Set(locks.filter((l) => l.locked).map((l) => l.user_id)),
    [locks],
  );

  const kpi = useMemo(() => {
    const openA = alerts.filter((a) => a.status === "open" || a.status === "reviewing");
    return {
      open: openA.length,
      critical: openA.filter((a) => a.severity === "critical").length,
      high: openA.filter((a) => a.severity === "high").length,
      flagged: profiles.length,
      locked: lockedSet.size,
      resolved: alerts.filter((a) => a.status === "resolved" || a.status === "dismissed").length,
    };
  }, [alerts, profiles, lockedSet]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return alerts
      .filter((a) => (typeFilter === "all" ? true : a.fraud_type === typeFilter))
      .filter((a) => (sevFilter === "all" ? true : a.severity === sevFilter))
      .filter((a) => {
        if (statusFilter === "all") return true;
        if (statusFilter === "active") return a.status === "open" || a.status === "reviewing";
        return a.status === statusFilter;
      })
      .filter((a) => !term ||
        (a.subject_label ?? "").toLowerCase().includes(term) ||
        a.title.toLowerCase().includes(term) ||
        (a.subject_id ?? "").includes(term))
      .sort((a, b) => (b.score - a.score));
  }, [alerts, q, typeFilter, sevFilter, statusFilter]);

  async function changeStatus(a: FraudAlertRow, status: "reviewing" | "resolved" | "dismissed") {
    setBusy(a.id);
    await setAlertStatus(a, status);
    logActivity(`fraud_alert_${status}`, "security", a.id, { type: a.fraud_type });
    await reload();
    setBusy(null);
  }

  async function toggleLock(userId: string, label: string, type: string) {
    setBusy(userId);
    if (lockedSet.has(userId)) {
      await unlockAccount(userId, label);
      logActivity("fraud_account_unlocked", "security", userId);
    } else {
      await lockAccount(userId, label, `Locked from fraud signal: ${type}`, "high");
      logActivity("fraud_account_locked", "security", userId, { type });
    }
    await reload();
    setBusy(null);
  }

  function exportReport() {
    const report = buildReport(signals, profiles, locks);
    logActivity("fraud_report_export", "security", undefined, { signals: report.totalSignals });
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `fraud-report-${Date.now()}.json`; link.click();
    URL.revokeObjectURL(url);
  }

  function exportCSV() {
    const rows = filtered.map((a) => ({
      type: a.fraud_type, severity: a.severity, score: a.score, status: a.status,
      account: a.subject_label ?? "", account_id: a.subject_id ?? "", title: a.title,
      created_at: a.created_at,
    }));
    logActivity("fraud_alerts_export", "security", undefined, { count: rows.length });
    downloadCSV(`fraud-alerts-${Date.now()}.csv`, rows);
  }

  if (loading) {
    return (
      <AdminShell title="Fraud & Security" subtitle="Scanning for threats…" allow={["admin", "super_admin", "manager", "support"]}>
        <div className="min-h-[40vh] grid place-items-center">
          <Loader2 className="size-6 animate-spin text-accent" />
        </div>
      </AdminShell>
    );
  }

  const FRAUD_TYPES = Object.keys(FRAUD_META) as FraudType[];

  return (
    <AdminShell
      title="Fraud & Security Intelligence"
      subtitle="Realtime threat detection across orders, accounts, refunds and logins"
      allow={["admin", "super_admin", "manager", "support"]}
      actions={
        <div className="flex items-center gap-2">
          <button onClick={reload} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs hover:border-accent/40">
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} /> Scan
          </button>
          <button onClick={exportCSV} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs hover:border-accent/40">
            <Download className="size-3.5" /> CSV
          </button>
          <button onClick={exportReport} className="inline-flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent hover:bg-accent/20">
            <Download className="size-3.5" /> Executive Report
          </button>
        </div>
      }
    >
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Open Alerts" value={String(kpi.open)} icon={<ShieldAlert className="size-4" />} />
        <KpiCard label="Critical" value={String(kpi.critical)} icon={<AlertTriangle className="size-4" />} />
        <KpiCard label="High" value={String(kpi.high)} icon={<ShieldX className="size-4" />} />
        <KpiCard label="Flagged Accounts" value={String(kpi.flagged)} icon={<Fingerprint className="size-4" />} />
        <KpiCard label="Locked" value={String(kpi.locked)} icon={<Lock className="size-4" />} />
        <KpiCard label="Resolved" value={String(kpi.resolved)} icon={<ShieldCheck className="size-4" />} />
      </div>

      {/* Threat breakdown by type */}
      <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        {FRAUD_TYPES.map((t) => {
          const count = alerts.filter((a) => a.fraud_type === t && (a.status === "open" || a.status === "reviewing")).length;
          const meta = FRAUD_META[t];
          return (
            <button
              key={t}
              onClick={() => { setTypeFilter(typeFilter === t ? "all" : t); }}
              className={`text-left rounded-2xl border bg-card p-3 transition ${typeFilter === t ? "border-accent/50" : "border-border hover:border-accent/30"}`}
            >
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] ${meta.tone}`}>
                  <span className={`size-1.5 rounded-full ${meta.dot}`} /> {meta.label}
                </span>
                <span className="text-lg font-semibold tabular-nums">{count}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search account, alert…"
            className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2 text-xs outline-none focus:border-accent/40"
          />
        </div>
        <select value={sevFilter} onChange={(e) => setSevFilter(e.target.value as Severity | "all")} className="rounded-xl border border-border bg-card px-3 py-2 text-xs">
          <option value="all">All severity</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-border bg-card px-3 py-2 text-xs">
          <option value="active">Active</option>
          <option value="open">Open</option>
          <option value="reviewing">Reviewing</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
          <option value="all">All</option>
        </select>
      </div>

      {/* Alerts list */}
      <div className="mt-4 space-y-2.5">
        {filtered.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            <ShieldCheck className="size-6 mx-auto mb-2 text-emerald-400" />
            No alerts match the current filters.
          </div>
        )}
        {filtered.map((a) => {
          const meta = FRAUD_META[a.fraud_type as FraudType] ?? { label: a.fraud_type, tone: STATUS_TONE.open, dot: "bg-rose-400" };
          const sevMeta = SEVERITY_META[a.severity as Severity] ?? SEVERITY_META.medium;
          const isLocked = a.subject_id ? lockedSet.has(a.subject_id) : false;
          return (
            <div key={a.id} className="rounded-2xl border border-border bg-card p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] ${meta.tone}`}>
                      <span className={`size-1.5 rounded-full ${meta.dot}`} /> {meta.label}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${sevMeta.tone}`}>{sevMeta.label}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${STATUS_TONE[a.status] ?? STATUS_TONE.open}`}>{a.status}</span>
                    <span className="text-[10px] text-muted-foreground">Risk {a.score}</span>
                    {isLocked && <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 text-[10px] text-rose-300"><Lock className="size-2.5" /> Locked</span>}
                  </div>
                  <p className="text-sm font-medium truncate">{a.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.detail}</p>
                  {a.subject_label && (
                    <button
                      onClick={() => (nav as (o: { to: string; search?: Record<string, string> }) => void)({ to: "/admin-customers", search: a.subject_id ? { id: a.subject_id } : {} })}
                      className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
                    >
                      {a.subject_label} <ChevronRight className="size-3" />
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {(a.status === "open" || a.status === "reviewing") && (
                  <>
                    {a.status === "open" && (
                      <button disabled={busy === a.id} onClick={() => changeStatus(a, "reviewing")} className="inline-flex items-center gap-1 rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] text-amber-300 hover:bg-amber-400/20 disabled:opacity-50">
                        <Eye className="size-3" /> Review
                      </button>
                    )}
                    <button disabled={busy === a.id} onClick={() => changeStatus(a, "resolved")} className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-300 hover:bg-emerald-400/20 disabled:opacity-50">
                      <CheckCircle2 className="size-3" /> Resolve
                    </button>
                    <button disabled={busy === a.id} onClick={() => changeStatus(a, "dismissed")} className="inline-flex items-center gap-1 rounded-lg border border-border bg-white/5 px-2.5 py-1 text-[11px] text-muted-foreground hover:border-accent/30 disabled:opacity-50">
                      <XCircle className="size-3" /> Dismiss
                    </button>
                  </>
                )}
                {a.subject_id && a.subject_type === "customer" && (
                  <button disabled={busy === a.subject_id} onClick={() => toggleLock(a.subject_id!, a.subject_label ?? a.subject_id!, a.fraud_type)} className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] disabled:opacity-50 ${isLocked ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20" : "border-rose-400/30 bg-rose-400/10 text-rose-300 hover:bg-rose-400/20"}`}>
                    {isLocked ? <><Unlock className="size-3" /> Unlock account</> : <><Lock className="size-3" /> Lock account</>}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Top risk accounts */}
      {profiles.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><Activity className="size-4 text-accent" /> Highest-Risk Accounts</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {profiles.slice(0, 8).map((p) => {
              const isLocked = lockedSet.has(p.userId);
              const sevMeta = SEVERITY_META[p.severity];
              return (
                <div key={p.userId} className="rounded-2xl border border-border bg-card p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{p.label}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{p.types.map((t) => FRAUD_META[t].label).join(" · ")}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${sevMeta.tone}`}>{p.riskScore}</span>
                    <button disabled={busy === p.userId} onClick={() => toggleLock(p.userId, p.label, p.types[0])} className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] disabled:opacity-50 ${isLocked ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-rose-400/30 bg-rose-400/10 text-rose-300"}`}>
                      {isLocked ? <Unlock className="size-3" /> : <Lock className="size-3" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </AdminShell>
  );
}
