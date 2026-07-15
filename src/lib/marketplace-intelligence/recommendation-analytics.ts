/**
 * Recommendation Analytics v1.0 — Marketplace Intelligence 3.0, analytics layer.
 *
 * Pure aggregation over stable public contracts:
 *   - Recommendation (Catalog Intelligence 2.0)
 *   - LifecycleRecommendation (Marketplace Health v1.0)
 *   - MarketplaceOptimization (Marketplace Intelligence 3.0)
 *   - VendorIntelligence (Marketplace Intelligence 3.0)
 *
 * Explicitly NEVER:
 *   - Creates recommendations
 *   - Runs detection or scoring
 *   - Calls Image or Catalog Intelligence internals
 *   - Talks to any AI service
 *
 * It answers operational questions ("are admins resolving recs?", "which
 * modules generate the most work?") using history already persisted by the
 * lifecycle tracker. Consumers should pass `history` — the per-recommendation
 * timeline maintained by useRecommendationAnalytics — to compute resolution
 * time, regression, and trend deltas.
 */
import type { Recommendation } from "@/lib/catalog-intelligence";
import type { LifecycleRecommendation, RecommendationLifecycleState } from "./marketplace-health";
import type { MarketplaceOptimization, CategoryRollup } from "./marketplace-optimization";
import type { VendorIntelligence } from "./vendor-intelligence";

export type AnalyticsTrend = "improving" | "stable" | "declining" | "unknown";
export type Impact = "High" | "Medium" | "Low";

/** Per-recommendation timeline maintained by the analytics hook. */
export type RecommendationHistoryEntry = {
  key: string;                 // `${module}::${action}`
  module: string;
  impact: Impact;
  confidence: number;
  firstSeenAt: string;         // ISO
  lastSeenAt: string;          // ISO
  seenCount: number;
  resolvedAt: string | null;   // ISO — null while active
  lastResolutionMs: number | null;
  totalResolutionMs: number;   // sum across all resolved cycles
  resolvedCycles: number;      // completed resolve cycles
  regressions: number;         // resolved → returned
};

export type RecommendationHistory = {
  entries: Record<string, RecommendationHistoryEntry>;
  updatedAt: string;
};

export type ModuleAnalytics = {
  module: string;
  generated: number;
  active: number;
  resolved: number;
  regressed: number;
  resolutionRate: number;         // 0..100
  averageConfidence: number;      // 0..100
  averageImpactScore: number;     // 0..100 (High=100, Med=60, Low=25)
  averageResolutionMs: number;    // 0 when nothing resolved
};

export type CategoryAnalytics = {
  categoryId: string;
  categoryName: string;
  averageReadiness: number;
  listingCount: number;
  topAction: string | null;
  topImpact: Impact | null;
};

export type VendorAnalytics = {
  vendorId: string;
  vendorName: string;
  score: number;
  tier: VendorIntelligence["tier"];
  listingCount: number;
  topAction: string | null;
};

export type ImpactBucket = { impact: Impact; count: number };

export type LifecycleFunnel = Record<RecommendationLifecycleState, number>;

export type RecommendationAnalytics = {
  version: 1;
  generatedAt: string;

  // Executive KPIs
  generated: number;         // total distinct rec keys ever seen (history)
  active: number;            // currently open (unresolved)
  resolvedTotal: number;     // total completed resolution cycles
  resolvedToday: number;
  regressed: number;         // total regression events
  persistent: number;        // active AND seen ≥ 3 snapshots
  averageResolutionMs: number;
  resolutionRate7d: number;  // 0..100
  resolutionRate30d: number;

  // Breakdowns
  moduleBreakdown: ModuleAnalytics[];
  impactMatrix: ImpactBucket[];
  lifecycleFunnel: LifecycleFunnel;
  categoryBreakdown: CategoryAnalytics[];
  vendorBreakdown: VendorAnalytics[];

  // Trend of overall resolution rate (last 7d vs prior 7d)
  trend: AnalyticsTrend;

  explainable: true;
};

const IMPACT_SCORE: Record<Impact, number> = { High: 100, Medium: 60, Low: 25 };

function meanOr0(xs: number[]): number {
  if (!xs.length) return 0;
  return Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
}

function isWithin(iso: string, ms: number): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= ms;
}

const DAY = 24 * 60 * 60 * 1000;

export type RecommendationAnalyticsInput = {
  lifecycle: LifecycleRecommendation[];
  optimization: MarketplaceOptimization | null;
  vendors: VendorIntelligence[];
  history: RecommendationHistory;
};

