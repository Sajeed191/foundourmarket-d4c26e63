import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft, ArrowUpRight, Activity, TrendingUp, TrendingDown, Minus,
  Sparkles, ListChecks, AlertTriangle, RefreshCw, CheckCircle2,
  Layers, Package, Users, Trash2,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { KpiCard } from "@/components/admin/KpiCard";
import { cn } from "@/lib/utils";
import { useRecommendationAnalytics } from "@/lib/use-recommendation-analytics";
import { formatDurationShort, type AnalyticsTrend, type Impact } from "@/lib/marketplace-intelligence";

export const Route = createFileRoute("/admin-recommendation-analytics")({
  head: () => ({
    meta: [
      { title: "Recommendation Analytics — FoundOurMarket™" },
      {
        name: "description",
        content:
          "Operational analytics for the FoundOurMarket™ Intelligence Platform: recommendation lifecycle, module performance, category and vendor trends.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RecommendationAnalyticsPage,
});

const MODULE_LABEL: Record<string, string> = {
  images: "Images",
  attributes: "Attributes",
  variants: "Variants",
  variant_intelligence: "Variants",
  seo: "SEO",
  seo_intelligence: "SEO",
  pricing: "Pricing",
  pricing_intelligence: "Pricing",
  completeness: "Completeness",
  marketplace_readiness: "Marketplace Readiness",
  vendor_intelligence: "Vendor",
  trust_intelligence: "Trust",
};

const IMPACT_TONE: Record<Impact, string> = {
  High: "border-destructive/40 bg-destructive/10 text-destructive",
  Medium: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  Low: "border-sky-400/40 bg-sky-400/10 text-sky-300",
};

const TREND_TONE: Record<AnalyticsTrend, string> = {
  improving: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  stable: "border-muted-foreground/30 bg-muted/10 text-muted-foreground",
  declining: "border-destructive/40 bg-destructive/10 text-destructive",
  unknown: "border-muted-foreground/20 bg-muted/5 text-muted-foreground",
};

function TrendPill({ trend }: { trend: AnalyticsTrend }) {
  const icon =
    trend === "improving" ? <TrendingUp className="size-3.5" /> :
    trend === "declining" ? <TrendingDown className="size-3.5" /> :
    trend === "stable" ? <Minus className="size-3.5" /> : <Activity className="size-3.5" />;
  const label =
    trend === "improving" ? "Improving" :
    trend === "declining" ? "Declining" :
    trend === "stable" ? "Stable" : "Gathering data";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium", TREND_TONE[trend])}>
      {icon}{label}
    </span>
  );
}

function moduleLabel(m: string): string {
  return MODULE_LABEL[m] ?? m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function RecommendationAnalyticsPage() {
  const { analytics, bundle, loading, resetHistory } = useRecommendationAnalytics();

  const impactTotal = useMemo(
    () => (analytics ? analytics.impactMatrix.reduce((a, b) => a + b.count, 0) : 0),
    [analytics],
  );

  return (
    <AdminShell
      title="Recommendation Analytics"
      subtitle="Continuous-improvement layer for the FoundOurMarket™ Intelligence Platform"
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/admin"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/40 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-border/70 transition"
          >
            <ArrowLeft className="size-3.5" /> Admin Home
          </Link>
          <button
            onClick={() => { if (confirm("Reset local recommendation history? This clears resolution stats.")) resetHistory(); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/40 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/40 transition"
          >
            <Trash2 className="size-3.5" /> Reset history
          </button>
        </div>
      }
    >
      {loading || !analytics ? (
        <div className="rounded-2xl border border-border/40 bg-card/40 p-8 text-center text-sm text-muted-foreground">
          <RefreshCw className="mx-auto mb-3 size-5 animate-spin text-accent" />
          Analyzing recommendation lifecycle across the marketplace…
        </div>
      ) : (
        <div className="space-y-8">
          {/* 1. Executive KPIs */}
          <section>
            <SectionHeader
              icon={Sparkles}
              title="Executive KPIs"
              subtitle="Operational health of the recommendation stream"
              right={<TrendPill trend={analytics.trend} />}
            />
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <KpiCard label="Active" value={analytics.active} sub="Open recommendations" />
              <KpiCard label="Resolved today" value={analytics.resolvedToday} sub="Cleared in last 24h" />
              <KpiCard label="Avg. resolution" value={formatDurationShort(analytics.averageResolutionMs)} sub="Time to close" />
              <KpiCard label="Resolution rate 7d" value={`${analytics.resolutionRate7d}%`} sub="Closed / seen" />
              <KpiCard label="Regressed" value={analytics.regressed} sub="Returned after closing" />
              <KpiCard label="Persistent" value={analytics.persistent} sub="Open ≥ 3 snapshots" />
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              History: {analytics.generated} distinct recommendations tracked · resolution rate 30d {analytics.resolutionRate30d}% · analysing {bundle.analysedProducts}/{bundle.totalProducts} products
            </div>
          </section>

          {/* 2. Module performance */}
          <section>
            <SectionHeader icon={Layers} title="Module performance" subtitle="Which intelligence modules generate the most work" />
            <div className="mt-4 overflow-hidden rounded-2xl border border-border/40 bg-card/30">
              <div className="max-h-[520px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card/80 backdrop-blur text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Module</th>
                      <th className="px-4 py-2.5 text-right">Generated</th>
                      <th className="px-4 py-2.5 text-right">Active</th>
                      <th className="px-4 py-2.5 text-right">Resolved</th>
                      <th className="px-4 py-2.5 text-right">Regressed</th>
                      <th className="px-4 py-2.5 text-right">Rate</th>
                      <th className="px-4 py-2.5 text-right">Avg. conf.</th>
                      <th className="px-4 py-2.5 text-right">Avg. impact</th>
                      <th className="px-4 py-2.5 text-right">Avg. TTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.moduleBreakdown.length === 0 ? (
                      <tr><td colSpan={9} className="px-4 py-6 text-center text-muted-foreground text-xs">No recommendations tracked yet.</td></tr>
                    ) : (
                      analytics.moduleBreakdown.map((m) => (
                        <tr key={m.module} className="border-t border-border/30 hover:bg-card/40">
                          <td className="px-4 py-2.5 font-medium">{moduleLabel(m.module)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{m.generated}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{m.active}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-emerald-300">{m.resolved}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-destructive">{m.regressed || "—"}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{m.resolutionRate}%</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{m.averageConfidence}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{m.averageImpactScore}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{formatDurationShort(m.averageResolutionMs)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* 3 + 4. Impact matrix + Lifecycle funnel */}
          <section className="grid gap-4 md:grid-cols-2">
            <div className="card-premium rounded-2xl p-5">
              <SectionHeader icon={AlertTriangle} title="Impact matrix" subtitle="Prioritise where to spend the next hour" small />
              <div className="mt-4 space-y-2">
                {analytics.impactMatrix.map((row) => {
                  const pct = impactTotal ? Math.round((row.count / impactTotal) * 100) : 0;
                  return (
                    <div key={row.impact} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]", IMPACT_TONE[row.impact])}>
                          {row.impact} impact
                        </span>
                        <span className="tabular-nums text-muted-foreground">{row.count} · {pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/20 overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            row.impact === "High" ? "bg-destructive" : row.impact === "Medium" ? "bg-amber-400" : "bg-sky-400",
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card-premium rounded-2xl p-5">
              <SectionHeader icon={ListChecks} title="Lifecycle funnel" subtitle="From new to resolved (or regressed)" small />
              <div className="mt-4 space-y-3 text-sm">
                <FunnelRow label="New" value={analytics.lifecycleFunnel.new} tone="bg-sky-400/70" />
                <FunnelRow label="Persistent" value={analytics.lifecycleFunnel.persistent} tone="bg-amber-400/70" />
                <FunnelRow label="Resolved (all-time)" value={analytics.lifecycleFunnel.resolved} tone="bg-emerald-400/70" />
                <FunnelRow label="Regressed" value={analytics.lifecycleFunnel.regressed || analytics.regressed} tone="bg-destructive/70" />
              </div>
              <div className="mt-3 text-[11px] text-muted-foreground">
                Persistent items are the strongest signal for structural marketplace issues.
              </div>
            </div>
          </section>

          {/* 5. Category trends */}
          <section>
            <SectionHeader icon={Package} title="Category trends" subtitle="Where readiness is strongest and weakest" />
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {analytics.categoryBreakdown.length === 0 ? (
                <div className="col-span-full rounded-2xl border border-border/40 bg-card/30 p-6 text-center text-xs text-muted-foreground">
                  Category rollups will appear once listings are analysed.
                </div>
              ) : analytics.categoryBreakdown.slice(0, 9).map((c) => (
                <div key={c.categoryId} className="rounded-2xl border border-border/40 bg-card/40 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium truncate">{c.categoryName}</div>
                    <span className={cn(
                      "text-[11px] tabular-nums font-mono px-2 py-0.5 rounded-md border",
                      c.averageReadiness >= 85 ? "border-emerald-400/40 text-emerald-300"
                      : c.averageReadiness >= 65 ? "border-amber-400/40 text-amber-300"
                      : "border-destructive/40 text-destructive",
                    )}>{c.averageReadiness}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{c.listingCount} listings</div>
                  {c.topAction && (
                    <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-muted-foreground">{c.topAction}</span>
                      {c.topImpact && (
                        <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px]", IMPACT_TONE[c.topImpact])}>{c.topImpact}</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* 6. Vendor trends */}
          <section>
            <SectionHeader icon={Users} title="Vendor trends" subtitle="Vendors that need attention across their catalogue" />
            <div className="mt-4 overflow-hidden rounded-2xl border border-border/40 bg-card/30">
              <table className="w-full text-sm">
                <thead className="bg-card/60 text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Vendor</th>
                    <th className="px-4 py-2.5 text-right">Score</th>
                    <th className="px-4 py-2.5 text-right">Tier</th>
                    <th className="px-4 py-2.5 text-right">Listings</th>
                    <th className="px-4 py-2.5 text-left">Top action</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.vendorBreakdown.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground text-xs">No vendor data available.</td></tr>
                  ) : (
                    analytics.vendorBreakdown.map((v) => (
                      <tr key={v.vendorId} className="border-t border-border/30 hover:bg-card/40">
                        <td className="px-4 py-2.5 font-medium truncate max-w-[220px]">{v.vendorName}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{v.score}</td>
                        <td className="px-4 py-2.5 text-right text-xs uppercase tracking-wider text-muted-foreground">{v.tier}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{v.listingCount}</td>
                        <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[280px]">{v.topAction ?? "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Footer explainer — enforces "advisory, explainable AI" */}
          <div className="rounded-2xl border border-border/30 bg-card/20 p-4 text-[11px] text-muted-foreground leading-relaxed">
            <div className="flex items-center gap-2 text-foreground/80 text-xs font-medium">
              <CheckCircle2 className="size-3.5 text-emerald-400" /> How this view is computed
            </div>
            <p className="mt-2">
              Recommendation Analytics is a pure aggregation layer. It never creates new recommendations, never runs detection, and never talks to AI services. It reads the same public contracts (Recommendation, Marketplace Health, Marketplace Optimization, Vendor Intelligence) that the Product Editor and Admin Home already consume, and tracks their lifecycle locally so admins can see what's improving over time.
            </p>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

function SectionHeader({
  icon: Icon, title, subtitle, right, small,
}: {
  icon: typeof Sparkles;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  small?: boolean;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className={cn("text-accent", small ? "size-3.5" : "size-4")} />
          <span className={cn("font-mono uppercase tracking-[0.22em]", small ? "text-[10px]" : "text-[11px]")}>{title}</span>
        </div>
        {subtitle && <div className={cn("mt-0.5 text-muted-foreground/80", small ? "text-[11px]" : "text-xs")}>{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

function FunnelRow({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-32 text-xs text-muted-foreground shrink-0">{label}</div>
      <div className="flex-1 h-2 rounded-full bg-muted/20 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, value * 6)}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className={cn("h-full rounded-full", tone)}
        />
      </div>
      <div className="w-10 text-right text-sm tabular-nums">{value}</div>
    </div>
  );
}

// Keep the icon-only import used above.
void ArrowUpRight;
