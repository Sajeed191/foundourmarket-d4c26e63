/**
 * Infrastructure v2.0 — Recovery Analytics (read-only aggregator).
 *
 * NO runtime impact: this module never subscribes, never polls, never writes.
 * It only reads the diagnostic events already captured by the startup guard
 * in `localStorage.fom_startup_diagnostics` and derives KPIs on demand.
 *
 * Called only when the admin diagnostics panel is opened.
 */

export type RecoverySource =
  | "chunk"
  | "network"
  | "service-worker"
  | "deployment"
  | "manual"
  | "unknown";

export type RecoveryAttempt = {
  source: RecoverySource;
  startedAt: number;
  completedAt: number | null;
  duration: number | null;
  success: boolean;
  falsePositive: boolean;
  reason: string;
};

export type RecoveryAnalytics = {
  attempts: {
    total: number;
    today: number;
    last24h: number;
  };
  successRate: number | null; // 0..100
  successRateTrend: "up" | "down" | "flat" | null;
  falsePositive: {
    count: number;
    percentage: number | null;
    trend: "up" | "down" | "flat" | null;
  };
  duration: {
    avg: number | null;
    median: number | null;
    fastest: number | null;
    slowest: number | null;
  };
  sources: Array<{ source: RecoverySource; count: number; percentage: number }>;
  recent: RecoveryAttempt[];
  raw: {
    events: number;
    lastEventAt: number | null;
  };
};

type DiagEvent = {
  event: string;
  at: string;
  path?: string;
  build?: string;
  payload?: Record<string, unknown> & {
    reason?: string;
    prev?: string;
    next?: string;
    source?: string;
    at?: number;
    attempt?: number;
    delayMs?: number;
    recoveredInMs?: number;
    attempts?: number;
  };
};

const KEY = "fom_startup_diagnostics";

function readEvents(): DiagEvent[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as DiagEvent[]) : [];
  } catch {
    return [];
  }
}

function classifySource(src: string | undefined, reason: string | undefined): RecoverySource {
  const s = (src || "").toLowerCase();
  const r = (reason || "").toLowerCase();
  if (s.includes("chunk") || r.includes("chunk") || r.includes("dynamically imported") || r.includes("loading css")) return "chunk";
  if (s === "network" || s.includes("network")) return "network";
  if (s.includes("sw") || s.includes("service-worker") || s.includes("service worker")) return "service-worker";
  if (s.includes("deploy")) return "deployment";
  if (s.includes("manual") || s.includes("user")) return "manual";
  return "unknown";
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function trend(recent: number, prior: number): "up" | "down" | "flat" | null {
  if (recent === 0 && prior === 0) return null;
  if (Math.abs(recent - prior) < 0.5) return "flat";
  return recent > prior ? "up" : "down";
}

export function computeRecoveryAnalytics(): RecoveryAnalytics {
  const events = readEvents();
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const startOfToday = new Date().setHours(0, 0, 0, 0);

  const attempts: RecoveryAttempt[] = [];
  // Walk events in order and pair a "recovering" transition with the next
  // "boot-ok" (success) — anything else stays unresolved.
  let open: RecoveryAttempt | null = null;

  for (const ev of events) {
    const ts = Date.parse(ev.at || "") || 0;
    if (!ts) continue;

    if (ev.event === "recovery-transition" && ev.payload?.next === "recovering") {
      // Close a prior open one as unresolved (still counted as an attempt).
      if (open) attempts.push(open);
      open = {
        source: classifySource(ev.payload?.source, ev.payload?.reason),
        startedAt: ts,
        completedAt: null,
        duration: null,
        success: false,
        falsePositive: false,
        reason: String(ev.payload?.reason || ev.payload?.source || ""),
      };
      continue;
    }

    if (ev.event === "boot-ok") {
      const recoveredInMs = Number(ev.payload?.recoveredInMs || 0);
      if (open) {
        open.completedAt = ts;
        open.duration = recoveredInMs > 0 ? recoveredInMs : Math.max(0, ts - open.startedAt);
        open.success = true;
        attempts.push(open);
        open = null;
      } else if (recoveredInMs > 0) {
        // Recovery completed but the "recovering" transition rolled off the ring buffer.
        attempts.push({
          source: "unknown",
          startedAt: ts - recoveredInMs,
          completedAt: ts,
          duration: recoveredInMs,
          success: true,
          falsePositive: false,
          reason: "boot-ok (transition unavailable)",
        });
      }
    }
  }
  if (open) attempts.push(open);

  // False positives: ignored recovery calls + transitions that flipped without work.
  const ignored = events.filter((e) => e.event === "recovery-ignored" || e.event === "startup-error-ignored");
  const ignoredCount = ignored.length;
  // Add "recovery-transition" entries where prev===next (duplicate suppressed).
  const dupTransitions = events.filter(
    (e) => e.event === "recovery-transition" && e.payload?.prev && e.payload?.prev === e.payload?.next,
  ).length;
  const falsePositiveCount = ignoredCount + dupTransitions;

  const attemptCount = attempts.length;
  const successCount = attempts.filter((a) => a.success).length;
  const successRate = attemptCount ? Math.round((successCount / attemptCount) * 1000) / 10 : null;

  // Split for trend: last half vs first half of attempts.
  const half = Math.floor(attemptCount / 2);
  const firstHalf = attempts.slice(0, half);
  const secondHalf = attempts.slice(half);
  const sr1 = firstHalf.length ? firstHalf.filter((a) => a.success).length / firstHalf.length : 0;
  const sr2 = secondHalf.length ? secondHalf.filter((a) => a.success).length / secondHalf.length : 0;
  const successRateTrend = attemptCount >= 4 ? trend(sr2 * 100, sr1 * 100) : null;

  const totalDenom = attemptCount + falsePositiveCount;
  const fpPct = totalDenom ? Math.round((falsePositiveCount / totalDenom) * 1000) / 10 : null;
  const halfIgn = Math.floor(ignored.length / 2);
  const fpTrend = ignored.length >= 4 ? trend(ignored.length - halfIgn, halfIgn) : null;

  const durations = attempts.filter((a) => a.duration != null && a.duration >= 0).map((a) => a.duration as number);
  const avg = durations.length ? Math.round(durations.reduce((s, n) => s + n, 0) / durations.length) : null;
  const med = median(durations);
  const fastest = durations.length ? Math.min(...durations) : null;
  const slowest = durations.length ? Math.max(...durations) : null;

  const sourceCounts = new Map<RecoverySource, number>();
  for (const a of attempts) sourceCounts.set(a.source, (sourceCounts.get(a.source) || 0) + 1);
  const sources = Array.from(sourceCounts.entries())
    .map(([source, count]) => ({
      source,
      count,
      percentage: attemptCount ? Math.round((count / attemptCount) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const today = attempts.filter((a) => a.startedAt >= startOfToday).length;
  const last24h = attempts.filter((a) => a.startedAt >= now - dayMs).length;

  const lastEventAt = events.length ? Date.parse(events[events.length - 1].at || "") || null : null;

  return {
    attempts: { total: attemptCount, today, last24h },
    successRate,
    successRateTrend,
    falsePositive: { count: falsePositiveCount, percentage: fpPct, trend: fpTrend },
    duration: { avg, median: med, fastest, slowest },
    sources,
    recent: attempts.slice(-8).reverse(),
    raw: { events: events.length, lastEventAt },
  };
}