export function buildRecommendationAnalytics(
  input: RecommendationAnalyticsInput,
): RecommendationAnalytics {
  const { lifecycle, optimization, vendors, history } = input;
  const entries = Object.values(history.entries);

  // ---------------- Executive KPIs
  const generated = entries.length;
  const active = entries.filter((e) => !e.resolvedAt).length;
  const resolvedTotal = entries.reduce((a, e) => a + e.resolvedCycles, 0);
  const resolvedToday = entries.filter(
    (e) => e.resolvedAt && isWithin(e.resolvedAt, DAY),
  ).length;
  const regressed = entries.reduce((a, e) => a + e.regressions, 0);
  const persistent = entries.filter((e) => !e.resolvedAt && e.seenCount >= 3).length;

  const resolvedMs = entries
    .filter((e) => e.resolvedCycles > 0)
    .map((e) => e.totalResolutionMs / Math.max(1, e.resolvedCycles));
  const averageResolutionMs = meanOr0(resolvedMs);

  function rateWindow(days: number): number {
    const windowMs = days * DAY;
    const seen = entries.filter((e) => isWithin(e.lastSeenAt, windowMs)).length;
    const resolved = entries.filter(
      (e) => e.resolvedAt && isWithin(e.resolvedAt, windowMs),
    ).length;
    if (seen === 0) return 0;
    return Math.min(100, Math.round((resolved / seen) * 100));
  }
  const resolutionRate7d = rateWindow(7);
  const resolutionRate30d = rateWindow(30);

  // ---------------- Module breakdown
  const byModule = new Map<string, RecommendationHistoryEntry[]>();
  for (const e of entries) {
    const list = byModule.get(e.module) ?? [];
    list.push(e);
    byModule.set(e.module, list);
  }
  const moduleBreakdown: ModuleAnalytics[] = Array.from(byModule.entries()).map(
    ([module, es]) => {
      const gen = es.length;
      const act = es.filter((e) => !e.resolvedAt).length;
      const res = es.reduce((a, e) => a + e.resolvedCycles, 0);
      const reg = es.reduce((a, e) => a + e.regressions, 0);
      const seen = es.length;
      return {
        module,
        generated: gen,
        active: act,
        resolved: res,
        regressed: reg,
        resolutionRate: seen ? Math.round((res / (res + act || 1)) * 100) : 0,
        averageConfidence: meanOr0(es.map((e) => e.confidence)),
        averageImpactScore: meanOr0(es.map((e) => IMPACT_SCORE[e.impact])),
        averageResolutionMs: meanOr0(
          es.filter((e) => e.resolvedCycles > 0).map(
            (e) => e.totalResolutionMs / Math.max(1, e.resolvedCycles),
          ),
        ),
      };
    },
  ).sort((a, b) => b.generated - a.generated);

  // ---------------- Impact matrix (from current lifecycle)
  const impactCounts: Record<Impact, number> = { High: 0, Medium: 0, Low: 0 };
  for (const r of lifecycle) impactCounts[r.impact] = (impactCounts[r.impact] ?? 0) + 1;
  const impactMatrix: ImpactBucket[] = (Object.keys(impactCounts) as Impact[]).map(
    (impact) => ({ impact, count: impactCounts[impact] }),
  );

  // ---------------- Lifecycle funnel (current snapshot)
  const funnel: LifecycleFunnel = { new: 0, persistent: 0, resolved: 0, regressed: 0 };
  for (const r of lifecycle) funnel[r.lifecycle] += 1;
  funnel.resolved = resolvedTotal;

  // ---------------- Category & vendor breakdown (from public contracts)
  const categoryBreakdown: CategoryAnalytics[] = optimization
    ? mergeCategoryRollups(optimization.weakestCategories, optimization.strongestCategories)
    : [];

  const vendorBreakdown: VendorAnalytics[] = vendors
    .slice()
    .sort((a, b) => a.score - b.score)
    .slice(0, 10)
    .map((v) => ({
      vendorId: v.vendorId,
      vendorName: v.vendorName,
      score: v.score,
      tier: v.tier,
      listingCount: v.listingCount,
      topAction: v.action ?? null,
    }));

  // ---------------- Trend: 7d vs prior 7d resolution rate
  const prior = ((): number => {
    const start = Date.now() - 14 * DAY;
    const end = Date.now() - 7 * DAY;
    const inPrior = (t: string) => {
      const p = Date.parse(t);
      return !Number.isNaN(p) && p >= start && p <= end;
    };
    const seen = entries.filter((e) => inPrior(e.lastSeenAt)).length;
    const resolved = entries.filter((e) => e.resolvedAt && inPrior(e.resolvedAt)).length;
    if (seen === 0) return -1;
    return Math.round((resolved / seen) * 100);
  })();
  let trend: AnalyticsTrend = "unknown";
  if (prior >= 0) {
    const delta = resolutionRate7d - prior;
    if (delta >= 5) trend = "improving";
    else if (delta <= -5) trend = "declining";
    else trend = "stable";
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    generated,
    active,
    resolvedTotal,
    resolvedToday,
    regressed,
    persistent,
    averageResolutionMs,
    resolutionRate7d,
    resolutionRate30d,
    moduleBreakdown,
    impactMatrix,
    lifecycleFunnel: funnel,
    categoryBreakdown,
    vendorBreakdown,
    trend,
    explainable: true,
  };
}

