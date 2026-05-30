import { useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import {
  Wallet, TrendingUp, Percent, Target, Gauge, Crown, Package,
  Megaphone, Users, Boxes, AlertTriangle, ArrowUpRight, Pause,
  Copy, Loader2, Trophy, TrendingDown,
} from "lucide-react";
import { useFinancialMarketing, inventoryFinancials } from "@/lib/use-financial-marketing";
import {
  fmt, scaleCampaign, pauseFinancialCampaign, duplicateFinancialCampaign,
  type CampaignProfit,
} from "@/lib/financial-marketing";
import { cn } from "@/lib/utils";

type Module = "marketing" | "customer" | "product" | "inventory" | "storefront";

const TITLES: Record<Module, { title: string; icon: typeof Wallet }> = {
  marketing: { title: "Financial Insights", icon: Megaphone },
  customer: { title: "Financial Contribution", icon: Users },
  product: { title: "Financial Product Insights", icon: Package },
  inventory: { title: "Financial Inventory Insights", icon: Boxes },
  storefront: { title: "Financial Performance", icon: Trophy },
};

/**
 * Reusable cross-module financial panel. `module` selects which real,
 * realtime profit intelligence is surfaced — and which one-click actions are
 * available — so admins move Insight → Decision → Action without leaving the
 * page. No simulated data.
 */
export function FinancialInsightsPanel({ module }: { module: Module }) {
  const { data, model, loading } = useFinancialMarketing();
  const [busy, setBusy] = useState<string | null>(null);

  const meta = TITLES[module];

  if (loading || !model) {
    return (
      <div className="rounded-2xl border border-accent/20 bg-white/[0.02] p-6 grid place-items-center min-h-[140px]">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { pa, campaigns, customers, products, kpis } = model;

  const run = async (key: string, fn: () => Promise<{ error?: string }>, ok: string) => {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (res.error) toast.error("Action failed", { description: res.error });
    else toast.success(ok);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl border border-accent/30 bg-gradient-to-br from-white/[0.04] to-transparent p-5 backdrop-blur-xl"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-accent">
          <meta.icon className="size-3.5" /> {meta.title}
          <span className="size-1.5 rounded-full bg-accent animate-pulse" />
        </span>
        <Link to="/admin-financial" className="text-[11px] text-muted-foreground hover:text-accent">Profit Intelligence →</Link>
      </div>

      {module === "marketing" && <MarketingBody campaigns={campaigns} pa={pa} busy={busy} run={run} />}
      {module === "customer" && <CustomerBody customers={customers} pa={pa} />}
      {module === "product" && <ProductBody products={products} />}
      {module === "inventory" && <InventoryBody data={data} />}
      {module === "storefront" && <StorefrontBody campaigns={campaigns} products={products} kpis={kpis} />}
    </motion.section>
  );
}

/* ---------------------------------------------------------------- KPI grid */
function Kpi({ icon: Icon, label, value, tone }: { icon: typeof Wallet; label: string; value: string; tone?: "good" | "bad" | "warn" }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <Icon className={cn("size-4 mb-1.5", tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-destructive" : tone === "warn" ? "text-amber-400" : "text-accent")} />
      <div className="text-base font-semibold text-foreground tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

/* -------------------------------------------------------------- marketing */
function MarketingBody({ campaigns, pa, busy, run }: {
  campaigns: CampaignProfit[]; pa: ReturnType<typeof import("@/lib/financial-marketing")["computeProfitAnalytics"]>;
  busy: string | null; run: (k: string, fn: () => Promise<{ error?: string }>, ok: string) => Promise<void>;
}) {
  const revenue = campaigns.reduce((a, c) => a + c.revenue, 0);
  const profit = campaigns.reduce((a, c) => a + c.profit, 0);
  const cost = campaigns.reduce((a, c) => a + c.cost, 0);
  const roi = cost > 0 ? profit / cost : 0;
  const roas = cost > 0 ? revenue / cost : 0;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const efficiency = Math.max(0, Math.min(100, roi * 25 + margin));
  const winner = [...campaigns].filter((c) => c.cost > 0).sort((a, b) => b.roi - a.roi)[0] ?? null;
  const loser = [...campaigns].filter((c) => c.cost > 0).sort((a, b) => a.roi - b.roi)[0] ?? null;
  const budgetEff = pa.marketingSpend > 0 ? pa.netContribution / pa.marketingSpend : 0;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <Kpi icon={Wallet} label="Campaign Revenue" value={fmt(revenue)} />
        <Kpi icon={TrendingUp} label="Campaign Profit" value={fmt(profit)} tone={profit >= 0 ? "good" : "bad"} />
        <Kpi icon={Target} label="ROI" value={`${roi.toFixed(1)}×`} tone={roi >= 2 ? "good" : roi < 1 ? "bad" : "warn"} />
        <Kpi icon={Gauge} label="ROAS" value={`${roas.toFixed(1)}×`} />
        <Kpi icon={Percent} label="Margin" value={`${margin.toFixed(1)}%`} tone={margin >= 20 ? "good" : margin < 0 ? "bad" : "warn"} />
        <Kpi icon={Gauge} label="Efficiency Score" value={`${efficiency.toFixed(0)}`} tone={efficiency >= 60 ? "good" : efficiency < 30 ? "bad" : "warn"} />
      </div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-3">
          <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-emerald-400 mb-1"><Trophy className="size-3" /> Top Campaign</span>
          <div className="text-sm font-medium text-foreground truncate">{winner?.name ?? "—"}</div>
          <div className="text-[11px] text-muted-foreground">{winner ? `ROI ${winner.roi.toFixed(1)}× · ${fmt(winner.profit)}` : "No data"}</div>
        </div>
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
          <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-destructive mb-1"><TrendingDown className="size-3" /> Worst Campaign</span>
          <div className="text-sm font-medium text-foreground truncate">{loser?.name ?? "—"}</div>
          <div className="text-[11px] text-muted-foreground">{loser ? `ROI ${loser.roi.toFixed(1)}× · ${fmt(loser.profit)}` : "No data"}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
        <span className="text-[11px] text-muted-foreground">Budget Efficiency (net profit per spend)</span>
        <span className={cn("text-sm font-semibold tabular-nums", budgetEff >= 1 ? "text-emerald-400" : "text-amber-400")}>{budgetEff.toFixed(2)}×</span>
      </div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          disabled={!winner || busy === "scale"}
          onClick={() => winner && run("scale", () => scaleCampaign(winner), `Scaled "${winner.name}" budget`)}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-3 py-2.5 text-xs font-medium text-foreground transition-all hover:bg-emerald-400/20 disabled:opacity-40"
        >
          {busy === "scale" ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUpRight className="size-3.5 text-emerald-400" />} Scale Winner
        </button>
        <button
          disabled={!loser || busy === "pause"}
          onClick={() => loser && run("pause", () => pauseFinancialCampaign(loser.id), `Paused "${loser.name}"`)}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs font-medium text-foreground transition-all hover:bg-destructive/20 disabled:opacity-40"
        >
          {busy === "pause" ? <Loader2 className="size-3.5 animate-spin" /> : <Pause className="size-3.5 text-destructive" />} Pause Loser
        </button>
        <button
          disabled={!winner || busy === "dup"}
          onClick={() => winner && run("dup", () => duplicateFinancialCampaign(winner), `Duplicated "${winner.name}"`)}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2.5 text-xs font-medium text-foreground transition-all hover:bg-accent/20 disabled:opacity-40"
        >
          {busy === "dup" ? <Loader2 className="size-3.5 animate-spin" /> : <Copy className="size-3.5 text-accent" />} Duplicate Winner
        </button>
      </div>
    </>
  );
}

/* --------------------------------------------------------------- customer */
function CustomerBody({ customers, pa }: {
  customers: ReturnType<typeof import("@/lib/financial-marketing")["customerProfitability"]>;
  pa: ReturnType<typeof import("@/lib/financial-marketing")["computeProfitAnalytics"]>;
}) {
  const hv = customers.mostProfitableSegments.find((s) => /high value|high-value/i.test(s.segment));
  const netContribution = customers.topCustomers.reduce((a, c) => a + c.profit, 0);
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <Kpi icon={Crown} label="VIP Profit" value={fmt(customers.vipProfit)} tone="good" />
        <Kpi icon={Percent} label="VIP Profit Share" value={`${customers.vipShare.toFixed(0)}%`} />
        <Kpi icon={TrendingUp} label="High-Value Profit" value={fmt(hv?.profit ?? 0)} tone="good" />
        <Kpi icon={AlertTriangle} label="Refund Cost Impact" value={fmt(pa.refundCosts)} tone="warn" />
        <Kpi icon={Users} label="Support Load" value={`${pa.supportTickets} tickets`} />
        <Kpi icon={Wallet} label="Net Contribution" value={fmt(netContribution)} tone={netContribution >= 0 ? "good" : "bad"} />
      </div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <RankList title="Most Profitable Customers" items={customers.topCustomers.slice(0, 5).map((c) => ({ name: c.name || c.email || "Customer", value: fmt(c.profit) }))} />
        <RankList title="Most Profitable Segments" items={customers.mostProfitableSegments.slice(0, 5).map((s) => ({ name: s.segment, value: fmt(s.profit) }))} />
      </div>
      <Link to="/admin-customer-intelligence" search={{ view: "marketing" } as never} className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2.5 text-xs font-medium text-foreground transition-all hover:bg-accent/20">
        <Target className="size-3.5 text-accent" /> Target Profitable Audiences
      </Link>
    </>
  );
}

/* ---------------------------------------------------------------- product */
function ProductBody({ products }: { products: ReturnType<typeof import("@/lib/financial-marketing")["productProfitabilityReport"]> }) {
  const trend = products.byRegion.map((r) => `${r.region}: ${fmt(r.profit)}`).join(" · ");
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <Kpi icon={Wallet} label="Profit / Order" value={fmt(products.profitPerOrder)} />
        <Kpi icon={Users} label="Profit / Customer" value={fmt(products.profitPerCustomer)} />
        <Kpi icon={TrendingUp} label="Profit Trend" value={products.byRegion.reduce((a, r) => a + r.profit, 0) >= 0 ? "Positive" : "Negative"} tone="good" />
      </div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <RankList title="Top Profit Products" items={products.mostProfitable.slice(0, 5).map((p) => ({ name: p.name, value: fmt(p.profit) }))} />
        <RankList title="Highest Margin" items={products.highestMargin.slice(0, 5).map((p) => ({ name: p.name, value: `${p.margin.toFixed(0)}%` }))} />
        <RankList title="Lowest Margin" items={products.lowestMargin.slice(0, 5).map((p) => ({ name: p.name, value: `${p.margin.toFixed(0)}%` }))} tone="warn" />
      </div>
      <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-[11px] text-muted-foreground">
        Margin & Profit Trend — {trend || "no regional data"}
      </div>
    </>
  );
}

/* -------------------------------------------------------------- inventory */
function InventoryBody({ data }: { data: ReturnType<typeof useFinancialMarketing>["data"] }) {
  const inv = inventoryFinancials(data);
  if (!inv) return <div className="text-sm text-muted-foreground">No inventory data.</div>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
      <Kpi icon={Boxes} label="Inventory Value" value={fmt(inv.inventoryValue)} />
      <Kpi icon={AlertTriangle} label="Dead Stock Loss" value={fmt(inv.deadStockLoss)} tone="bad" />
      <Kpi icon={Package} label="Overstock Cost" value={fmt(inv.overstockCost)} tone="warn" />
      <Kpi icon={TrendingDown} label="Clearance Impact" value={fmt(inv.clearanceImpact)} tone="warn" />
      <Kpi icon={AlertTriangle} label="Profit At Risk" value={fmt(inv.profitAtRisk)} tone="bad" />
      <Kpi icon={Target} label="Inventory ROI" value={`${inv.inventoryRoi.toFixed(2)}×`} tone={inv.inventoryRoi >= 1 ? "good" : "warn"} />
      <Kpi icon={ArrowUpRight} label="Restock ROI" value={`${inv.restockRoi.toFixed(2)}×`} tone={inv.restockRoi >= 1 ? "good" : "warn"} />
    </div>
  );
}

/* ------------------------------------------------------------- storefront */
function StorefrontBody({ campaigns, products, kpis }: {
  campaigns: CampaignProfit[];
  products: ReturnType<typeof import("@/lib/financial-marketing")["productProfitabilityReport"]>;
  kpis: ReturnType<typeof import("@/lib/financial-marketing")["executiveKpis"]>;
}) {
  const revenue = campaigns.reduce((a, c) => a + c.revenue, 0);
  const profit = campaigns.reduce((a, c) => a + c.profit, 0);
  const conv = campaigns.length ? campaigns.reduce((a, c) => a + c.conversionRate, 0) / campaigns.length : 0;
  const roi = campaigns.reduce((a, c) => a + c.cost, 0) > 0 ? profit / campaigns.reduce((a, c) => a + c.cost, 0) : 0;
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Kpi icon={Wallet} label="Revenue Contribution" value={fmt(revenue)} />
        <Kpi icon={TrendingUp} label="Profit Contribution" value={fmt(profit)} tone={profit >= 0 ? "good" : "bad"} />
        <Kpi icon={Percent} label="Conversion" value={`${conv.toFixed(1)}%`} />
        <Kpi icon={Target} label="ROI" value={`${roi.toFixed(1)}×`} tone={roi >= 2 ? "good" : "warn"} />
      </div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <FeatureLink label="Feature Most Profitable" detail={kpis.topProduct?.name} />
        <FeatureLink label="Feature Highest Margin" detail={products.highestMargin[0]?.name} />
        <FeatureLink label="Feature Best Campaign" detail={kpis.topCampaign?.name} />
      </div>
    </>
  );
}

function FeatureLink({ label, detail }: { label: string; detail?: string }) {
  return (
    <Link to="/builder" className="group rounded-xl border border-accent/30 bg-accent/5 px-3 py-2.5 transition-all hover:bg-accent/15">
      <div className="text-xs font-medium text-foreground">{label}</div>
      <div className="text-[11px] text-muted-foreground truncate">{detail ?? "—"}</div>
    </Link>
  );
}

function RankList({ title, items, tone }: { title: string; items: { name: string; value: string }[]; tone?: "warn" }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">{title}</div>
      <ul className="space-y-1.5">
        {items.length === 0 && <li className="text-[11px] text-muted-foreground">No data</li>}
        {items.map((it, i) => (
          <li key={i} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-foreground truncate">{it.name}</span>
            <span className={cn("tabular-nums shrink-0", tone === "warn" ? "text-amber-400" : "text-accent")}>{it.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
