import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Brain, AlertTriangle, TrendingUp, TrendingDown, Minus, Package, Boxes,
  Loader2, RefreshCw, Clock, Truck, Sparkles, Globe, Flame, Skull, Layers,
  ArrowDownRight, Target, ShieldAlert, Lightbulb, Download, ChevronRight,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { KpiCard } from "@/components/admin/KpiCard";
import { InventoryMarketingHub } from "@/components/admin/InventoryMarketingHub";
import { downloadCSV } from "@/lib/admin-queries";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchIntelData, buildProductIntel, computeHealth, computeForecast,
  detectAlerts, regionalAnalytics, buildRecommendations, fmtCurrency, urgencyColor,
  type IntelData, type ProductIntel, type Alert, type Recommendation,
} from "@/lib/inventory-intelligence";

export const Route = createFileRoute("/admin-inventory-intelligence")({
  head: () => ({ meta: [{ title: "Inventory Intelligence — Admin" }] }),
  component: IntelPage,
});

const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" }) : "—");

function trendIcon(t: ProductIntel["trend"]) {
  if (t === "up") return <TrendingUp className="size-3 text-emerald-400" />;
  if (t === "down") return <TrendingDown className="size-3 text-destructive" />;
  return <Minus className="size-3 text-muted-foreground" />;
}

