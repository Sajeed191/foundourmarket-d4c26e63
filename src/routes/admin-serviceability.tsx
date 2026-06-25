import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, AlertTriangle, RefreshCw, Download, MapPinOff, CheckCircle2, CreditCard, MapPin } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { useServiceabilityAnalytics, type ServiceabilityAnalytics } from "@/lib/use-serviceability-analytics";

export const Route = createFileRoute("/admin-serviceability")({
  head: () => ({ meta: [{ title: "Address & Serviceability — Admin" }] }),
  component: ServiceabilityPage,
});

type Role = "admin" | "super_admin" | "manager" | "support" | "fulfillment" | "warehouse_staff" | "editor";
const ALLOW: Role[] = ["admin", "super_admin", "manager"];

function Card({ title, icon, children, actions }: { title?: string; icon?: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="card-premium rounded-2xl p-4 sm:p-5 w-full min-w-0">
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 mb-4">
          {title && <h2 className="text-sm font-medium flex items-center gap-2 min-w-0"><span className="shrink-0 text-accent">{icon}</span><span className="truncate">{title}</span></h2>}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

function Kpi({ label, value, sub, tone = "default" }: { label: string; value: string; sub?: string; tone?: "default" | "good" | "bad" }) {
  const c = tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="card-premium rounded-2xl p-4">
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${c}`}>{value}</p>
      {sub && <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Bar({ value, max, color = "bg-accent" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden"><div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} /></div>;
}

function RankList({ rows, color }: { rows: { key: string; count: number }[]; color?: string }) {
  const max = rows[0]?.count ?? 0;
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">No data in this window.</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate font-mono">{r.key}</span>
            <span className="tabular-nums text-muted-foreground shrink-0">{r.count}</span>
          </div>
          <Bar value={r.count} max={max} color={color} />
        </li>
      ))}
    </ul>
  );
}

function downloadReport(d: ServiceabilityAnalytics) {
  const lines: string[] = [];
  lines.push("FoundOurMarket Address & Serviceability Report");
  lines.push(`Window,${d.windowDays} days`);
  lines.push("");
  lines.push("Metric,Value");
  lines.push(`PIN/city mismatch warnings,${d.totals.pinCityWarnings}`);
  lines.push(`Unknown PIN entries,${d.totals.unknownPins}`);
  lines.push(`Lookup failures,${d.totals.lookupFailures}`);
  lines.push(`Unsupported PIN blocks,${d.totals.unsupportedBlocks}`);
  lines.push(`Warned sessions,${d.warnedSessions}`);
  lines.push(`Checkout after warning,${d.checkoutAfterWarning} (${d.checkoutAfterWarningRate}%)`);
  lines.push(`Payment after warning,${d.paymentAfterWarning} (${d.paymentAfterWarningRate}%)`);
  lines.push("");
  lines.push("Top unsupported PINs,Count");
  d.topUnsupportedPins.forEach((r) => lines.push(`${r.key},${r.count}`));
  lines.push("");
  lines.push("Top lookup failures,Count");
  d.topLookupFailures.forEach((r) => lines.push(`${r.key},${r.count}`));
  lines.push("");
  lines.push("Top unknown PINs,Count");
  d.topUnknownPins.forEach((r) => lines.push(`${r.key},${r.count}`));

  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `serviceability-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ServiceabilityPage() {
  const [windowDays, setWindowDays] = useState(30);
  const { data, loading, error, refresh } = useServiceabilityAnalytics(windowDays);

  return (
    <AdminShell title="Address & Serviceability" allow={ALLOW}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Address & Serviceability</h1>
            <p className="text-xs text-muted-foreground">PIN reliability, soft warnings & post-warning conversion</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl border border-white/10 overflow-hidden">
              {[7, 14, 30, 90].map((dd) => (
                <button key={dd} onClick={() => setWindowDays(dd)}
                  className={`px-3 py-1.5 text-xs ${windowDays === dd ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {dd}d
                </button>
              ))}
            </div>
            <button onClick={() => refresh()} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-xs hover:border-accent/40">
              <RefreshCw className="size-3.5" /> Refresh
            </button>
            {data && (
              <button onClick={() => downloadReport(data)} className="inline-flex items-center gap-1.5 rounded-xl bg-accent text-accent-foreground px-3 py-1.5 text-xs font-medium">
                <Download className="size-3.5" /> Report
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="grid place-items-center py-20"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : error ? (
          <Card><p className="text-xs text-destructive flex items-center gap-2"><AlertTriangle className="size-4" />{error}</p></Card>
        ) : !data ? null : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi label="Unsupported blocks" value={String(data.totals.unsupportedBlocks)} sub="Confirmed undeliverable PINs" tone={data.totals.unsupportedBlocks > 0 ? "bad" : "good"} />
              <Kpi label="Lookup failures" value={String(data.totals.lookupFailures)} sub="Service down — allowed through" />
              <Kpi label="Unknown PINs" value={String(data.totals.unknownPins)} sub="Not in postal DB — allowed" />
              <Kpi label="PIN/city mismatches" value={String(data.totals.pinCityWarnings)} sub="Soft warnings only" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <Kpi label="Warned sessions" value={String(data.warnedSessions)} sub="Sessions that saw any soft warning" />
              <Kpi label="Checkout after warning" value={`${data.checkoutAfterWarningRate}%`} sub={`${data.checkoutAfterWarning} of ${data.warnedSessions} created an order`} tone="good" />
              <Kpi label="Payment after warning" value={`${data.paymentAfterWarningRate}%`} sub={`${data.paymentAfterWarning} of ${data.warnedSessions} completed payment`} tone="good" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <Card title="Top unsupported PINs" icon={<MapPinOff className="size-4" />}>
                <RankList rows={data.topUnsupportedPins} color="bg-destructive" />
              </Card>
              <Card title="Top lookup failures" icon={<MapPin className="size-4" />}>
                <RankList rows={data.topLookupFailures} color="bg-amber-400" />
              </Card>
              <Card title="Top unknown PINs" icon={<CheckCircle2 className="size-4" />}>
                <RankList rows={data.topUnknownPins} color="bg-accent" />
              </Card>
            </div>

            <Card title="How blocking works" icon={<CreditCard className="size-4" />}>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Checkout is blocked <strong className="text-foreground">only</strong> for PINs that are
                not 6 digits or confirmed unsupported. Lookup failures, service outages, unknown PINs,
                and PIN/city mismatches show a soft warning and always allow the customer to save the
                address and proceed to payment.
              </p>
            </Card>
          </>
        )}
      </div>
    </AdminShell>
  );
}
