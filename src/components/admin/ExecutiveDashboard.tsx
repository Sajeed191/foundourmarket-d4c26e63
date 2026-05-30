import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Crown, TrendingUp, TrendingDown, Wallet, Percent, ShoppingCart, Users,
  Target, Gauge, Boxes, Sparkles, AlertTriangle, Activity, Globe, Loader2,
  Download, FileText, Rocket, RotateCcw, Megaphone, Package, LifeBuoy,
  HeartPulse, Lightbulb, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { useExecutiveIntelligence } from "@/lib/use-executive-intelligence";
import {
  type Opportunity, type ExecRisk, type DriverRow, type AIInsight, type HealthBand,
} from "@/lib/executive-intelligence";
import { scaleCampaign, pauseFinancialCampaign, launchProfitCampaign } from "@/lib/financial-marketing";
import { logActivity } from "@/components/admin/AdminShell";
import { cn } from "@/lib/utils";
import { AISummaryCard } from "@/components/admin/AISummaryCard";

const EASE = [0.16, 1, 0.3, 1] as const;
const money = (n: number, c = "USD") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: c, maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0);
const num = (n: number) => new Intl.NumberFormat().format(Math.round(n || 0));

const bandTone: Record<HealthBand, string> = {
  high: "text-rose-300 border-rose-400/30 bg-rose-400/10",
  medium: "text-amber-300 border-amber-400/30 bg-amber-400/10",
  low: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10",
};

function Panel({ title, icon, children, id, actions }: { title: string; icon: React.ReactNode; children: React.ReactNode; id?: string; actions?: React.ReactNode }) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
      className="relative overflow-hidden rounded-2xl glass glass-reflect scroll-mt-24"
      style={{ boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.05), 0 22px 50px -32px oklch(0 0 0 / 0.85)" }}
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-accent shrink-0">{icon}</span>
          <h2 className="text-[13px] font-medium truncate">{title}</h2>
        </div>
        {actions}
      </div>
      <div className="px-4 pb-4">{children}</div>
    </motion.section>
  );
}

function HealthRing({ value }: { value: number }) {
  const tone = value >= 70 ? "text-emerald-400" : value >= 50 ? "text-amber-400" : "text-rose-400";
  const r = 42, c = 2 * Math.PI * r;
  return (
    <div className="relative size-28 shrink-0">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="oklch(1 0 0 / 0.08)" strokeWidth="8" />
        <motion.circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round"
          className={tone} strokeDasharray={c}
          initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c - (c * value) / 100 }}
          transition={{ duration: 1, ease: EASE }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className={cn("text-2xl font-display font-semibold tabular-nums", tone)}>{value}</span>
      </div>
    </div>
  );
}

function HealthBar({ label, value }: { label: string; value: number }) {
  const tone = value >= 70 ? "bg-emerald-400" : value >= 50 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-medium">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <motion.div className={cn("h-full rounded-full", tone)} initial={{ width: 0 }} animate={{ width: `${value}%` }} transition={{ duration: 0.8, ease: EASE }} />
      </div>
    </div>
  );
}

