import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Activity, Loader2, RefreshCw, Database, CheckCircle2, AlertTriangle,
  XCircle, ShoppingBag, CreditCard, Truck, Users, Package, Mail, Clock,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { getSystemHealth, type SystemHealth } from "@/lib/system-health.functions";

export const Route = createFileRoute("/admin-system-health")({
  head: () => ({ meta: [{ title: "System health — Admin" }] }),
  component: SystemHealthPage,
});

type Status = "healthy" | "warning" | "critical";

function StatusPill({ status }: { status: Status }) {
  const map = {
    healthy: { label: "Healthy", cls: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10", Icon: CheckCircle2 },
    warning: { label: "Warning", cls: "text-amber-400 border-amber-400/30 bg-amber-400/10", Icon: AlertTriangle },
    critical: { label: "Critical", cls: "text-rose-400 border-rose-400/30 bg-rose-400/10", Icon: XCircle },
  }[status];
  const { Icon } = map;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-mono ${map.cls}`}>
      <Icon className="h-3.5 w-3.5" /> {map.label}
    </span>
  );
}

function CountCard({
  label, value, icon: Icon,
}: { label: string; value: number | string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-xl border border-border/40 bg-white/[0.02] px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <p className="mt-1.5 text-2xl font-display">{value}</p>
    </div>
  );
}

function IssueRow({
  label, count, hint,
}: { label: string; count: number; hint: string }) {
  const status: Status = count === 0 ? "healthy" : count < 5 ? "warning" : "critical";
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-white/[0.02] px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="font-display text-lg tabular-nums">{count}</span>
        <StatusPill status={status} />
      </div>
    </div>
  );
}

function computeScore(d: SystemHealth): { score: number; status: Status } {
  let score = 100;
  const i = d.integrity;
  const e = d.errors;
  score -= (i.orphan_payments + i.orphan_order_items + i.orphan_shipments) * 5;
  score -= Math.min(e.failed_payments, 10);
  score -= Math.min(e.failed_emails, 10);
  score = Math.max(0, Math.min(100, score));
  const status: Status = score >= 90 ? "healthy" : score >= 70 ? "warning" : "critical";
  return { score, status };
}

function SystemHealthPage() {
  const fetchHealth = useServerFn(getSystemHealth);
  const { data, isLoading, isFetching, refetch, isError, error } = useQuery({
    queryKey: ["system-health"],
    queryFn: () => fetchHealth(),
    refetchInterval: 60_000,
  });

  const health = data as SystemHealth | undefined;
  const scored = health ? computeScore(health) : null;

  return (
    <AdminShell
      title="System health"
      subtitle="Database integrity, record counts & production error monitoring"
      allow={["admin", "super_admin", "manager"]}
      actions={
        <button
          onClick={() => refetch()}
          className="rounded-lg border border-border/40 bg-white/[0.02] p-2 text-muted-foreground hover:text-foreground"
          title="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading system health…
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" />
          {String((error as Error)?.message ?? "Failed to load system health.")}
        </div>
      ) : health && scored ? (
        <div className="space-y-6">
          {/* Overall score */}
          <div className="flex flex-col gap-3 rounded-2xl border border-border/40 bg-white/[0.02] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Activity className="h-6 w-6 text-primary" />
              <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Health score</p>
                <p className="font-display text-3xl">{scored.score}<span className="text-base text-muted-foreground">/100</span></p>
              </div>
            </div>
            <StatusPill status={scored.status} />
          </div>

          {/* Record counts */}
          <section className="space-y-3">
            <h2 className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Database records</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <CountCard label="Orders" value={health.counts.orders} icon={ShoppingBag} />
              <CountCard label="Payments" value={health.counts.payments} icon={CreditCard} />
              <CountCard label="Shipments" value={health.counts.shipments} icon={Truck} />
              <CountCard label="Customers" value={health.counts.customers} icon={Users} />
              <CountCard label="Products" value={health.counts.products} icon={Package} />
            </div>
          </section>

          {/* Integrity */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
              <Database className="h-3.5 w-3.5" /> Referential integrity
            </h2>
            <div className="space-y-2">
              <IssueRow label="Orphan payments" count={health.integrity.orphan_payments} hint="Payments referencing a missing order" />
              <IssueRow label="Orphan order items" count={health.integrity.orphan_order_items} hint="Order items referencing a missing order" />
              <IssueRow label="Orphan shipments" count={health.integrity.orphan_shipments} hint="Shipments referencing a missing order" />
            </div>
          </section>

          {/* Errors */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5" /> Error monitoring (last 30 days)
            </h2>
            <div className="space-y-2">
              <IssueRow label="Failed / cancelled orders" count={health.errors.failed_orders} hint="Orders that did not complete" />
              <IssueRow label="Failed payments" count={health.errors.failed_payments} hint="Payment attempts that failed" />
              <IssueRow label="Failed emails" count={health.errors.failed_emails} hint="Bounced, complained or dead-lettered" />
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-white/[0.02] px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" /> Pending emails</p>
                  <p className="text-[11px] text-muted-foreground">Queued, awaiting delivery</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-display text-lg tabular-nums">{health.errors.pending_emails}</span>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </AdminShell>
  );
}
