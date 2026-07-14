import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, Gauge, Sparkles, RefreshCw, Trash2 } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  aiMetricsSnapshot,
  resetAiMetrics,
  listFeedback,
  CONFIDENCE_BAND_LABEL,
  type AiMetricsSnapshot,
  type ConfidenceBand,
} from "@/lib/ai-observability";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin-ai-validation")({
  head: () => ({
    meta: [
      { title: "AI Validation & Observability — Admin" },
      {
        name: "description",
        content:
          "Track AI Tier 2 accuracy, cache hit rate, latency, and admin feedback for the Image Intelligence stack.",
      },
    ],
  }),
  component: AiValidationPage,
});

const REFRESH_MS = 4000;

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}
function ms(v: number) {
  return v < 1000 ? `${Math.round(v)}ms` : `${(v / 1000).toFixed(2)}s`;
}

function AiValidationPage() {
  const [snap, setSnap] = useState<AiMetricsSnapshot>(() => aiMetricsSnapshot());
  const [feedback, setFeedback] = useState(() => listFeedback());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setSnap(aiMetricsSnapshot());
    setFeedback(listFeedback());
  }, [tick]);

  return (
    <AdminShell
      title="AI Validation"
      subtitle="Observe Tier 2 accuracy, cost & reliability before auto-execution"
      allow={["admin", "super_admin", "manager", "editor"]}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-xs text-muted-foreground">
            Metrics are captured client-side while staff analyze images. Use this dashboard to
            tune confidence thresholds and decide whether automatic Tier 2 execution is ready.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setTick((t) => t + 1)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1 text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="size-3" /> Refresh
            </button>
            <button
              onClick={() => {
                resetAiMetrics();
                setTick((t) => t + 1);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-[11px] font-mono uppercase tracking-widest text-destructive hover:bg-destructive/20"
            >
              <Trash2 className="size-3" /> Reset counters
            </button>
          </div>
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Images analyzed" value={snap.totals.analyzed} icon={Sparkles} />
          <Kpi label="Cache hits" value={snap.totals.cached} sub={pct(snap.rates.cacheHitRate)} />
          <Kpi label="Auto-trigger rate" value={pct(snap.rates.autoTriggerRate)} sub={`${snap.totals.autoTriggered} auto · ${snap.totals.manual} manual`} />
          <Kpi label="Avg latency" value={ms(snap.latency.avgMs)} sub={`${snap.latency.samples} samples`} icon={Gauge} />
          <Kpi label="Low confidence" value={pct(snap.rates.lowConfidenceRate)} sub={`${snap.totals.lowConfidence} of ${snap.totals.analyzed}`} tone={snap.rates.lowConfidenceRate > 0.2 ? "warn" : "ok"} />
          <Kpi label="Failure rate" value={pct(snap.rates.failureRate)} sub={`${snap.totals.failed} failed`} tone={snap.rates.failureRate > 0.05 ? "warn" : "ok"} />
        </div>

        {/* Confidence distribution */}
        <Panel title="Confidence distribution" icon={Gauge}>
          <div className="space-y-2">
            {(Object.keys(snap.bands) as ConfidenceBand[]).map((band) => {
              const count = snap.bands[band];
              const total = Object.values(snap.bands).reduce((a, b) => a + b, 0);
              const p = total === 0 ? 0 : count / total;
              return (
                <div key={band} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-foreground">{CONFIDENCE_BAND_LABEL[band]}</span>
                    <span className="font-mono text-muted-foreground">
                      {count} · {pct(p)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
                    <div
                      className={cn(
                        "h-full transition-all",
                        band === "high" && "bg-emerald-400",
                        band === "good" && "bg-lime-400",
                        band === "moderate" && "bg-amber-400",
                        band === "low" && "bg-destructive",
                      )}
                      style={{ width: `${p * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        {/* Feedback loop */}
        <Panel title="Admin feedback loop" icon={Activity}>
          <div className="grid grid-cols-4 gap-3 text-center">
            <FeedbackTile label="Total" value={snap.feedback.total} />
            <FeedbackTile label="Correct" value={snap.feedback.correct} tone="ok" />
            <FeedbackTile label="Partial" value={snap.feedback.partial} tone="warn" />
            <FeedbackTile label="Incorrect" value={snap.feedback.incorrect} tone="bad" />
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Accuracy: <span className="font-mono text-foreground">{pct(snap.feedback.accuracy)}</span>
            {" · "}Use this to tune prompt & thresholds before enabling automatic AI on every upload.
          </p>

          {feedback.length > 0 && (
            <div className="mt-4 space-y-1">
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Recent verdicts
              </p>
              <ul className="divide-y divide-white/5 rounded-lg border border-white/10 bg-white/[0.02]">
                {feedback.slice(0, 10).map((f) => (
                  <li key={f.mediaAssetId + f.at} className="flex items-center justify-between px-3 py-1.5 text-[11px]">
                    <span className="truncate font-mono text-muted-foreground">
                      {f.mediaAssetId.slice(0, 8)}…
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        {f.confidence != null ? `${Math.round(f.confidence * 100)}%` : "—"}
                      </span>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-widest",
                          f.verdict === "correct" && "bg-emerald-500/20 text-emerald-200",
                          f.verdict === "partial" && "bg-amber-500/20 text-amber-200",
                          f.verdict === "incorrect" && "bg-destructive/25 text-destructive-foreground",
                        )}
                      >
                        {f.verdict}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        {/* Recent events */}
        <Panel title="Recent AI events" icon={Activity}>
          {snap.recent.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-xs text-muted-foreground">
              No events captured yet — analyze an image to start collecting data.
            </p>
          ) : (
            <ul className="divide-y divide-white/5 rounded-lg border border-white/10 bg-white/[0.02] text-[11px]">
              {snap.recent.slice(0, 25).map((ev, i) => (
                <li key={i} className="flex items-center justify-between px-3 py-1.5">
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest",
                        ev.kind === "analyzed" && "bg-accent/20 text-accent",
                        ev.kind === "cached" && "bg-white/10 text-muted-foreground",
                        ev.kind === "failed" && "bg-destructive/25 text-destructive-foreground",
                        (ev.kind === "manual" || ev.kind === "auto-triggered") && "bg-white/5 text-muted-foreground",
                        ev.kind === "low-confidence" && "bg-amber-500/20 text-amber-200",
                      )}
                    >
                      {ev.kind}
                    </span>
                    {ev.model && <span className="font-mono text-muted-foreground">{ev.model}</span>}
                    {ev.detail && <span className="truncate text-muted-foreground">{ev.detail}</span>}
                  </span>
                  <span className="flex items-center gap-3 font-mono text-muted-foreground">
                    {ev.confidence != null && <span>{Math.round(ev.confidence * 100)}%</span>}
                    {ev.ms != null && <span>{ms(ev.ms)}</span>}
                    <span>{new Date(ev.at).toLocaleTimeString()}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </AdminShell>
  );
}

function Kpi({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        <span>{label}</span>
        {Icon && <Icon className="size-3" />}
      </div>
      <p
        className={cn(
          "mt-1 text-lg font-semibold",
          tone === "warn" && "text-amber-300",
          tone === "ok" && "text-foreground",
        )}
      >
        {value}
      </p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <header className="mb-3 flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
        <Icon className="size-3.5" />
        {title}
      </header>
      {children}
    </section>
  );
}

function FeedbackTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn" | "bad";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-2 py-3",
        tone === "ok" && "border-emerald-500/30 bg-emerald-500/10",
        tone === "warn" && "border-amber-500/30 bg-amber-500/10",
        tone === "bad" && "border-destructive/30 bg-destructive/10",
        !tone && "border-white/10 bg-white/[0.02]",
      )}
    >
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
