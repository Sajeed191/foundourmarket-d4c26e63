import { motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import {
  Crown, TrendingUp, TrendingDown, Wallet, Percent, Target,
  Package, Users, Megaphone, AlertTriangle, Sparkles, Loader2,
} from "lucide-react";
import { useFinancialMarketing } from "@/lib/use-financial-marketing";
import { fmt } from "@/lib/financial-marketing";
import { logActivity } from "@/lib/activity-log";
import { cn } from "@/lib/utils";

/**
 * Reusable executive overlay embedded across Financial, Marketing, Customer,
 * Inventory and Storefront dashboards. Every figure is real and realtime —
 * Revenue, Profit, Margin, ROI, top product / segment / campaign, plus the
 * single biggest risk and opportunity. Insight → Decision → Action in place.
 */
export function ExecutiveSummaryPanel({ source = "dashboard", compact = false }: { source?: string; compact?: boolean }) {
  const { model, loading } = useFinancialMarketing();

  if (loading || !model) {
    return (
      <div className="rounded-2xl border border-accent/20 bg-white/[0.02] p-6 grid place-items-center min-h-[140px]">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { kpis, pa, campaigns, alerts, recs } = model;
  const roi = pa.marketingSpend > 0 ? kpis.campaignProfit / pa.marketingSpend : 0;
  const biggestRisk = alerts.find((a) => a.severity === "high") ?? alerts[0] ?? null;
  const biggestOpp = recs[0] ?? null;
  const worst = [...campaigns].filter((c) => c.cost > 0).sort((a, b) => a.roi - b.roi)[0] ?? null;

  const stats = [
    { label: "Revenue", value: fmt(kpis.totalRevenue), icon: Wallet },
    { label: "Profit", value: fmt(kpis.totalProfit), icon: TrendingUp, tone: kpis.totalProfit >= 0 ? "good" : "bad" },
    { label: "Net Margin", value: `${pa.netMargin.toFixed(1)}%`, icon: Percent, tone: pa.netMargin >= 10 ? "good" : pa.netMargin < 0 ? "bad" : "warn" },
    { label: "Campaign ROI", value: `${roi.toFixed(1)}×`, icon: Target, tone: roi >= 2 ? "good" : roi < 1 ? "bad" : "warn" },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl border border-accent/30 bg-gradient-to-br from-white/[0.04] to-transparent p-5 backdrop-blur-xl"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-accent">
          <Crown className="size-3.5" /> Executive Summary
          <span className="size-1.5 rounded-full bg-accent animate-pulse" />
        </span>
        <Link to="/admin-financial" className="text-[11px] text-muted-foreground hover:text-accent">Open Financial →</Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <s.icon className={cn("size-4 mb-1.5",
              s.tone === "good" ? "text-emerald-400" : s.tone === "bad" ? "text-destructive" : s.tone === "warn" ? "text-amber-400" : "text-accent")} />
            <div className="text-base font-semibold text-foreground tabular-nums">{s.value}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {!compact && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <Bit icon={Package} label="Top Product" value={kpis.topProduct?.name ?? "—"} sub={kpis.topProduct ? fmt(kpis.topProduct.profit) : ""} />
          <Bit icon={Users} label="Top Segment" value={kpis.topSegment?.segment ?? "—"} sub={kpis.topSegment ? fmt(kpis.topSegment.profit) : ""} />
          <Bit icon={Megaphone} label="Top Campaign" value={kpis.topCampaign?.name ?? "—"} sub={kpis.topCampaign ? `ROI ${kpis.topCampaign.roi.toFixed(1)}×` : ""} />
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
          <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-destructive mb-1">
            <AlertTriangle className="size-3" /> Biggest Risk
          </span>
          <div className="text-sm font-medium text-foreground">{biggestRisk?.title ?? (worst ? `Watch "${worst.name}"` : "No critical risk")}</div>
          <div className="text-[11px] text-muted-foreground line-clamp-2">{biggestRisk?.detail ?? "All campaigns profitable."}</div>
        </div>
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-3">
          <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-emerald-400 mb-1">
            <Sparkles className="size-3" /> Biggest Opportunity
          </span>
          <div className="text-sm font-medium text-foreground">{biggestOpp?.title ?? "Maintain course"}</div>
          <div className="text-[11px] text-muted-foreground line-clamp-2">
            {biggestOpp ? `${biggestOpp.detail} (${fmt(biggestOpp.impact)})` : "No new opportunity detected."}
          </div>
        </div>
      </div>
    </motion.section>
  );
}

function Bit({ icon: Icon, label, value, sub }: { icon: typeof Crown; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
        <Icon className="size-3 text-accent" /> {label}
      </span>
      <div className="text-sm font-medium text-foreground truncate">{value}</div>
      {sub && <div className="text-[11px] text-accent tabular-nums">{sub}</div>}
    </div>
  );
}

void TrendingDown; void logActivity;
