import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Activity, Loader2, RefreshCw, AlertTriangle, MailWarning, ShieldBan,
  Inbox, Layers, CheckCircle2, XCircle, Clock,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { getEmailDiagnostics } from "@/lib/email-admin.functions";

export const Route = createFileRoute("/admin-email-diagnostics")({
  head: () => ({ meta: [{ title: "Email diagnostics — Admin" }] }),
  component: () => (
    <AdminShell
      title="Email Diagnostics"
      subtitle="Central email monitoring & health"
      allow={["admin", "super_admin", "manager"]}
    >
      <DiagnosticsInner />
    </AdminShell>
  ),
});

const RANGES = [
  { id: "24h" as const, label: "24h" },
  { id: "7d" as const, label: "7 days" },
  { id: "30d" as const, label: "30 days" },
];

const when = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

function healthTone(score: number) {
  if (score >= 90) return { ring: "ring-emerald-400/30", text: "text-emerald-400", bar: "bg-emerald-400", label: "Healthy" };
  if (score >= 70) return { ring: "ring-amber-400/30", text: "text-amber-400", bar: "bg-amber-400", label: "Degraded" };
  return { ring: "ring-destructive/30", text: "text-destructive", bar: "bg-destructive", label: "Critical" };
}

function StatCard({ label, value, sub, icon: Icon, tone }: {
  label: string; value: string | number; sub?: string; icon: typeof Inbox; tone?: string;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
        <Icon className={`size-3.5 ${tone ?? "text-accent"}`} />
      </div>
      <p className={`mt-1.5 text-xl font-display tabular-nums ${tone ?? ""}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function Row({ title, sub, status, at }: { title: string; sub?: string | null; status: string; at: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium truncate">{title}</span>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground shrink-0">{status}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span className="truncate">{sub ?? "—"}</span>
        <span className="inline-flex items-center gap-1 shrink-0"><Clock className="size-3" />{when(at)}</span>
      </div>
    </div>
  );
}

function List<T>({ title, icon: Icon, rows, render }: {
  title: string; icon: typeof Inbox; rows: T[]; render: (r: T) => React.ReactNode;
}) {
  return (
    <div className="glass border border-white/10 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="size-4 text-accent" />
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-[10px] font-mono text-muted-foreground">({rows.length})</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing recent — all clear.</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">{rows.map(render)}</div>
      )}
    </div>
  );
}

function DiagnosticsInner() {
  const fetchDiag = useServerFn(getEmailDiagnostics);
  const [range, setRange] = useState<"24h" | "7d" | "30d">("7d");

  const { data, isLoading, isFetching, refetch, isError, error } = useQuery({
    queryKey: ["email-diagnostics", range],
    queryFn: () => fetchDiag({ data: { range } }),
    refetchInterval: 30000,
  }) as any;

  if (isLoading) {
    return <div className="min-h-[40vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>;
  }
  if (isError) {
    return <p className="text-sm text-destructive">{String(error?.message ?? "Failed to load diagnostics.")}</p>;
  }

  const score = data?.healthScore ?? 0;
  const tone = healthTone(score);
  const rates = data?.rates ?? {};
  const counts = data?.counts ?? {};

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={`rounded-full border px-3 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors ${
                range === r.id ? "border-accent/50 bg-accent/15 text-accent" : "border-white/10 bg-white/[0.02] text-muted-foreground hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.02] px-3 py-1 text-[10px] text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`size-3 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Health score */}
      <div className={`glass border border-white/10 rounded-2xl p-5 ring-1 ${tone.ring}`}>
        <div className="flex items-center gap-2 mb-3">
          <Activity className={`size-4 ${tone.text}`} />
          <h2 className="text-sm font-semibold">Email Health Score</h2>
        </div>
        <div className="flex items-end gap-4">
          <p className={`text-5xl font-display tabular-nums ${tone.text}`}>{score}</p>
          <span className={`mb-2 text-xs font-mono uppercase tracking-wider ${tone.text}`}>{tone.label}</span>
        </div>
        <div className="mt-3 h-2 w-full rounded-full bg-white/5 overflow-hidden">
          <div className={`h-full ${tone.bar} transition-all`} style={{ width: `${score}%` }} />
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Across {counts.total ?? 0} emails in the last {range}.
        </p>
      </div>

      {/* Rates */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Delivery rate" value={`${rates.deliveryRate ?? 0}%`} icon={CheckCircle2} tone="text-emerald-400" />
        <StatCard label="Failure rate" value={`${rates.failureRate ?? 0}%`} icon={XCircle} tone="text-destructive" />
        <StatCard label="Bounce rate" value={`${rates.bounceRate ?? 0}%`} icon={MailWarning} tone="text-orange-400" />
        <StatCard label="Complaint rate" value={`${rates.complaintRate ?? 0}%`} icon={AlertTriangle} tone="text-amber-400" />
      </div>

      {/* Queue + suppression counts */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Queue depth" value={counts.queueDepth ?? 0} icon={Inbox} />
        <StatCard label="Dead letter queue" value={counts.dlqCount ?? 0} icon={Layers} tone={counts.dlqCount ? "text-destructive" : undefined} />
        <StatCard label="Suppressions" value={counts.suppressionCount ?? 0} icon={ShieldBan} />
      </div>

      {/* Last successful / failed */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="glass border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="size-4 text-emerald-400" />
            <h2 className="text-sm font-semibold">Last successful email</h2>
          </div>
          {data?.lastSuccessful ? (
            <Row title={data.lastSuccessful.template_name} sub={data.lastSuccessful.recipient_email} status={data.lastSuccessful.status} at={data.lastSuccessful.created_at} />
          ) : <p className="text-xs text-muted-foreground">None in range.</p>}
        </div>
        <div className="glass border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="size-4 text-destructive" />
            <h2 className="text-sm font-semibold">Last failed email</h2>
          </div>
          {data?.lastFailed ? (
            <Row title={data.lastFailed.template_name} sub={data.lastFailed.error_message ?? data.lastFailed.recipient_email} status={data.lastFailed.status} at={data.lastFailed.created_at} />
          ) : <p className="text-xs text-muted-foreground">None in range. 🎉</p>}
        </div>
      </div>

      {/* Recent lists */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <List
          title="Recent failures"
          icon={XCircle}
          rows={data?.recentFailures ?? []}
          render={(r: any) => (
            <Row key={r.id} title={r.template_name} sub={r.error_message ?? r.recipient_email} status={r.status} at={r.created_at} />
          )}
        />
        <List
          title="Recent bounces"
          icon={MailWarning}
          rows={data?.recentBounces ?? []}
          render={(r: any) => (
            <Row key={r.id} title={r.template_name} sub={r.recipient_email} status={r.status} at={r.created_at} />
          )}
        />
        <List
          title="Recent suppressions"
          icon={ShieldBan}
          rows={data?.recentSuppressions ?? []}
          render={(r: any) => (
            <Row key={r.id} title={r.email} sub={r.reason ?? "suppressed"} status={r.reason ?? "suppressed"} at={r.created_at} />
          )}
        />
      </div>
    </div>
  );
}
