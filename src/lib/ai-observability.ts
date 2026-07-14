/**
 * Phase B.5 — AI Validation & Observability.
 * ------------------------------------------
 * Frontend-only telemetry + feedback layer for the Image Intelligence stack.
 * Zero DB changes: rides on localStorage + an in-memory ring buffer, mirroring
 * `cache-metrics.ts`. Exists solely to answer:
 *
 *   - Is AI Tier 2 accurate enough to run automatically?
 *   - How often does it trigger, cache-hit, or time out?
 *   - Where are admins overriding AI suggestions?
 *
 * NEVER wire this into cart/checkout/payment/live-stock flows.
 */

export type ConfidenceBand = "high" | "good" | "moderate" | "low";

export function confidenceBand(c: number | null | undefined): ConfidenceBand {
  const v = typeof c === "number" ? c : 0;
  if (v >= 0.95) return "high";
  if (v >= 0.8) return "good";
  if (v >= 0.6) return "moderate";
  return "low";
}

export const CONFIDENCE_BAND_LABEL: Record<ConfidenceBand, string> = {
  high: "High confidence (≥95%)",
  good: "Good confidence (80–94%)",
  moderate: "Moderate — review recommended (60–79%)",
  low: "Low — manual review required (<60%)",
};

// ─────────────────────────────────────────────────────────────────────────────
// Event bus (in-memory ring + persisted counters)
// ─────────────────────────────────────────────────────────────────────────────

export type AiEventKind =
  | "analyzed"       // fresh AI call succeeded
  | "cached"         // returned cached payload, no gateway hit
  | "failed"         // gateway/parse error
  | "auto-triggered" // heuristic auto-ran AI at upload
  | "manual"         // admin clicked Analyze
  | "low-confidence";

export type AiEvent = {
  kind: AiEventKind;
  at: number;
  ms?: number;
  model?: string | null;
  modelVersion?: string | null;
  confidence?: number | null;
  band?: ConfidenceBand;
  mediaAssetId?: string;
  detail?: string;
};

const RING_MAX = 300;
const LS_COUNTERS = "fom.ai.metrics.v1";
const LS_FEEDBACK = "fom.ai.feedback.v1";

const ring: AiEvent[] = [];
let counters: Record<string, number> = loadCounters();

function loadCounters(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(LS_COUNTERS) || "{}") ?? {};
  } catch {
    return {};
  }
}

function persistCounters() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_COUNTERS, JSON.stringify(counters));
  } catch {
    /* quota — ignore */
  }
}

function bump(key: string, by = 1) {
  counters[key] = (counters[key] ?? 0) + by;
}

export function recordAiEvent(kind: AiEventKind, opts: Omit<AiEvent, "kind" | "at"> = {}) {
  if (typeof window === "undefined") return;
  const band = opts.band ?? (opts.confidence != null ? confidenceBand(opts.confidence) : undefined);
  const ev: AiEvent = { kind, at: Date.now(), band, ...opts };
  ring.push(ev);
  if (ring.length > RING_MAX) ring.shift();

  bump(kind);
  if (typeof ev.ms === "number") {
    bump("latency.sum", ev.ms);
    bump("latency.count");
  }
  if (band) bump(`band.${band}`);
  if (kind === "analyzed" && band === "low") recordAiEvent("low-confidence", { ...opts, band });
  persistCounters();
}

