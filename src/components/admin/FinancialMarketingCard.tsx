import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Wallet, TrendingUp, Percent, Megaphone, AlertTriangle, BarChart3, Lightbulb, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchFinancialMarketing, computeProfitAnalytics, campaignProfitability,
  customerProfitability, productProfitabilityReport, regionalProfitability,
  detectFinancialMarketingAlerts, executiveKpis, fmt, type FinancialMarketingData,
} from "@/lib/financial-marketing";

/**
 * Dashboard summary card for the Financial ↔ Marketing Integration. Every
 * figure is derived from real orders / returns / campaigns / customers and
 * refreshes in realtime.
 */
export function FinancialMarketingCard() {
  const [data, setData] = useState<FinancialMarketingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const d = await fetchFinancialMarketing(365);
      if (!alive) return;
      setData(d);
      setLoading(false);
    };
    load();
    const ch = supabase
      .channel("fin-mkt-card-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "returns" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "marketing_campaigns" }, load)
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, []);

  const model = useMemo(() => {
    if (!data) return null;
    const pa = computeProfitAnalytics(data);
    const camps = campaignProfitability(data.campaigns);
    const cust = customerProfitability(data.customers);
    const prod = productProfitabilityReport(data);
    const regions = regionalProfitability(data);
    return {
      kpis: executiveKpis(pa, camps, prod, cust),
      campaignRoi: camps.length ? camps.reduce((a, c) => a + c.roi, 0) / camps.length : 0,
      alerts: detectFinancialMarketingAlerts(pa, camps, regions).length,
    };
  }, [data]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="card-premium rounded-2xl p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="grid place-items-center size-9 rounded-xl bg-accent/10 text-accent"><Wallet className="size-4" /></span>
          <div>
            <h2 className="text-sm font-medium">Financial Marketing</h2>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Profit · ROI · margin</p>
          </div>
        </div>
        <Link to="/admin-financial" search={{ view: "marketing" } as never} className="text-[10px] font-mono uppercase tracking-widest text-accent hover:underline">Open →</Link>
      </div>

      {loading || !model ? (
        <div className="h-28 grid place-items-center text-muted-foreground"><Loader2 className="size-4 animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-4">
            <Stat icon={<TrendingUp className="size-3.5" />} label="Revenue" value={fmt(model.kpis.totalRevenue)} />
            <Stat icon={<Wallet className="size-3.5" />} label="Profit" value={fmt(model.kpis.totalProfit)} />
            <Stat icon={<Percent className="size-3.5" />} label="Net margin" value={`${model.kpis.netMargin.toFixed(1)}%`} />
            <Stat icon={<BarChart3 className="size-3.5" />} label="Campaign ROI" value={`${model.campaignRoi.toFixed(2)}×`} />
            <Stat icon={<Megaphone className="size-3.5" />} label="Top campaign" value={model.kpis.topCampaign ? trunc(model.kpis.topCampaign.name) : "—"} />
            <Stat icon={<AlertTriangle className="size-3.5" />} label="Alerts" value={String(model.alerts)} />
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2 text-[10px] text-muted-foreground">
            <span className="truncate">Top product · <span className="text-foreground">{model.kpis.topProduct ? trunc(model.kpis.topProduct.name) : "—"}</span></span>
            <span className="truncate">Top segment · <span className="text-foreground">{model.kpis.topSegment ? model.kpis.topSegment.segment : "—"}</span></span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <Quick view="profit" icon={<Wallet className="size-3.5" />} label="Profit" />
            <Quick view="campaigns" icon={<BarChart3 className="size-3.5" />} label="ROI" />
            <Quick view="recommendations" icon={<Lightbulb className="size-3.5" />} label="Scale" />
            <Quick view="alerts" icon={<AlertTriangle className="size-3.5" />} label="Alerts" />
          </div>
        </>
      )}
    </motion.div>
  );
}

function trunc(s: string, n = 16) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
      <span className="flex items-center gap-1 text-muted-foreground mb-1">
        <span className="text-accent">{icon}</span>
        <span className="text-[9px] font-mono uppercase tracking-widest truncate">{label}</span>
      </span>
      <p className="text-base font-display font-semibold tabular-nums truncate">{value}</p>
    </div>
  );
}

function Quick({ view, icon, label }: { view: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to="/admin-financial"
      search={{ view } as never}
      className="group flex flex-col items-center gap-1 rounded-xl border border-white/5 bg-white/[0.02] px-1.5 py-2.5 text-center transition-all hover:border-accent/40 hover:bg-accent/10"
    >
      <span className="text-muted-foreground transition-colors group-hover:text-accent">{icon}</span>
      <span className="text-[9px] font-medium text-muted-foreground group-hover:text-foreground">{label}</span>
    </Link>
  );
}
