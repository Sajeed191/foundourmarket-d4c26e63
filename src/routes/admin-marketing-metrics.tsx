import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3, Loader2, RefreshCw, Download, DollarSign, MousePointerClick,
  MailOpen, Target, TrendingUp,
} from "lucide-react";
import { AdminShell, logActivity } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  fetchCampaignMetrics, toKpis, metricsToCsv,
  type CampaignMetricRow, type CampaignKpis, type AttributionModel,
  type TimeRange, type AttrWindow,
} from "@/lib/marketing-metrics";

export const Route = createFileRoute("/admin-marketing-metrics")({
  head: () => ({ meta: [{ title: "Marketing Metrics — Admin" }] }),
  component: MarketingMetricsPage,
});

const RANGES: { k: TimeRange; label: string }[] = [
  { k: "7d", label: "7d" }, { k: "30d", label: "30d" },
  { k: "90d", label: "90d" }, { k: "365d", label: "1y" },
];
const WINDOWS: AttrWindow[] = [1, 7, 30];

function fmtNum(n: number): string {
  return new Intl.NumberFormat().format(Math.round(n));
}
function fmtMoney(n: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Math.round(n));
}
function pct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

function MarketingMetricsPage() {
  const [rows, setRows] = useState<CampaignMetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<TimeRange>("30d");
  const [attrWindow, setAttrWindow] = useState<AttrWindow>(30);
  const [model, setModel] = useState<AttributionModel>("last");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchCampaignMetrics(range, attrWindow));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  }, [range, attrWindow]);

  useEffect(() => { void load(); }, [load]);

  // Realtime campaign performance — refresh on any new engagement event.
  useEffect(() => {
    const ch = supabase
      .channel("rt-campaign-events")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "campaign_events" }, () => {
        void load();
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [load]);

  const kpis: CampaignKpis[] = useMemo(
    () => rows.map((r) => toKpis(r, model)),
    [rows, model],
  );

  const totals = useMemo(() => {
    const spend = kpis.reduce((a, r) => a + r.spend, 0);
    const revenue = kpis.reduce((a, r) => a + r.revenue, 0);
    const conversions = kpis.reduce((a, r) => a + r.conversions, 0);
    const opens = kpis.reduce((a, r) => a + r.opens, 0);
    const clicks = kpis.reduce((a, r) => a + r.clicks, 0);
    return {
      spend, revenue, conversions, opens, clicks,
      roas: spend > 0 ? revenue / spend : 0,
      cac: conversions > 0 ? spend / conversions : 0,
      convRate: clicks > 0 ? conversions / clicks : 0,
    };
  }, [kpis]);

  const exportCsv = useCallback(() => {
    const csv = metricsToCsv(kpis);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaign-metrics-${range}-${model}touch.csv`;
    a.click();
    URL.revokeObjectURL(url);
    logActivity("marketing_metrics_export", "marketing", undefined, { range, model, count: kpis.length });
    toast.success("Exported campaign metrics");
  }, [kpis, range, model]);

  return (
    <AdminShell>
      <div className="space-y-5 p-1">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-accent" />
            <div>
              <h1 className="text-lg font-semibold leading-tight">Marketing Metrics</h1>
              <p className="text-xs text-muted-foreground">Real opens, clicks & attributed revenue</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void load()} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
            <button onClick={exportCsv} disabled={!kpis.length} className="inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50">
              <Download className="h-3.5 w-3.5" /> Export
            </button>
          </div>
        </header>

        {/* Controls */}
        <div className="flex flex-wrap gap-3 text-xs">
          <Segmented label="Range" options={RANGES.map((r) => ({ k: r.k, label: r.label }))} value={range} onChange={(v) => setRange(v as TimeRange)} />
          <Segmented label="Attribution window" options={WINDOWS.map((w) => ({ k: String(w), label: `${w}d` }))} value={String(attrWindow)} onChange={(v) => setAttrWindow(Number(v) as AttrWindow)} />
          <Segmented label="Model" options={[{ k: "last", label: "Last touch" }, { k: "first", label: "First touch" }]} value={model} onChange={(v) => setModel(v as AttributionModel)} />
        </div>

        {/* Totals */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi icon={<DollarSign className="h-4 w-4" />} label="Revenue" value={fmtMoney(totals.revenue)} />
          <Kpi icon={<TrendingUp className="h-4 w-4" />} label="ROAS" value={`${totals.roas.toFixed(2)}x`} />
          <Kpi icon={<Target className="h-4 w-4" />} label="Conversions" value={fmtNum(totals.conversions)} />
          <Kpi icon={<DollarSign className="h-4 w-4" />} label="CAC" value={fmtMoney(totals.cac)} />
          <Kpi icon={<MailOpen className="h-4 w-4" />} label="Opens" value={fmtNum(totals.opens)} />
          <Kpi icon={<MousePointerClick className="h-4 w-4" />} label="Clicks" value={fmtNum(totals.clicks)} />
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-border">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : kpis.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">No campaign data for this range yet.</p>
          ) : (
            <table className="w-full min-w-[720px] text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
                  <th>Campaign</th><th>Status</th><th className="text-right">Opens</th>
                  <th className="text-right">Clicks</th><th className="text-right">Conv.</th>
                  <th className="text-right">Revenue</th><th className="text-right">Spend</th>
                  <th className="text-right">ROAS</th><th className="text-right">CAC</th>
                  <th className="text-right">Conv. rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {kpis.map((r) => (
                  <tr key={r.campaign_id} className="[&>td]:px-3 [&>td]:py-2 hover:bg-muted/30">
                    <td className="font-medium">{r.name}</td>
                    <td className="capitalize text-muted-foreground">{r.status}</td>
                    <td className="text-right font-mono">{fmtNum(r.opens)}</td>
                    <td className="text-right font-mono">{fmtNum(r.clicks)}</td>
                    <td className="text-right font-mono">{fmtNum(r.conversions)}</td>
                    <td className="text-right font-mono">{fmtMoney(r.revenue)}</td>
                    <td className="text-right font-mono">{fmtMoney(r.spend)}</td>
                    <td className="text-right font-mono">{r.roas.toFixed(2)}x</td>
                    <td className="text-right font-mono">{r.cac > 0 ? fmtMoney(r.cac) : "—"}</td>
                    <td className="text-right font-mono">{pct(r.conversionRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

function Segmented({ label, options, value, onChange }: {
  label: string; options: { k: string; label: string }[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{label}:</span>
      <div className="inline-flex rounded-md border border-border p-0.5">
        {options.map((o) => (
          <button
            key={o.k}
            onClick={() => onChange(o.k)}
            className={`rounded px-2.5 py-1 ${value === o.k ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}<span className="text-[11px]">{label}</span>
      </div>
      <p className="mt-1 font-mono text-lg font-semibold leading-none">{value}</p>
    </div>
  );
}
