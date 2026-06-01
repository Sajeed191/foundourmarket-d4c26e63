import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Target, Loader2, RefreshCw, Download, DollarSign, TrendingUp, Users,
  Repeat, Layers, Globe, Smartphone, GitBranch, Lightbulb, Network,
} from "lucide-react";
import { AdminShell, logActivity } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  fetchAcquisition, computeKpis, withKpis, detectOpportunities,
  modelValue, MODEL_LABEL, dimensionToCsv, attributionToCsv,
  type AcquisitionRaw, type TimeRange, type AttrWindow, type AttributionModel,
  type DimensionRow, type DimensionKpi,
} from "@/lib/acquisition-intelligence";

export const Route = createFileRoute("/admin-acquisition-intelligence")({
  head: () => ({
    meta: [
      { title: "Acquisition Intelligence — FoundOurMarket™" },
      { name: "description", content: "Real CAC, ROAS, CPA and multi-touch attribution across every campaign, channel, source and market." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { view?: string } => ({ view: typeof s.view === "string" ? s.view : undefined }),
  component: AcquisitionPage,
});

const RANGES: { k: TimeRange; label: string }[] = [
  { k: "7d", label: "7d" }, { k: "30d", label: "30d" },
  { k: "90d", label: "90d" }, { k: "365d", label: "1y" },
];
const WINDOWS: AttrWindow[] = [1, 7, 30];
const MODELS: AttributionModel[] = ["first", "last", "linear", "time_decay"];

const fmtNum = (n: number) => new Intl.NumberFormat().format(Math.round(n));
const money = (n: number) => "$" + new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Math.round(n));
const x = (n: number) => n.toFixed(2) + "×";
const pct = (n: number) => (n * 100).toFixed(1) + "%";

function download(name: string, content: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function Kpi({ icon: Icon, label, value, sub, tone = "default" }: {
  icon: React.ElementType; label: string; value: string; sub?: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneCls = tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-rose-400" : tone === "warn" ? "text-amber-400" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card/40 p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={`mt-1 text-lg font-semibold leading-tight ${toneCls}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function BreakdownTable({ title, icon: Icon, rows, onExport, showVisitors }: {
  title: string; icon: React.ElementType; rows: DimensionKpi[]; onExport: () => void; showVisitors?: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => r.revenue));
  return (
    <section className="rounded-2xl border border-border bg-card/30 p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-accent" /> {title}</h3>
        <button onClick={onExport} disabled={!rows.length} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50">
          <Download className="h-3 w-3" /> CSV
        </button>
      </header>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">No attributed data in range.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="py-1.5 text-left font-medium">{title.replace(/^By /, "")}</th>
                <th className="py-1.5 text-right font-medium">Revenue</th>
                <th className="py-1.5 text-right font-medium">Orders</th>
                {showVisitors && <th className="py-1.5 text-right font-medium">Visitors</th>}
                <th className="py-1.5 text-right font-medium">Spend</th>
                <th className="py-1.5 text-right font-medium">ROAS</th>
                <th className="py-1.5 text-right font-medium">CAC</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-border/30">
                  <td className="py-1.5 pr-2">
                    <div className="font-medium truncate max-w-[140px]">{r.key}</div>
                    <div className="mt-1 h-1 w-full rounded bg-muted">
                      <div className="h-1 rounded bg-accent" style={{ width: `${(r.revenue / max) * 100}%` }} />
                    </div>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{money(r.revenue)}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmtNum(r.orders)}</td>
                  {showVisitors && <td className="py-1.5 text-right tabular-nums">{fmtNum(r.visitors ?? 0)}</td>}
                  <td className="py-1.5 text-right tabular-nums">{r.spend > 0 ? money(r.spend) : "—"}</td>
                  <td className={`py-1.5 text-right tabular-nums ${r.spend > 0 ? (r.roas >= 1 ? "text-emerald-400" : "text-rose-400") : "text-muted-foreground"}`}>{r.spend > 0 ? x(r.roas) : "—"}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.spend > 0 && r.orders > 0 ? money(r.cac) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AcquisitionPage() {
  const [raw, setRaw] = useState<AcquisitionRaw | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<TimeRange>("30d");
  const [attrWindow, setAttrWindow] = useState<AttrWindow>(30);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRaw(await fetchAcquisition(range, attrWindow));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load acquisition intelligence");
    } finally {
      setLoading(false);
    }
  }, [range, attrWindow]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { logActivity("acquisition_intelligence_open", "marketing"); }, []);

  // Realtime: refresh on any new tracking / attribution / order activity.
  useEffect(() => {
    const ch = supabase
      .channel("rt-acquisition")
      .on("postgres_changes", { event: "*", schema: "public", table: "campaign_events" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "attribution_touches" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "order_attributions" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [load]);

  const kpis = useMemo(() => (raw ? computeKpis(raw) : null), [raw]);
  const opportunities = useMemo(() => (raw ? detectOpportunities(raw) : []), [raw]);

  if (loading && !raw) {
    return (
      <AdminShell title="Acquisition Intelligence" allow={["admin", "super_admin", "manager", "editor"]}>
        <div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Acquisition Intelligence" subtitle="Real CAC · ROAS · CPA · multi-touch attribution" allow={["admin", "super_admin", "manager", "editor"]}>
      <div className="space-y-5 p-1">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-accent" />
            <div>
              <h1 className="text-lg font-semibold leading-tight">Acquisition Intelligence</h1>
              <p className="text-xs text-muted-foreground">Every metric derived from real spend, events & attributed orders</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-border p-0.5">
              {RANGES.map((r) => (
                <button key={r.k} onClick={() => setRange(r.k)} className={`rounded px-2 py-1 text-xs ${range === r.k ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}>{r.label}</button>
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs">
              <span className="text-muted-foreground">Window</span>
              {WINDOWS.map((w) => (
                <button key={w} onClick={() => setAttrWindow(w)} className={`rounded px-1.5 ${attrWindow === w ? "text-accent font-semibold" : "text-muted-foreground"}`}>{w}d</button>
              ))}
            </div>
            <button onClick={() => void load()} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
        </header>

        {kpis && raw && (
          <>
            {/* Executive KPIs */}
            <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Kpi icon={TrendingUp} label="ROAS" value={kpis.spend > 0 ? x(kpis.roas) : "—"} tone={kpis.roas >= 1 ? "good" : "bad"} sub={`${money(kpis.revenue)} rev`} />
              <Kpi icon={DollarSign} label="CAC" value={kpis.conversions > 0 ? money(kpis.cac) : "—"} sub={`${money(kpis.spend)} spend`} />
              <Kpi icon={Target} label="CPA" value={kpis.conversions > 0 ? money(kpis.cpa) : "—"} sub={`${fmtNum(kpis.conversions)} conv`} />
              <Kpi icon={Users} label="Conv. rate" value={pct(kpis.conversionRate)} sub={`${fmtNum(kpis.visitors)} visitors`} />
              <Kpi icon={DollarSign} label="Rev / visitor" value={money(kpis.revenuePerVisitor)} sub={`${money(kpis.revenuePerSession)} / session`} />
              <Kpi icon={Repeat} label="New / returning" value={`${pct(kpis.newCustomerRate)}`} sub={`${pct(kpis.returningCustomerRate)} returning`} />
            </section>

            {/* Funnel Analytics */}
            <section className="rounded-2xl border border-border bg-card/30 p-4">
              <h3 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold"><Network className="h-4 w-4 text-accent" /> Funnel Analytics</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[
                  { l: "Visitors", v: kpis.visitors },
                  { l: "Sessions", v: kpis.sessions },
                  { l: "Opens", v: kpis.opens },
                  { l: "Clicks", v: kpis.clicks },
                  { l: "Conversions", v: kpis.conversions },
                ].map((s, i, arr) => {
                  const top = arr[0].v || 1;
                  return (
                    <div key={s.l} className="rounded-lg border border-border/60 bg-background/40 p-2.5">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.l}</div>
                      <div className="text-base font-semibold tabular-nums">{fmtNum(s.v)}</div>
                      <div className="mt-1 h-1 rounded bg-muted">
                        <div className="h-1 rounded bg-accent" style={{ width: `${Math.min(100, (s.v / top) * 100)}%` }} />
                      </div>
                      {i > 0 && <div className="mt-1 text-[10px] text-muted-foreground">{pct((s.v) / (arr[i - 1].v || 1))} of prev</div>}
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">Assisted conversions: {fmtNum(kpis.assistedConversions)} (orders touched by more than one campaign).</p>
            </section>

            {/* Opportunity Detection */}
            <section className="rounded-2xl border border-border bg-card/30 p-4">
              <h3 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold"><Lightbulb className="h-4 w-4 text-accent" /> Acquisition Opportunities</h3>
              {opportunities.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">No opportunities detected — record ad spend & attributed orders to surface recommendations.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {opportunities.map((o) => {
                    const tone = o.severity === "positive" ? "border-emerald-500/40 bg-emerald-500/5"
                      : o.severity === "critical" ? "border-rose-500/40 bg-rose-500/5"
                      : o.severity === "warning" ? "border-amber-500/40 bg-amber-500/5"
                      : "border-border bg-background/40";
                    return (
                      <div key={o.id} className={`rounded-xl border p-3 ${tone}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold">{o.title}</span>
                          <span className="text-xs font-mono tabular-nums">{o.metric}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">{o.detail}</p>
                        <p className="mt-1.5 text-[11px]"><span className="font-medium text-accent">→ </span>{o.recommendation}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Attribution Model Comparison */}
            <section className="rounded-2xl border border-border bg-card/30 p-4">
              <header className="mb-3 flex items-center justify-between">
                <h3 className="inline-flex items-center gap-2 text-sm font-semibold"><GitBranch className="h-4 w-4 text-accent" /> Attribution Model Comparison</h3>
                <button onClick={() => download(`attribution-${range}-${attrWindow}d.csv`, attributionToCsv(raw.attribution_models))} disabled={!raw.attribution_models.length} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50">
                  <Download className="h-3 w-3" /> CSV
                </button>
              </header>
              {raw.attribution_models.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">No attributed conversions in range.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      <tr className="border-b border-border/60">
                        <th className="py-1.5 text-left font-medium">Campaign</th>
                        {MODELS.map((m) => <th key={m} className="py-1.5 text-right font-medium">{MODEL_LABEL[m]}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {raw.attribution_models.map((r) => (
                        <tr key={r.campaign_id} className="border-b border-border/30">
                          <td className="py-1.5 pr-2 font-medium truncate max-w-[160px]">{r.key}</td>
                          {MODELS.map((m) => {
                            const v = modelValue(r, m);
                            return <td key={m} className="py-1.5 text-right tabular-nums">{money(v.revenue)}<span className="text-muted-foreground"> · {v.conversions.toFixed(1)}</span></td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-[10px] text-muted-foreground">Each cell: attributed revenue · conversions. Models differ because credit is split differently across the touch path.</p>
                </div>
              )}
            </section>

            {/* Breakdowns */}
            <div className="grid gap-3 lg:grid-cols-2">
              <BreakdownTable title="By Source" icon={GitBranch} rows={withKpis(raw.by_source)} showVisitors onExport={() => download(`source-${range}.csv`, dimensionToCsv("Source", withKpis(raw.by_source)))} />
              <BreakdownTable title="By Campaign" icon={Target} rows={withKpis(raw.by_campaign)} onExport={() => download(`campaign-${range}.csv`, dimensionToCsv("Campaign", withKpis(raw.by_campaign)))} />
              <BreakdownTable title="By Channel" icon={Layers} rows={withKpis(raw.by_channel)} onExport={() => download(`channel-${range}.csv`, dimensionToCsv("Channel", withKpis(raw.by_channel)))} />
              <BreakdownTable title="By Medium" icon={Layers} rows={withKpis(raw.by_medium)} showVisitors onExport={() => download(`medium-${range}.csv`, dimensionToCsv("Medium", withKpis(raw.by_medium)))} />
              <BreakdownTable title="By Country" icon={Globe} rows={withKpis(raw.by_country)} onExport={() => download(`country-${range}.csv`, dimensionToCsv("Country", withKpis(raw.by_country)))} />
              <BreakdownTable title="By Region" icon={Globe} rows={withKpis(raw.by_region)} onExport={() => download(`region-${range}.csv`, dimensionToCsv("Region", withKpis(raw.by_region)))} />
              <BreakdownTable title="By Device" icon={Smartphone} rows={withKpis(raw.by_device)} onExport={() => download(`device-${range}.csv`, dimensionToCsv("Device", withKpis(raw.by_device)))} />
              <BreakdownTable title="By UTM campaign" icon={Target} rows={withKpis(raw.by_utm_campaign)} showVisitors onExport={() => download(`utm-${range}.csv`, dimensionToCsv("UTM campaign", withKpis(raw.by_utm_campaign)))} />
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}