function DriverList({ rows, currency, positive = true }: { rows: DriverRow[]; currency: string; positive?: boolean }) {
  if (!rows.length) return <p className="text-[11px] text-muted-foreground py-3">No data yet.</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`} className="flex items-center justify-between gap-2 text-xs">
          <span className="truncate text-foreground/90">{r.label}</span>
          <span className="flex items-center gap-1.5 shrink-0">
            {r.sub && <span className="text-[10px] text-muted-foreground">{r.sub}</span>}
            <span className={cn("tabular-nums font-medium", positive ? "text-emerald-300" : "text-rose-300")}>{money(r.value, currency)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

const VIEW_ANCHORS: Record<string, string> = {
  health: "health",
  snapshot: "today",
  opportunities: "opportunities",
  risks: "risks",
  insights: "insights",
  regions: "regions",
  profit: "profit-drivers",
  loss: "loss-drivers",
  timeline: "timeline",
};

export function ExecutiveDashboard({ focusView }: { focusView?: string }) {
  const { model, today, timeline, loading, currency } = useExecutiveIntelligence();
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!focusView || loading || !model) return;
    const anchor = VIEW_ANCHORS[focusView];
    if (!anchor) return;
    requestAnimationFrame(() => {
      const el = document.getElementById(anchor);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("deep-link-flash");
      setTimeout(() => el.classList.remove("deep-link-flash"), 2000);
    });
  }, [focusView, loading, model]);

  const act = useCallback(async (id: string, fn: () => Promise<{ error?: string }>) => {
    setBusy(id);
    const res = await fn();
    setBusy(null);
    if (!res.error) setDone((s) => new Set(s).add(id));
  }, []);

  const exportCSV = useCallback(() => {
    if (!model) return;
    const s = model.scorecard;
    const rows: [string, string][] = [
      ["Revenue", String(s.revenue.toFixed(2))], ["Profit", String(s.profit.toFixed(2))],
      ["Net Margin %", s.netMargin.toFixed(1)], ["Orders", String(s.orders)],
      ["Customers", String(s.customers)], ["Conversion %", s.conversionRate.toFixed(2)],
      ["AOV", s.aov.toFixed(2)], ["LTV", s.ltv.toFixed(2)],
      ["Inventory Value", s.inventoryValue.toFixed(2)], ["Campaign ROI", s.roi.toFixed(2)],
      ["Growth %", s.growth.toFixed(1)], ["Business Health", String(model.health.overall)],
    ];
    const csv = ["Metric,Value", ...rows.map((r) => `"${r[0]}","${r[1]}"`)].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `foundourmarket-executive-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    logActivity("executive_export_csv", "executive");
  }, [model]);

  const exportPDF = useCallback(() => { logActivity("executive_export_pdf", "executive"); window.print(); }, []);

  if (loading || !model) {
    return <div className="min-h-[40vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>;
  }

  const { scorecard: s, health: h } = model;
  

  const cards = [
    { label: "Revenue", value: money(s.revenue, currency), icon: Wallet, accent: "text-accent" },
    { label: "Profit", value: money(s.profit, currency), icon: TrendingUp, accent: s.profit >= 0 ? "text-emerald-300" : "text-rose-300" },
    { label: "Net Margin", value: `${s.netMargin.toFixed(1)}%`, icon: Percent, accent: "text-violet-300" },
    { label: "Orders", value: num(s.orders), icon: ShoppingCart, accent: "text-accent" },
    { label: "Customers", value: num(s.customers), icon: Users, accent: "text-teal-300" },
    { label: "Conversion", value: `${s.conversionRate.toFixed(2)}%`, icon: Target, accent: "text-violet-300" },
    { label: "Avg Order Value", value: money(s.aov, currency), icon: Gauge, accent: "text-accent" },
    { label: "Lifetime Value", value: money(s.ltv, currency), icon: HeartPulse, accent: "text-teal-300" },
    { label: "Inventory Value", value: money(s.inventoryValue, currency), icon: Boxes, accent: "text-amber-300" },
    { label: "Campaign ROI", value: `${s.roi.toFixed(1)}×`, icon: Rocket, accent: "text-emerald-300" },
    { label: "Growth", value: `${s.growth >= 0 ? "+" : ""}${s.growth.toFixed(0)}%`, icon: s.growth >= 0 ? TrendingUp : TrendingDown, accent: s.growth >= 0 ? "text-emerald-300" : "text-rose-300" },
  ];

  const todayCards = today ? [
    { label: "Orders today", value: num(today.orders) },
    { label: "Revenue today", value: money(today.revenue, currency) },
    { label: "Profit today", value: money(today.profit, currency) },
    { label: "New customers", value: num(today.newCustomers) },
    { label: "Refunds today", value: money(today.refunds, currency) },
    { label: "Returns today", value: num(today.returns) },
    { label: "Support tickets", value: num(today.supportTickets) },
    { label: "Campaign profit", value: money(today.campaignProfit, currency), sub: `${today.activeCampaigns} active` },
  ] : [];

  return (
    <div className="space-y-5">
      {/* toolbar */}
      <div className="flex items-center justify-end gap-2">
        <button onClick={exportCSV} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-widest bg-white/[0.04] border border-white/[0.08] hover:border-accent/30 transition-all active:scale-95"><Download className="size-3" /> CSV</button>
        <button onClick={exportPDF} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-widest bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 transition-all active:scale-95"><FileText className="size-3" /> Board Report</button>
      </div>

      {/* scorecard */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {cards.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02, ease: EASE }}
            className="relative overflow-hidden rounded-2xl glass p-4">
            <div className="flex items-center gap-2 mb-2"><c.icon className={cn("size-4", c.accent)} /><span className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground/80">{c.label}</span></div>
            <p className="text-xl font-display font-semibold tabular-nums">{c.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* business health */}
        <Panel id="health" title="Business Health Score" icon={<HeartPulse className="size-4" />}
          actions={<span className={cn("text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border", bandTone[h.risk])}>{h.risk} risk</span>}>
          <div className="flex items-center gap-5">
            <div className="text-center">
              <HealthRing value={h.overall} />
              <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Overall · {h.trend >= 0 ? "▲" : "▼"} {Math.abs(h.trend).toFixed(0)}%</p>
            </div>
            <div className="flex-1 space-y-2">
              <HealthBar label="Revenue" value={h.revenue} />
              <HealthBar label="Profit" value={h.profit} />
              <HealthBar label="Customer" value={h.customer} />
              <HealthBar label="Inventory" value={h.inventory} />
              <HealthBar label="Marketing" value={h.marketing} />
              <HealthBar label="Support" value={h.support} />
              <HealthBar label="Storefront" value={h.storefront} />
            </div>
          </div>
        </Panel>

        {/* today */}
        <Panel id="today" title="Today's Snapshot" icon={<Activity className="size-4" />}>
          <div className="grid grid-cols-2 gap-2.5">
            {todayCards.map((t) => (
              <div key={t.label} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <p className="text-base font-semibold tabular-nums">{t.value}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t.label}</p>
                {t.sub && <p className="text-[10px] text-accent">{t.sub}</p>}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* opportunities & risks */}
      <div className="grid lg:grid-cols-2 gap-5">
        <Panel id="opportunities" title="Top Opportunities" icon={<Sparkles className="size-4" />}>
          <ul className="space-y-2">
            {model.opportunities.length === 0 && <p className="text-[11px] text-muted-foreground">No new opportunities detected.</p>}
            {model.opportunities.map((o: Opportunity) => (
              <li key={o.id} className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{o.title}</p>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">{o.detail}</p>
                  </div>
                  <span className="text-[11px] text-emerald-300 tabular-nums shrink-0">{money(o.impact, currency)}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  {o.campaignId && o.kind === "increase_spend" && (
                    <button disabled={busy === o.id || done.has(o.id)} onClick={() => act(o.id, () => scaleCampaign({ id: o.campaignId! } as never))}
                      className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-full bg-emerald-400/15 text-emerald-300 border border-emerald-400/30 disabled:opacity-50">
                      {busy === o.id ? <Loader2 className="size-3 animate-spin" /> : done.has(o.id) ? "Scaled ✓" : "Scale"}
                    </button>
                  )}
                  {o.to && <Link to={o.to} className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-full bg-white/[0.04] border border-white/10 hover:border-accent/30 inline-flex items-center gap-1">Open <ArrowUpRight className="size-3" /></Link>}
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel id="risks" title="Top Risks" icon={<AlertTriangle className="size-4" />}>
          <ul className="space-y-2">
            {model.risks.length === 0 && <p className="text-[11px] text-muted-foreground">No active risks.</p>}
            {model.risks.map((r: ExecRisk) => (
              <li key={r.id} className={cn("rounded-xl border p-3", bandTone[r.severity])}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{r.title}</p>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">{r.detail}</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  {r.campaignId && r.kind === "campaign_loss" && (
                    <button disabled={busy === r.id || done.has(r.id)} onClick={() => act(r.id, () => pauseFinancialCampaign(r.campaignId!))}
                      className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-full bg-rose-400/15 text-rose-300 border border-rose-400/30 disabled:opacity-50">
                      {busy === r.id ? <Loader2 className="size-3 animate-spin" /> : done.has(r.id) ? "Paused ✓" : "Pause"}
                    </button>
                  )}
                  {r.to && <Link to={r.to} className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-full bg-white/[0.04] border border-white/10 hover:border-accent/30 inline-flex items-center gap-1">Open risk <ArrowUpRight className="size-3" /></Link>}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* AI insights */}
      <Panel id="insights" title="AI Executive Insights" icon={<Lightbulb className="size-4" />}>
        <div className="grid sm:grid-cols-2 gap-3">
          {model.insights.map((ai: AIInsight) => (
            <div key={ai.id} className={cn("rounded-xl border p-3 space-y-1.5",
              ai.tone === "danger" ? "border-rose-400/30 bg-rose-400/5" : ai.tone === "warn" ? "border-amber-400/30 bg-amber-400/5" : ai.tone === "good" ? "border-emerald-400/30 bg-emerald-400/5" : "border-white/10 bg-white/[0.02]")}>
              <p className="text-xs"><span className="text-muted-foreground">What happened: </span>{ai.whatHappened}</p>
              <p className="text-xs"><span className="text-muted-foreground">Why: </span>{ai.whyHappened}</p>
              <p className="text-xs"><span className="text-muted-foreground">What to do: </span>{ai.whatToDo}</p>
              <p className="text-xs"><span className="text-muted-foreground">Impact: </span>{ai.expectedImpact}</p>
              <p className="text-[10px] font-mono uppercase tracking-widest text-accent">Confidence {ai.confidence}%</p>
            </div>
          ))}
        </div>
      </Panel>

      {/* regional + map */}
      <div className="grid lg:grid-cols-2 gap-5">
        <Panel id="regions" title="Regional Intelligence" icon={<Globe className="size-4" />}>
          <div className="space-y-3">
            {model.regions.map((r) => (
              <div key={r.region} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between mb-2"><span className="text-sm font-medium capitalize">{r.region}</span><span className="text-[11px] text-emerald-300 tabular-nums">{money(r.profit, currency)}</span></div>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <Stat label="Revenue" value={money(r.revenue, currency)} />
                  <Stat label="Orders" value={num(r.orders)} />
                  <Stat label="Customers" value={num(r.customers)} />
                  <Stat label="Margin" value={`${r.margin.toFixed(0)}%`} />
                  <Stat label="Camp ROI" value={`${r.campaignRoi.toFixed(1)}×`} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel id="map" title="Executive Map" icon={<Globe className="size-4" />}>
          <div className="space-y-3 text-xs">
            <div><p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Top revenue zones</p>
              <DriverList currency={currency} rows={[...model.regions].sort((a, b) => b.revenue - a.revenue).map((r) => ({ label: r.region, value: r.revenue, sub: `${r.orders} orders` }))} /></div>
            <div><p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Top profit zones</p>
              <DriverList currency={currency} rows={[...model.regions].sort((a, b) => b.profit - a.profit).map((r) => ({ label: r.region, value: r.profit, sub: `${r.margin.toFixed(0)}% margin` }))} /></div>
          </div>
        </Panel>
      </div>

      {/* profit & loss drivers */}
      <div className="grid lg:grid-cols-2 gap-5">
        <Panel id="profit-drivers" title="Profit Drivers" icon={<TrendingUp className="size-4" />}>
          <div className="space-y-3">
            <Sub label="Top Products"><DriverList currency={currency} rows={model.profitDrivers.products} /></Sub>
            <Sub label="Top Categories"><DriverList currency={currency} rows={model.profitDrivers.categories} /></Sub>
            <Sub label="Top Campaigns"><DriverList currency={currency} rows={model.profitDrivers.campaigns} /></Sub>
            <Sub label="Top Segments"><DriverList currency={currency} rows={model.profitDrivers.segments} /></Sub>
            <Sub label="Top Regions"><DriverList currency={currency} rows={model.profitDrivers.regions} /></Sub>
          </div>
        </Panel>

        <Panel id="loss-drivers" title="Loss Drivers" icon={<TrendingDown className="size-4" />}>
          <div className="space-y-3">
            <Sub label="Worst Products"><DriverList currency={currency} positive={false} rows={model.lossDrivers.products} /></Sub>
            <Sub label="Worst Campaigns"><DriverList currency={currency} positive={false} rows={model.lossDrivers.campaigns} /></Sub>
            <Sub label="Refund Sources"><DriverList currency={currency} positive={false} rows={model.lossDrivers.refundSources} /></Sub>
            <Sub label="Support Cost Drivers">{model.lossDrivers.supportCostDrivers.length ? <ul className="space-y-1.5">{model.lossDrivers.supportCostDrivers.map((r, i) => <li key={i} className="flex justify-between text-xs"><span className="truncate">{r.label}</span><span className="text-rose-300 tabular-nums">{num(r.value)} {r.sub}</span></li>)}</ul> : <p className="text-[11px] text-muted-foreground py-2">No data yet.</p>}</Sub>
            <Sub label="Inventory Loss"><DriverList currency={currency} positive={false} rows={model.lossDrivers.inventoryLoss} /></Sub>
          </div>
        </Panel>
      </div>

      {/* one-click actions */}
      <Panel id="actions" title="One-Click Actions" icon={<Rocket className="size-4" />}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <ActionLink to="/admin-financial?view=campaigns" icon={<Rocket className="size-4" />} label="Scale Winner" />
          <ActionLink to="/admin-financial?view=campaigns" icon={<AlertTriangle className="size-4" />} label="Pause Loser" />
          <button onClick={() => act("launch", () => launchProfitCampaign({ template: "high_margin", launch: false }))}
            className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left hover:border-accent/30 transition-all">
            <Megaphone className="size-4 text-accent mb-1.5" /><p className="text-xs font-medium">{busy === "launch" ? "Launching…" : done.has("launch") ? "Created ✓" : "Launch Campaign"}</p>
          </button>
          <ActionLink to="/admin-inventory-intelligence?view=opportunities" icon={<Package className="size-4" />} label="Restock Product" />
          <ActionLink to="/admin-products?view=marketing" icon={<Sparkles className="size-4" />} label="Feature Product" />
          <ActionLink to="/admin-marketing?new=flash" icon={<Megaphone className="size-4" />} label="Create Promotion" />
          <ActionLink to="/admin-financial?view=alerts" icon={<AlertTriangle className="size-4" />} label="Open Risk" />
          <ActionLink to="/admin-support" icon={<LifeBuoy className="size-4" />} label="Assign Support" />
        </div>
      </Panel>

      {/* timeline */}
      <Panel id="timeline" title="Executive Timeline" icon={<Activity className="size-4" />}>
        <ul className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
          {timeline.length === 0 && <p className="text-[11px] text-muted-foreground">No recent activity.</p>}
          {timeline.map((e) => (
            <li key={e.id} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
              <span className="text-[9px] font-mono uppercase tracking-widest text-accent w-16 shrink-0">{e.kind}</span>
              <div className="min-w-0 flex-1"><p className="text-xs font-medium truncate capitalize">{e.title}</p><p className="text-[10px] text-muted-foreground truncate">{e.detail}</p></div>
              <span className="text-[10px] text-muted-foreground shrink-0">{new Date(e.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><p className="text-muted-foreground text-[10px]">{label}</p><p className="tabular-nums font-medium">{value}</p></div>;
}
function Sub({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">{label}</p>{children}</div>;
}
function ActionLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 hover:border-accent/30 transition-all">
      <span className="text-accent mb-1.5 block">{icon}</span><p className="text-xs font-medium">{label}</p>
    </Link>
  );
}

void RotateCcw; void ArrowDownRight; void Crown;