/** Convenience: time an async AI call and record analyzed/cached/failed. */
export async function timedAiCall<T extends { cached?: boolean; analysis?: { product?: { confidence?: number | null }; ai?: { model?: string | null; version?: string | null } } }>(
  mediaAssetId: string,
  trigger: "manual" | "auto-triggered",
  run: () => Promise<T>,
): Promise<T> {
  recordAiEvent(trigger, { mediaAssetId });
  const start = performance.now();
  try {
    const res = await run();
    const ms = performance.now() - start;
    const conf = res.analysis?.product?.confidence ?? null;
    recordAiEvent(res.cached ? "cached" : "analyzed", {
      ms,
      mediaAssetId,
      confidence: conf,
      model: res.analysis?.ai?.model ?? null,
      modelVersion: res.analysis?.ai?.version ?? null,
    });
    return res;
  } catch (err) {
    recordAiEvent("failed", {
      ms: performance.now() - start,
      mediaAssetId,
      detail: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin feedback loop (✓ / ✗ / ⚠) — persisted per media asset
// ─────────────────────────────────────────────────────────────────────────────

export type FeedbackVerdict = "correct" | "partial" | "incorrect";

export type FeedbackEntry = {
  mediaAssetId: string;
  verdict: FeedbackVerdict;
  confidence: number | null;
  model: string | null;
  modelVersion: string | null;
  note?: string;
  at: number;
};

function loadFeedback(): Record<string, FeedbackEntry> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(LS_FEEDBACK) || "{}") ?? {};
  } catch {
    return {};
  }
}

function persistFeedback(map: Record<string, FeedbackEntry>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_FEEDBACK, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function recordFeedback(entry: FeedbackEntry) {
  const map = loadFeedback();
  map[entry.mediaAssetId] = entry;
  persistFeedback(map);
  bump(`feedback.${entry.verdict}`);
  persistCounters();
}

export function getFeedback(mediaAssetId: string): FeedbackEntry | null {
  return loadFeedback()[mediaAssetId] ?? null;
}

export function listFeedback(): FeedbackEntry[] {
  return Object.values(loadFeedback()).sort((a, b) => b.at - a.at);
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard snapshot
// ─────────────────────────────────────────────────────────────────────────────

export type AiMetricsSnapshot = {
  totals: {
    analyzed: number;
    cached: number;
    failed: number;
    manual: number;
    autoTriggered: number;
    lowConfidence: number;
  };
  rates: {
    cacheHitRate: number;      // cached / (cached + analyzed)
    failureRate: number;       // failed / (failed + analyzed + cached)
    lowConfidenceRate: number; // low-confidence / analyzed
    autoTriggerRate: number;   // auto / (auto + manual)
  };
  latency: {
    avgMs: number;
    samples: number;
  };
  bands: Record<ConfidenceBand, number>;
  feedback: {
    total: number;
    correct: number;
    partial: number;
    incorrect: number;
    accuracy: number; // correct / total
  };
  recent: AiEvent[];
};

export function aiMetricsSnapshot(): AiMetricsSnapshot {
  const c = counters;
  const analyzed = c["analyzed"] ?? 0;
  const cached = c["cached"] ?? 0;
  const failed = c["failed"] ?? 0;
  const manual = c["manual"] ?? 0;
  const auto = c["auto-triggered"] ?? 0;
  const low = c["low-confidence"] ?? 0;
  const latencySum = c["latency.sum"] ?? 0;
  const latencyCount = c["latency.count"] ?? 0;

  const fbCorrect = c["feedback.correct"] ?? 0;
  const fbPartial = c["feedback.partial"] ?? 0;
  const fbIncorrect = c["feedback.incorrect"] ?? 0;
  const fbTotal = fbCorrect + fbPartial + fbIncorrect;

  const safeRate = (num: number, den: number) => (den === 0 ? 0 : num / den);

  return {
    totals: {
      analyzed,
      cached,
      failed,
      manual,
      autoTriggered: auto,
      lowConfidence: low,
    },
    rates: {
      cacheHitRate: safeRate(cached, cached + analyzed),
      failureRate: safeRate(failed, failed + analyzed + cached),
      lowConfidenceRate: safeRate(low, analyzed),
      autoTriggerRate: safeRate(auto, auto + manual),
    },
    latency: {
      avgMs: latencyCount === 0 ? 0 : latencySum / latencyCount,
      samples: latencyCount,
    },
    bands: {
      high: c["band.high"] ?? 0,
      good: c["band.good"] ?? 0,
      moderate: c["band.moderate"] ?? 0,
      low: c["band.low"] ?? 0,
    },
    feedback: {
      total: fbTotal,
      correct: fbCorrect,
      partial: fbPartial,
      incorrect: fbIncorrect,
      accuracy: safeRate(fbCorrect, fbTotal),
    },
    recent: ring.slice(-50).reverse(),
  };
}

export function resetAiMetrics() {
  counters = {};
  ring.length = 0;
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(LS_COUNTERS);
  }
}

if (typeof window !== "undefined") {
  (window as unknown as { __aiMetrics?: unknown }).__aiMetrics = {
    snapshot: aiMetricsSnapshot,
    reset: resetAiMetrics,
  };
}