function mergeCategoryRollups(
  weakest: CategoryRollup[],
  strongest: CategoryRollup[],
): CategoryAnalytics[] {
  const seen = new Set<string>();
  const merged: CategoryAnalytics[] = [];
  for (const c of [...weakest, ...strongest]) {
    if (seen.has(c.categoryId)) continue;
    seen.add(c.categoryId);
    merged.push({
      categoryId: c.categoryId,
      categoryName: c.categoryName,
      averageReadiness: c.averageReadiness,
      listingCount: c.listingCount,
      topAction: c.topRecommendation?.action ?? null,
      topImpact: (c.topRecommendation?.impact as Impact | undefined) ?? null,
    });
  }
  return merged;
}

/**
 * Update the persisted history with the current recommendation snapshot.
 * Returns a new immutable history object. Never mutates the input.
 *
 * Rules:
 *   - First time we see a key → create entry (seenCount 1, active).
 *   - Seen again while active → increment seenCount, update lastSeen.
 *   - Seen again while marked resolved → resolvedAt cleared, regressions++.
 *   - Present last snapshot but absent now → mark resolved, accumulate resolution time.
 */
export function updateRecommendationHistory(
  history: RecommendationHistory,
  current: Recommendation[],
  now: string = new Date().toISOString(),
): RecommendationHistory {
  const next: Record<string, RecommendationHistoryEntry> = { ...history.entries };
  const currentKeys = new Set<string>();

  for (const r of current) {
    const key = `${r.module}::${r.action}`;
    currentKeys.add(key);
    const existing = next[key];
    if (!existing) {
      next[key] = {
        key,
        module: r.module,
        impact: r.impact,
        confidence: r.confidence,
        firstSeenAt: now,
        lastSeenAt: now,
        seenCount: 1,
        resolvedAt: null,
        lastResolutionMs: null,
        totalResolutionMs: 0,
        resolvedCycles: 0,
        regressions: 0,
      };
      continue;
    }
    const regressed = existing.resolvedAt != null;
    next[key] = {
      ...existing,
      lastSeenAt: now,
      seenCount: existing.seenCount + 1,
      impact: r.impact,
      confidence: r.confidence,
      resolvedAt: null,
      regressions: existing.regressions + (regressed ? 1 : 0),
    };
  }

  // Anything previously active and not in current → newly resolved.
  for (const key of Object.keys(next)) {
    const e = next[key];
    if (currentKeys.has(key)) continue;
    if (e.resolvedAt) continue; // already resolved
    const first = Date.parse(e.firstSeenAt);
    const t = Date.parse(now);
    const dur = Number.isFinite(first) && Number.isFinite(t) ? Math.max(0, t - first) : 0;
    next[key] = {
      ...e,
      resolvedAt: now,
      lastResolutionMs: dur,
      totalResolutionMs: e.totalResolutionMs + dur,
      resolvedCycles: e.resolvedCycles + 1,
    };
  }

  // Prune entries resolved > 60 days ago to bound storage.
  const cutoff = Date.now() - 60 * DAY;
  for (const key of Object.keys(next)) {
    const e = next[key];
    if (e.resolvedAt && Date.parse(e.resolvedAt) < cutoff) delete next[key];
  }

  return { entries: next, updatedAt: now };
}

export function emptyRecommendationHistory(): RecommendationHistory {
  return { entries: {}, updatedAt: new Date().toISOString() };
}

export function formatDurationShort(ms: number): string {
  if (!ms || ms <= 0) return "—";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  return `${days}d`;
}
