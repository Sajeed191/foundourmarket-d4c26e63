import type { RecommendationSource } from "./types";

/**
 * Self-improving strategy performance tracker — full-funnel edition.
 *
 * Records the complete conversion funnel per recommendation source in
 * localStorage and derives a live 0–100 quality score plus a bounded priority
 * multiplier. Sections whose strategies perform poorly over time are
 * automatically de-prioritised, so the storefront keeps promoting the blocks
 * that actually convert — no external AI, no schema changes, fully
 * deterministic given the same history.
 *
 * All metrics are internal (never shown to customers).
 */

const KEY = "fom_rec_perf_v2";
const LEGACY_KEY = "fom_rec_perf_v1";

/** Ordered funnel stages, weakest intent → strongest. `return` is negative. */
export type FunnelStage =
  | "impression"
  | "click"
  | "quick_view"
  | "wishlist"
  | "add_to_cart"
  | "buy_now"
  | "checkout_started"
  | "purchase"
  | "return";

type Funnel = Record<FunnelStage, number>;
type Store = Partial<Record<RecommendationSource, Funnel>>;

/** How much each stage contributes to the quality score (per impression). */
const STAGE_WEIGHT: Record<FunnelStage, number> = {
  impression: 0,
  click: 6,
  quick_view: 10,
  wishlist: 14,
  add_to_cart: 22,
  buy_now: 30,
  checkout_started: 26,
  purchase: 40,
  return: -35,
};

function emptyFunnel(): Funnel {
  return {
    impression: 0,
    click: 0,
    quick_view: 0,
    wishlist: 0,
    add_to_cart: 0,
    buy_now: 0,
    checkout_started: 0,
    purchase: 0,
    return: 0,
  };
}

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Store;
    // One-time migration from the CTR-only v1 store.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const old = JSON.parse(legacy) as Partial<
        Record<RecommendationSource, { impressions: number; clicks: number }>
      >;
      const migrated: Store = {};
      for (const [source, stat] of Object.entries(old)) {
        if (!stat) continue;
        const f = emptyFunnel();
        f.impression = stat.impressions ?? 0;
        f.click = stat.clicks ?? 0;
        migrated[source as RecommendationSource] = f;
      }
      write(migrated);
      return migrated;
    }
    return {};
  } catch {
    return {};
  }
}

function write(store: Store) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* quota / private mode — ignore */
  }
}

/** Record any funnel stage for a source. */
export function recordFunnelEvent(source: RecommendationSource, stage: FunnelStage, by = 1) {
  if (!source) return;
  const store = read();
  const f = store[source] ?? emptyFunnel();
  f[stage] += by;
  store[source] = f;
  write(store);
}

export function recordImpression(source: RecommendationSource) {
  recordFunnelEvent(source, "impression");
}

export function recordClick(source: RecommendationSource) {
  recordFunnelEvent(source, "click");
}

/**
 * Live 0–100 quality score for a source, derived from stage-weighted
 * conversion per impression. Returns a neutral 50 until enough data.
 */
export function qualityScore(source: RecommendationSource): number {
  const f = read()[source];
  if (!f || f.impression < 12) return 50;
  let raw = 0;
  for (const stage of Object.keys(STAGE_WEIGHT) as FunnelStage[]) {
    raw += (f[stage] / f.impression) * STAGE_WEIGHT[stage];
  }
  // raw is roughly [-35, ~50] in realistic ranges; map to 0–100 around 50.
  return Math.max(0, Math.min(100, 50 + raw * 1.4));
}

/**
 * Priority multiplier in [0.6, 1.4] derived from the quality score. Strategies
 * with no data return 1 (neutral) so new blocks get a fair chance before the
 * system judges them.
 */
export function priorityMultiplier(source: RecommendationSource): number {
  const f = read()[source];
  if (!f || f.impression < 12) return 1;
  const q = qualityScore(source); // 0..100, neutral 50
  const rel = (q - 50) / 50; // -1..+1
  return Math.max(0.6, Math.min(1.4, 1 + rel * 0.4));
}

export type SourcePerformance = {
  source: RecommendationSource;
  funnel: Funnel;
  quality: number;
  ctr: number;
  purchaseRate: number;
};

export function getPerformanceSnapshot(): Store {
  return read();
}

/** Rich snapshot for the admin health dashboard. */
export function getPerformanceReport(): SourcePerformance[] {
  const store = read();
  return (Object.entries(store) as [RecommendationSource, Funnel][])
    .map(([source, f]) => ({
      source,
      funnel: f,
      quality: qualityScore(source),
      ctr: f.impression > 0 ? (f.click / f.impression) * 100 : 0,
      purchaseRate: f.impression > 0 ? (f.purchase / f.impression) * 100 : 0,
    }))
    .sort((a, b) => b.quality - a.quality);
}

/**
 * Attribution — credits later funnel stages (quick view, wishlist, cart, buy,
 * purchase) to the recommendation source the shopper most recently engaged
 * with. A single active attribution is kept in-memory with a time window so a
 * click on a "Frequently Bought Together" card that later becomes a purchase
 * is credited to that source, not to whichever rail happens to be mounted.
 */
const ATTRIBUTION_WINDOW = 30 * 60 * 1000; // 30 minutes
let activeSource: { source: RecommendationSource; at: number } | null = null;

/** Call when a shopper clicks a product that came from a recommendation rail. */
export function markRecommendationClick(source: RecommendationSource, slug?: string) {
  recordFunnelEvent(source, "click");
  activeSource = { source, at: Date.now() };
  if (typeof window !== "undefined" && slug) {
    try {
      sessionStorage.setItem(
        "fom_rec_attr",
        JSON.stringify({ source, slug, at: Date.now() }),
      );
    } catch {
      /* ignore */
    }
  }
}

function currentSource(): RecommendationSource | null {
  if (activeSource && Date.now() - activeSource.at < ATTRIBUTION_WINDOW) {
    return activeSource.source;
  }
  if (typeof window !== "undefined") {
    try {
      const raw = sessionStorage.getItem("fom_rec_attr");
      if (raw) {
        const parsed = JSON.parse(raw) as { source: RecommendationSource; at: number };
        if (Date.now() - parsed.at < ATTRIBUTION_WINDOW) return parsed.source;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Record a downstream funnel stage against the currently attributed source. */
export function attributeStage(stage: FunnelStage) {
  const source = currentSource();
  if (source) recordFunnelEvent(source, stage);
}
