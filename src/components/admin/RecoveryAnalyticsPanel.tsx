import { useCallback, useEffect, useState } from "react";
import { Activity, TrendingUp, TrendingDown, Minus, Timer, AlertTriangle, RefreshCw, PieChart } from "lucide-react";
import { computeRecoveryAnalytics, type RecoveryAnalytics, type RecoverySource } from "@/lib/infra/recovery-analytics";

function ms(n: number | null): string {
  if (n == null) return "—";
  if (n < 1000) return `${n} ms`;
  if (n < 60_000) return `${(n / 1000).toFixed(n < 10_000 ? 2 : 1)} s`;
  return `${Math.round(n / 1000)} s`;
}

function pct(n: number | null): string {
  if (n == null) return "—";
  return `${n.toFixed(1)}%`;
}

function TrendGlyph({ t }: { t: "up" | "down" | "flat" | null }) {
  if (t === "up") return <TrendingUp className="size-3.5 text-emerald-500" />;
  if (t === "down") return <TrendingDown className="size-3.5 text-rose-500" />;
  if (t === "flat") return <Minus className="size-3.5 text-muted-foreground" />;
  return <Minus className="size-3.5 text-muted-foreground/50" />;
}

const SOURCE_LABEL: Record<RecoverySource, string> = {
  chunk: "Chunk",
  network: "Network",
  "service-worker": "Service Worker",
  deployment: "Deployment",
  manual: "Manual",
  unknown: "Unknown",
};

export function RecoveryAnalyticsPanel() {
  const [data, setData] = useState<RecoveryAnalytics | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    setBusy(true);
    try {
      setData(computeRecoveryAnalytics());
    } finally {
      setBusy(false);
    }
  }, []);

  // Aggregation runs only on open + manual refresh. No polling, no timers.
  useEffect(() => { refresh(); }, [refresh]);

  const attempts = data?.attempts.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Activity className="size-4 text-accent" />
          <span className="font-mono uppercase tracking-widest text-[10px]">Recovery analytics</span>
          <span>·</span>
          <span>{data?.raw.events ?? 0} events</span>
        </div>
        <button
          onClick={refresh}
          disabled={busy}
          className="text-xs inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 hover:bg-muted/50"
        >
          <RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card-premium rounded-2xl p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <Activity className="size-4 text-accent" /><span>Recovery attempts</span>
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{attempts}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {data?.attempts.today ?? 0} today · {data?.attempts.last24h ?? 0} in 24h
          </div>
        </div>

        <div className="card-premium rounded-2xl p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <TrendingUp className="size-4 text-accent" /><span>Success rate</span>
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums flex items-center gap-2">
            {pct(data?.successRate ?? null)}
            <TrendGlyph t={data?.successRateTrend ?? null} />
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Successful ÷ attempts</div>
        </div>

        <div className="card-premium rounded-2xl p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <AlertTriangle className="size-4 text-accent" /><span>False positives</span>
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums flex items-center gap-2">
            {data?.falsePositive.count ?? 0}
            <TrendGlyph t={data?.falsePositive.trend ?? null} />
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{pct(data?.falsePositive.percentage ?? null)} of signals</div>
        </div>

        <div className="card-premium rounded-2xl p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <Timer className="size-4 text-accent" /><span>Avg duration</span>
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{ms(data?.duration.avg ?? null)}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            med {ms(data?.duration.median ?? null)} · fast {ms(data?.duration.fastest ?? null)} · slow {ms(data?.duration.slowest ?? null)}
          </div>
        </div>
      </div>

      <div className="card-premium rounded-2xl p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-3">
          <PieChart className="size-4 text-accent" /><span>Source breakdown</span>
        </div>
        {!data || data.sources.length === 0 ? (
          <div className="text-sm text-muted-foreground">No recoveries recorded.</div>
        ) : (
          <div className="divide-y divide-border/40 -mx-4">
            {data.sources.map((s) => (
              <div key={s.source} className="px-4 py-2.5 flex items-center gap-4 text-sm">
                <span className="font-mono text-xs">{SOURCE_LABEL[s.source]}</span>
                <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                  <div className="h-full bg-accent/70" style={{ width: `${Math.max(4, s.percentage)}%` }} />
                </div>
                <span className="text-muted-foreground w-14 text-right tabular-nums">{s.count}</span>
                <span className="text-muted-foreground w-16 text-right tabular-nums">{s.percentage.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card-premium rounded-2xl p-4">
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Recent attempts</div>
        {!data || data.recent.length === 0 ? (
          <div className="text-sm text-muted-foreground">No recent recovery activity.</div>
        ) : (
          <div className="divide-y divide-border/40 -mx-4">
            {data.recent.map((a, i) => (
              <div key={`${a.startedAt}-${i}`} className="px-4 py-2.5 grid grid-cols-[100px_1fr_80px_80px] items-center gap-3 text-sm">
                <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{SOURCE_LABEL[a.source]}</span>
                <span className="truncate text-muted-foreground text-xs">{a.reason || "—"}</span>
                <span className="text-right tabular-nums text-xs">{ms(a.duration)}</span>
                <span className={`text-right text-[11px] font-mono uppercase tracking-widest ${a.success ? "text-emerald-500" : "text-amber-500"}`}>
                  {a.success ? "ok" : "open"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