function IntelPage() {
  const [data, setData] = useState<IntelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    const d = await fetchIntelData();
    setData(d);
    setLoading(false);
    setRefreshing(false);
  }
  useEffect(() => {
    load();
    const ch = supabase.channel("intel-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const intel = useMemo(() => (data ? buildProductIntel(data) : []), [data]);
  const health = useMemo(() => computeHealth(intel), [intel]);
  const forecast = useMemo(() => (data ? computeForecast(data, intel) : []), [data, intel]);
  const alerts = useMemo(() => detectAlerts(intel), [intel]);
  const regions = useMemo(() => (data ? regionalAnalytics(data) : []), [data]);
  const recs = useMemo(() => buildRecommendations(intel), [intel]);

  const atRisk = useMemo(() => [...intel].filter((p) => p.urgency === "critical" || p.urgency === "high").sort((a, b) => b.riskScore - a.riskScore), [intel]);
  const stockouts = useMemo(() => [...intel].filter((p) => p.daysRemaining !== null).sort((a, b) => (a.daysRemaining ?? 1e9) - (b.daysRemaining ?? 1e9)).slice(0, 8), [intel]);
  const dead = useMemo(() => [...intel].filter((p) => p.classification === "dead" || p.classification === "overstock").sort((a, b) => b.cost * b.stock - a.cost * a.stock).slice(0, 6), [intel]);
  const movers = useMemo(() => [...intel].filter((p) => p.avgDailySales > 0).sort((a, b) => b.avgDailySales - a.avgDailySales).slice(0, 6), [intel]);
  const profitable = useMemo(() => [...intel].sort((a, b) => b.profit - a.profit).slice(0, 6), [intel]);
  const returned = useMemo(() => [...intel].filter((p) => p.returns > 0).sort((a, b) => b.returnRate - a.returnRate).slice(0, 6), [intel]);

  if (loading) {
    return (
      <AdminShell title="Inventory Intelligence" subtitle="Predictive stock health & forecasting" allow={["admin", "super_admin", "manager", "warehouse_staff"]}>
        <div className="min-h-[40vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      title="Inventory Intelligence"
      subtitle="Know what will sell, run out, and need reordering — before it happens"
      allow={["admin", "super_admin", "manager", "warehouse_staff"]}
      actions={
        <div className="flex items-center gap-2">
          <button onClick={() => downloadCSV("inventory-forecast.csv", intel.map((p) => ({
            slug: p.slug, name: p.name, stock: p.stock, reserved: p.reserved, available: p.available,
            avg_daily_sales: p.avgDailySales.toFixed(3), days_remaining: p.daysRemaining?.toFixed(1) ?? "",
            stockout_date: p.stockoutDate ? new Date(p.stockoutDate).toISOString().slice(0, 10) : "",
            suggested_reorder_qty: p.suggestedReorderQty, reorder_by: p.reorderByDate ? new Date(p.reorderByDate).toISOString().slice(0, 10) : "",
            risk_score: p.riskScore, confidence: p.confidence, return_rate: p.returnRate.toFixed(1), classification: p.classification,
          })))} className="inline-flex items-center gap-2 border border-border px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-mono hover:bg-white/5">
            <Download className="size-3" /> Export
          </button>
          <button onClick={() => { setRefreshing(true); load(); }} className="inline-flex items-center gap-2 border border-accent/30 bg-accent/10 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-mono hover:bg-accent/20">
            <RefreshCw className={`size-3 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      }
    >
      {/* Live inventory health */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Total products" value={health.totalProducts} icon={<Package className="size-4" />} />
        <KpiCard label="In stock" value={health.inStock} icon={<Boxes className="size-4" />} />
        <KpiCard label="Low stock" value={health.lowStock} icon={<AlertTriangle className="size-4" />}
          sub={<p className="text-[10px] font-mono uppercase tracking-widest text-amber-400">needs attention</p>} />
        <KpiCard label="Out of stock" value={health.outOfStock} icon={<ShieldAlert className="size-4" />}
          sub={health.outOfStock > 0 ? <p className="text-[10px] font-mono uppercase tracking-widest text-destructive">losing sales</p> : undefined} />
        <KpiCard label="Reserved" value={health.reservedUnits} icon={<Clock className="size-4" />} />
        <KpiCard label="Incoming" value={health.incomingProducts} icon={<Truck className="size-4" />} />
        <KpiCard label="Inventory value" value={fmtCurrency(health.inventoryValue)} icon={<Layers className="size-4" />}
          sub={<p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">retail {fmtCurrency(health.retailValue)}</p>} />
        <KpiCard label="Inventory at risk" value={fmtCurrency(health.inventoryAtRisk)} icon={<ArrowDownRight className="size-4" />}
          sub={<p className="text-[10px] font-mono uppercase tracking-widest text-destructive">capital exposure</p>} />
      </div>

      {/* Forecast engine */}
      <Section icon={<Brain className="size-4 text-accent" />} title="Forecasting engine" subtitle="Projected from real 90-day sales velocity">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {forecast.map((f) => (
            <div key={f.days} className="card-premium rounded-2xl p-4">
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">{f.days} days</p>
              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between"><dt className="text-muted-foreground">Units</dt><dd className="font-mono">{f.units.toLocaleString()}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Revenue</dt><dd className="font-mono">{fmtCurrency(f.revenue)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Profit</dt><dd className="font-mono text-emerald-400">{fmtCurrency(f.profit)}</dd></div>
                <div className="pt-1">
                  <div className="flex justify-between text-[10px] text-muted-foreground mb-1"><span>Depletion</span><span>{f.depletionPct.toFixed(0)}%</span></div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-accent to-primary" style={{ width: `${f.depletionPct}%` }} /></div>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </Section>

      {/* Smart alerts */}
      <Section icon={<AlertTriangle className="size-4 text-accent" />} title="Smart alerts" subtitle={`${alerts.length} signals detected`}>
        {alerts.length === 0 ? (
          <Empty text="No inventory alerts — everything is healthy." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {alerts.slice(0, 12).map((a) => <AlertCard key={a.id} a={a} />)}
          </div>
        )}
      </Section>

      {/* Dashboard widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <WidgetList title="Products at risk" icon={<ShieldAlert className="size-4 text-destructive" />} items={atRisk.slice(0, 6)}
          render={(p) => <RiskRow key={p.slug} p={p} />} empty="No products at risk." />
        <WidgetList title="Forecasted stockouts" icon={<Clock className="size-4 text-amber-400" />} items={stockouts}
          render={(p) => (
            <Row key={p.slug} p={p} right={<span className="font-mono text-xs text-amber-400">{p.daysRemaining !== null ? `${Math.round(p.daysRemaining)}d` : "—"}</span>}
              sub={`Stockout ${dt(p.stockoutDate)} · reorder ${p.suggestedReorderQty}`} />
          )} empty="No imminent stockouts." />
        <WidgetList title="Fastest movers" icon={<Flame className="size-4 text-accent" />} items={movers}
          render={(p) => <Row key={p.slug} p={p} right={<span className="font-mono text-xs">{p.avgDailySales.toFixed(2)}/d</span>} sub={`${p.unitsSold} sold · ${trendLabel(p)}`} />} empty="No sales yet." />
        <WidgetList title="Highest profit" icon={<TrendingUp className="size-4 text-emerald-400" />} items={profitable}
          render={(p) => <Row key={p.slug} p={p} right={<span className="font-mono text-xs text-emerald-400">{fmtCurrency(p.profit)}</span>} sub={`${p.unitsSold} sold · ${fmtCurrency(p.revenue)} rev`} />} empty="No profit data." />
        <WidgetList title="Dead & overstock" icon={<Skull className="size-4 text-muted-foreground" />} items={dead}
          render={(p) => <Row key={p.slug} p={p} right={<span className="font-mono text-xs text-muted-foreground">{fmtCurrency(p.cost * p.stock)}</span>} sub={`${p.stock} units · ${p.classification}`} />} empty="No dead stock." />
        <WidgetList title="Most returned" icon={<ArrowDownRight className="size-4 text-destructive" />} items={returned}
          render={(p) => <Row key={p.slug} p={p} right={<span className="font-mono text-xs text-destructive">{p.returnRate.toFixed(0)}%</span>} sub={`${p.returns} returned of ${p.unitsSold}`} />} empty="No returns recorded." />
      </div>

      {/* Reorder engine */}
      <Section icon={<Target className="size-4 text-accent" />} title="Reorder engine" subtitle="Suggested quantities, dates and urgency">
        <div className="card-premium rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5">Product</th>
                  <th className="text-right px-3 py-2.5">Avail</th>
                  <th className="text-right px-3 py-2.5">Daily</th>
                  <th className="text-right px-3 py-2.5">Days left</th>
                  <th className="text-right px-3 py-2.5">Stockout</th>
                  <th className="text-right px-3 py-2.5">Reorder</th>
                  <th className="text-right px-3 py-2.5">By</th>
                  <th className="text-center px-3 py-2.5">Conf.</th>
                  <th className="text-center px-3 py-2.5">Urgency</th>
                </tr>
              </thead>
              <tbody>
                {[...intel].filter((p) => p.suggestedReorderQty > 0).sort((a, b) => b.riskScore - a.riskScore).slice(0, 20).map((p) => (
                  <tr key={p.slug} className="border-b border-border/40 last:border-0">
                    <td className="px-4 py-2.5"><Link to="/products/$slug" params={{ slug: p.slug }} className="text-xs hover:text-accent">{p.name}</Link></td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">{p.available}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">{p.avgDailySales.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">{p.daysRemaining !== null ? Math.round(p.daysRemaining) : "∞"}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-[11px] text-muted-foreground">{dt(p.stockoutDate)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-accent">{p.suggestedReorderQty}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-[11px] text-muted-foreground">{dt(p.reorderByDate)}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-xs">{p.confidence}%</td>
                    <td className="px-3 py-2.5 text-center"><span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-widest border ${urgencyColor[p.urgency]}`}>{p.urgency}</span></td>
                  </tr>
                ))}
                {intel.filter((p) => p.suggestedReorderQty > 0).length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-xs text-muted-foreground">No reorders needed right now.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* Regional analytics */}
      <Section icon={<Globe className="size-4 text-accent" />} title="Regional analytics" subtitle="India vs International">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {regions.map((r) => (
            <div key={r.region} className="card-premium rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium capitalize">{r.region}</h3>
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{r.orders} orders</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <Stat label="Revenue" value={fmtCurrency(r.revenue)} />
                <Stat label="Profit" value={fmtCurrency(r.profit)} accent />
                <Stat label="Units" value={r.units.toLocaleString()} />
                <Stat label="Avg order" value={fmtCurrency(r.orders > 0 ? r.revenue / r.orders : 0)} />
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* AI recommendations */}
      <Section icon={<Sparkles className="size-4 text-accent" />} title="AI recommendations" subtitle="Data-driven next actions">
        {recs.length === 0 ? <Empty text="No recommendations right now." /> : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {recs.map((r) => <RecCard key={r.id} r={r} />)}
          </div>
        )}
      </Section>
    </AdminShell>
  );
}

function trendLabel(p: ProductIntel) {
  if (p.trend === "up") return `↑ ${p.trendPct.toFixed(0)}%`;
  if (p.trend === "down") return `↓ ${Math.abs(p.trendPct).toFixed(0)}%`;
  return "stable";
}

function Section({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h2 className="text-sm font-medium">{title}</h2>
        {subtitle && <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">· {subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p className={`font-display text-base ${accent ? "text-emerald-400" : ""}`}>{value}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="card-premium rounded-2xl px-5 py-8 text-center text-xs text-muted-foreground">{text}</div>;
}

function AlertCard({ a }: { a: Alert }) {
  const color = a.severity === "critical" ? "border-destructive/40 bg-destructive/5" : a.severity === "warning" ? "border-amber-400/30 bg-amber-400/5" : "border-border bg-white/[0.02]";
  const dot = a.severity === "critical" ? "bg-destructive" : a.severity === "warning" ? "bg-amber-400" : "bg-accent";
  return (
    <div className={`rounded-xl border px-4 py-3 ${color}`}>
      <div className="flex items-start gap-2.5">
        <span className={`mt-1 size-1.5 rounded-full ${dot} shrink-0`} />
        <div className="min-w-0">
          <p className="text-xs font-medium truncate">{a.title}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{a.detail}</p>
        </div>
      </div>
    </div>
  );
}

function RecCard({ r }: { r: Recommendation }) {
  const icons: Record<Recommendation["kind"], React.ReactNode> = {
    restock: <Truck className="size-3.5 text-accent" />,
    pricing: <TrendingUp className="size-3.5 text-emerald-400" />,
    bundle: <Layers className="size-3.5 text-accent" />,
    clearance: <ArrowDownRight className="size-3.5 text-amber-400" />,
    feature: <Sparkles className="size-3.5 text-accent" />,
  };
  return (
    <div className="rounded-xl border border-border bg-white/[0.02] px-4 py-3 flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0">{icons[r.kind]}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">{r.title}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{r.detail}</p>
      </div>
      <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground/60">{r.kind}</span>
    </div>
  );
}

function WidgetList({ title, icon, items, render, empty }: {
  title: string; icon: React.ReactNode; items: ProductIntel[]; render: (p: ProductIntel) => React.ReactNode; empty: string;
}) {
  return (
    <div className="card-premium rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">{icon}<h3 className="text-sm font-medium">{title}</h3></div>
      {items.length === 0 ? <p className="px-4 py-8 text-center text-xs text-muted-foreground">{empty}</p> : (
        <ul className="divide-y divide-border/40">{items.map(render)}</ul>
      )}
    </div>
  );
}

function Row({ p, right, sub }: { p: ProductIntel; right: React.ReactNode; sub: string }) {
  return (
    <li className="px-4 py-2.5 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <Link to="/products/$slug" params={{ slug: p.slug }} className="text-xs hover:text-accent block truncate">{p.name}</Link>
        <p className="text-[10px] font-mono text-muted-foreground truncate">{sub}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">{trendIcon(p.trend)}{right}</div>
    </li>
  );
}

function RiskRow({ p }: { p: ProductIntel }) {
  return (
    <li className="px-4 py-2.5 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <Link to="/products/$slug" params={{ slug: p.slug }} className="text-xs hover:text-accent block truncate">{p.name}</Link>
        <p className="text-[10px] font-mono text-muted-foreground truncate">
          {p.available} avail · {p.daysRemaining !== null ? `${Math.round(p.daysRemaining)}d left` : "no sales"} · reorder {p.suggestedReorderQty}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-12 rounded-full bg-white/5 overflow-hidden">
            <div className={`h-full rounded-full ${p.riskScore >= 75 ? "bg-destructive" : p.riskScore >= 50 ? "bg-amber-400" : "bg-accent"}`} style={{ width: `${p.riskScore}%` }} />
          </div>
          <span className="font-mono text-xs">{p.riskScore}</span>
        </div>
        <span className={`mt-1 inline-block px-1.5 py-0.5 rounded-full text-[8px] font-mono uppercase tracking-widest border ${urgencyColor[p.urgency]}`}>{p.urgency}</span>
      </div>
    </li>
  );
}
