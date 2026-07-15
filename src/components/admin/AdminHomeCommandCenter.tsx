/**
 * AdminHomeCommandCenter — Admin Home v1.0.
 *
 * The daily command center. Consumes ONLY Marketplace Intelligence 3.0 +
 * Marketplace Health v1.0 public contracts (via useMarketplaceHealth).
 * Never queries Catalog or Image Intelligence directly.
 *
 * Structure (per Platform v1.0 embedding spec):
 *   1. Marketplace Health hero — one status, one action.
 *   2. Today's Priority — the single top recommendation.
 *   3. Marketplace Snapshot — readiness distribution + vendor / trust counters.
 *   4. Operational Queues — actionable worklists linking to existing pages.
 *   5. Trends — Improving / Stable / Declining pills across 4 pillars.
 *   6. Recent Activity — light operational feed derived from lifecycle data.
 *
 * One hero recommendation. Progressive disclosure. Every card has a
 * destination. Every recommendation has a one-click action.
 */
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Sparkles, ArrowRight, TrendingUp, TrendingDown, Minus,
  CheckCircle2, AlertTriangle, XCircle, Package, Users,
  ShieldAlert, ListChecks, Loader2, Crown, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMarketplaceHealth } from "@/lib/use-marketplace-health";
import {
  HEALTH_STATUS_LABEL,
  type HealthStatus,
  type Trend,
  type TrendBlock,
  type LifecycleRecommendation,
} from "@/lib/marketplace-intelligence";

const STATUS_TONE: Record<HealthStatus, string> = {
  healthy: "border-emerald-400/40 bg-emerald-400/5 text-emerald-300",
  good: "border-sky-400/40 bg-sky-400/5 text-sky-300",
  needs_attention: "border-amber-400/40 bg-amber-400/5 text-amber-300",
  critical: "border-destructive/40 bg-destructive/5 text-destructive",
};

const STATUS_DOT: Record<HealthStatus, string> = {
  healthy: "bg-emerald-400",
  good: "bg-sky-400",
  needs_attention: "bg-amber-400",
  critical: "bg-destructive",
};

const IMPACT_TONE: Record<string, string> = {
  High: "border-destructive/40 bg-destructive/10 text-destructive",
  Medium: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  Low: "border-sky-400/40 bg-sky-400/10 text-sky-300",
};

const TREND_ICON: Record<Trend, React.ReactNode> = {
  improving: <TrendingUp className="size-3.5 text-emerald-400" />,
  stable: <Minus className="size-3.5 text-muted-foreground" />,
  declining: <TrendingDown className="size-3.5 text-destructive" />,
  unknown: <Minus className="size-3.5 text-muted-foreground/60" />,
};

const TREND_LABEL_SHORT: Record<Trend, string> = {
  improving: "Improving",
  stable: "Stable",
  declining: "Declining",
  unknown: "No baseline",
};

/** Map recommendation module → destination inside the admin. */
function actionHref(rec: LifecycleRecommendation): { to: string; label: string } {
  switch (rec.module) {
    case "seo_intelligence":
      return { to: "/admin-seo-intelligence", label: rec.action };
    case "variant_intelligence":
      return { to: "/admin-quality", label: rec.action };
    case "pricing_intelligence":
      return { to: "/admin-marketplace-quality", label: rec.action };
    case "attribute_intelligence":
    case "product_completeness":
    case "image_intelligence":
    default:
      return { to: "/admin-marketplace-quality", label: rec.action };
  }
}

function TrendPill({ label, block }: { label: string; block: TrendBlock }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        {TREND_ICON[block.direction]}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-lg font-semibold tabular-nums text-foreground">
          {Math.round(block.current)}
        </span>
        {block.previous != null && (
          <span
            className={cn(
              "text-[10px] tabular-nums",
              block.delta > 0
                ? "text-emerald-400"
                : block.delta < 0
                  ? "text-destructive"
                  : "text-muted-foreground",
            )}
          >
            {block.delta > 0 ? "+" : ""}
            {block.delta}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-[10px] text-muted-foreground">
        {TREND_LABEL_SHORT[block.direction]}
      </p>
    </div>
  );
}

export function AdminHomeCommandCenter() {
  const { health, optimization, vendors, trust, analysedProducts, totalProducts, loading } =
    useMarketplaceHealth();

  const recentActivity = useMemo(() => {
    const items: { icon: React.ReactNode; text: string; tone: string }[] = [];
    if (!health) return items;
    const readyCount = optimization?.distribution.ready ?? 0;
    if (readyCount > 0) {
      items.push({
        icon: <CheckCircle2 className="size-3.5 text-emerald-400" />,
        text: `${readyCount} listing${readyCount === 1 ? "" : "s"} currently Marketplace Ready.`,
        tone: "text-emerald-300",
      });
    }
    const improved = health.trends.readiness.direction === "improving";
    if (improved) {
      items.push({
        icon: <TrendingUp className="size-3.5 text-emerald-400" />,
        text: `Readiness improved by ${health.trends.readiness.delta} points since last snapshot.`,
        tone: "text-emerald-300",
      });
    }
    const trusted = health.rollups.vendors.byTier.trusted;
    if (trusted > 0) {
      items.push({
        icon: <Crown className="size-3.5 text-accent" />,
        text: `${trusted} vendor${trusted === 1 ? "" : "s"} performing at Trusted tier.`,
        tone: "text-foreground",
      });
    }
    const resolved = health.lifecycle.filter((r) => r.lifecycle === "resolved");
    if (resolved.length > 0) {
      items.push({
        icon: <CheckCircle2 className="size-3.5 text-emerald-400" />,
        text: `${resolved.length} recommendation${resolved.length === 1 ? "" : "s"} resolved.`,
        tone: "text-emerald-300",
      });
    }
    const regressed = health.lifecycle.filter((r) => r.lifecycle === "regressed");
    if (regressed.length > 0) {
      items.push({
        icon: <AlertTriangle className="size-3.5 text-amber-400" />,
        text: `${regressed.length} recommendation${regressed.length === 1 ? "" : "s"} regressed and need re-review.`,
        tone: "text-amber-300",
      });
    }
    return items.slice(0, 5);
  }, [health, optimization]);

  if (loading || !health || !optimization || !trust) {
    return (
      <section className="rounded-2xl border border-accent/20 bg-white/[0.02] p-8 grid place-items-center min-h-[220px]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Composing marketplace health…
        </div>
      </section>
    );
  }

  const top = health.topRecommendation ? actionHref(health.lifecycle[0] ?? {
    ...health.topRecommendation, lifecycle: "new",
  } as LifecycleRecommendation) : null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-4"
    >
      {/* 1. Hero — Marketplace Health */}
      <div className={cn("rounded-2xl border p-5 backdrop-blur-xl bg-gradient-to-br from-white/[0.04] to-transparent", STATUS_TONE[health.status])}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-accent">
            <Sparkles className="size-3.5" /> Marketplace Health v1.0
            <span className="size-1.5 rounded-full bg-accent animate-pulse" />
          </span>
          <span className="text-[10px] text-muted-foreground">
            Analysing {analysedProducts} of {totalProducts} listings · Confidence {health.confidence}%
          </span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
          <div className="flex items-center gap-3">
            <span className={cn("size-2.5 rounded-full", STATUS_DOT[health.status])} />
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold tabular-nums text-foreground">{health.score}</span>
                <span className="text-xs text-muted-foreground">/ 100</span>
              </div>
              <p className="text-[11px] font-mono uppercase tracking-widest">
                {HEALTH_STATUS_LABEL[health.status]}
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            {health.executiveSummary}
          </p>
          {top && (
            <Link
              to={top.to}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-medium text-accent hover:bg-accent/20"
            >
              {top.label} <ArrowRight className="size-3.5" />
            </Link>
          )}
        </div>
      </div>

      {/* 2. Today's Priority */}
      {health.topRecommendation && top && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
              Today's Priority
            </span>
            {health.lifecycle[0] && (
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {health.lifecycle[0].lifecycle}
              </span>
            )}
          </div>
          <p className="text-base font-medium text-foreground leading-snug">
            {health.topRecommendation.recommendation}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                IMPACT_TONE[health.topRecommendation.impact] ?? IMPACT_TONE.Low,
              )}
            >
              {health.topRecommendation.impact} Impact
            </span>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              Confidence {health.topRecommendation.confidence}%
            </span>
            <Link
              to={top.to}
              className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20"
            >
              {top.label} <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* 3. Marketplace Snapshot */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SnapshotCard label="Ready" value={optimization.distribution.ready} tone="text-emerald-400" />
        <SnapshotCard label="Almost Ready" value={optimization.distribution.almost_ready} tone="text-sky-400" />
        <SnapshotCard label="Needs Attention" value={optimization.distribution.needs_attention} tone="text-amber-400" />
        <SnapshotCard label="Not Ready" value={optimization.distribution.not_ready} tone="text-destructive" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SnapshotCard
          label="Vendors need attention"
          value={health.rollups.vendors.atRiskCount + health.rollups.vendors.byTier.watch}
          tone="text-amber-400"
          icon={<Users className="size-3.5 text-amber-400" />}
        />
        <SnapshotCard
          label="Trust alerts"
          value={trust.risks.filter((r) => r.severity !== "info").length}
          tone={trust.risks.some((r) => r.severity === "critical") ? "text-destructive" : "text-amber-400"}
          icon={<ShieldAlert className="size-3.5 text-amber-400" />}
        />
        <SnapshotCard
          label="Active recommendations"
          value={health.lifecycle.filter((r) => r.lifecycle !== "resolved").length}
          tone="text-accent"
          icon={<ListChecks className="size-3.5 text-accent" />}
        />
      </div>

      {/* 4. Operational Queues */}
      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
        <p className="mb-3 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
          Operational Queues
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <QueueLink
            to="/admin-marketplace-quality"
            icon={<Package className="size-3.5 text-accent" />}
            label="Products to Review"
            count={optimization.distribution.needs_attention + optimization.distribution.not_ready}
          />
          <QueueLink
            to="/admin-vendors"
            icon={<Users className="size-3.5 text-accent" />}
            label="Vendors Requiring Attention"
            count={health.rollups.vendors.atRiskCount}
          />
          <QueueLink
            to="/admin-quality"
            icon={<AlertTriangle className="size-3.5 text-accent" />}
            label="Quality Gate Failures"
            count={optimization.distribution.not_ready}
          />
          <QueueLink
            to="/admin-duplicate-intelligence"
            icon={<XCircle className="size-3.5 text-accent" />}
            label="Duplicate Signals"
            count={trust.risks.find((r) => r.area === "duplicates")?.affected ?? 0}
          />
          <QueueLink
            to="/admin-ai-operations"
            icon={<Sparkles className="size-3.5 text-accent" />}
            label="Stale Image Versions"
            count={0}
          />
          <QueueLink
            to="/admin-recommendation-analytics"
            icon={<Activity className="size-3.5 text-accent" />}
            label="Recommendation Analytics"
            count={health.lifecycle.length}
          />
          <QueueLink
            to="/admin-marketplace-quality"
            icon={<ListChecks className="size-3.5 text-accent" />}
            label="Recommendation Backlog"
            count={health.lifecycle.length}
          />
        </div>
      </div>

      {/* 5. Trends */}
      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
        <p className="mb-3 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
          Trends
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <TrendPill label="Marketplace Health" block={{ current: health.score, previous: null, delta: 0, direction: health.trends.readiness.direction }} />
          <TrendPill label="Readiness" block={health.trends.readiness} />
          <TrendPill label="Vendor Health" block={health.trends.vendorHealth} />
          <TrendPill label="Trust" block={health.trends.trust} />
        </div>
      </div>

      {/* 6. Recent Activity */}
      {recentActivity.length > 0 && (
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
          <p className="mb-3 flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
            <Activity className="size-3" /> Recent Activity
          </p>
          <ul className="space-y-2">
            {recentActivity.map((item, i) => (
              <li key={i} className={cn("flex items-start gap-2 text-[12px]", item.tone)}>
                {item.icon}
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Silence unused imports we may want later. */}
      <span className="hidden">{vendors.length}</span>
    </motion.section>
  );
}

function SnapshotCard({
  label, value, tone, icon,
}: { label: string; value: number; tone: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
        {icon}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", tone)}>{value}</div>
    </div>
  );
}

function QueueLink({
  to, icon, label, count,
}: { to: string; icon: React.ReactNode; label: string; count: number }) {
  return (
    <Link
      to={to}
      className="group flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 hover:border-accent/30 hover:bg-white/[0.04]"
    >
      <span className="flex items-center gap-2 text-[12px] text-foreground">
        {icon}
        {label}
      </span>
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground group-hover:text-accent">
        <span className="tabular-nums">{count}</span>
        <ArrowRight className="size-3" />
      </span>
    </Link>
  );
}
