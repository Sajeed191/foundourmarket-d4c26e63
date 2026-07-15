import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Play, Loader2, CheckCircle2, XCircle, Gauge, Package, Zap,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { cn } from "@/lib/utils";
import { generateSynthProducts } from "@/lib/perf-harness/synth";
import {
  runBenchmark,
  measureBulkThroughput,
  type BenchmarkResult,
  type BulkThroughput,
} from "@/lib/perf-harness/benchmarks";

export const Route = createFileRoute("/admin-perf-harness")({
  head: () => ({
    meta: [
      { title: "Perf & Scale Harness — FoundOurMarket™" },
      {
        name: "description",
        content:
          "Stabilization tool — benchmark the frozen Intelligence + Operations pipelines against synthetic catalogs of 1k / 10k / 100k products.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PerfHarnessPage,
});

type SizeChoice = 1_000 | 10_000 | 100_000;
const SIZE_OPTIONS: SizeChoice[] = [1_000, 10_000, 100_000];

function fmtMs(ms: number): string {
  if (ms < 1) return `${ms.toFixed(2)}ms`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function fmtRate(x?: number): string {
  if (x == null || !isFinite(x)) return "—";
  if (x >= 1000) return `${(x / 1000).toFixed(1)}k / s`;
  return `${x.toFixed(0)} / s`;
}

function PerfHarnessPage() {
  const [size, setSize] = useState<SizeChoice>(1_000);
  const [running, setRunning] = useState<"idle" | "generating" | "pipeline" | "bulk">("idle");
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [bulk, setBulk] = useState<BulkThroughput[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    setResult(null);
    setBulk(null);
    try {
      setRunning("generating");
      // Chunk large generation so the UI paints.
      await new Promise((r) => setTimeout(r, 0));
      const products = generateSynthProducts(size, 42);

      setRunning("pipeline");
      const r = await runBenchmark(products, (label) => setCurrentStage(label));
      setResult(r);
      setCurrentStage(null);

      setRunning("bulk");
      const b = await measureBulkThroughput(products, Math.min(size, 500));
      setBulk(b);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning("idle");
      setCurrentStage(null);
    }
  }

  const isRunning = running !== "idle";

  return (
    <AdminShell
      title="Perf & Scale Harness"
      subtitle="Stabilization Sprint — benchmark frozen Platform v1.0 pipelines"
      actions={
        <Link
          to="/admin"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/40 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-border/70 transition"
        >
          <ArrowLeft className="size-3.5" /> Admin Home
        </Link>
      }
    >
      <div className="space-y-6">
        {/* Controls */}
        <section className="rounded-xl border border-border/40 bg-card/40 p-4">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold inline-flex items-center gap-2">
                <Gauge className="size-4 text-primary" /> Synthetic catalog size
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Generates deterministic products in memory, then runs the frozen analyzers, rollups, queues, and analytics pipelines end-to-end.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {SIZE_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSize(n)}
                    disabled={isRunning}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                      size === n
                        ? "border-primary/60 bg-primary/15 text-primary"
                        : "border-border/40 bg-card/40 text-muted-foreground hover:text-foreground hover:border-border/70",
                      isRunning && "opacity-60 cursor-not-allowed",
                    )}
                  >
                    <Package className="size-3.5" /> {n.toLocaleString()}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Tip: run 1k first to confirm setup, then scale. 100k can take a while on slower devices.
              </p>
            </div>
            <button
              type="button"
              disabled={isRunning}
              onClick={run}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition",
                isRunning
                  ? "border border-border/40 bg-muted/10 text-muted-foreground cursor-not-allowed"
                  : "border border-primary/60 bg-primary/15 text-primary hover:bg-primary/25",
              )}
            >
              {isRunning ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              {isRunning
                ? running === "generating"
                  ? "Generating…"
                  : running === "pipeline"
                    ? currentStage ?? "Running pipeline…"
                    : "Measuring bulk ops…"
                : "Run benchmark"}
            </button>
          </div>
          {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
        </section>

        {/* Pipeline results */}
        <AnimatePresence>
          {result && (
            <motion.section
              key={`stages-${result.productCount}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-border/40 bg-card/40 p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold">
                  Pipeline results — {result.productCount.toLocaleString()} products
                </h2>
                <span className="text-xs text-muted-foreground">
                  Total {fmtMs(result.totalMs)}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border/40">
                      <th className="py-2 pr-3 font-medium">Stage</th>
                      <th className="py-2 pr-3 font-medium text-right">Time</th>
                      <th className="py-2 pr-3 font-medium text-right">Throughput</th>
                      <th className="py-2 pr-3 font-medium text-right">Budget</th>
                      <th className="py-2 pr-3 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.stages.map((s) => {
                      const verdict = result.budgets.find((b) => b.stage === s.label);
                      return (
                        <tr key={s.label} className="border-b border-border/20 last:border-0">
                          <td className="py-2 pr-3">{s.label}</td>
                          <td className="py-2 pr-3 text-right font-mono">{fmtMs(s.ms)}</td>
                          <td className="py-2 pr-3 text-right font-mono">{fmtRate(s.itemsPerSecond)}</td>
                          <td className="py-2 pr-3 text-right font-mono text-muted-foreground">
                            {verdict && isFinite(verdict.budgetMs) ? fmtMs(verdict.budgetMs) : "—"}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {verdict ? (
                              verdict.ok ? (
                                <span className="inline-flex items-center gap-1 text-emerald-300">
                                  <CheckCircle2 className="size-3.5" /> OK
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-destructive">
                                  <XCircle className="size-3.5" /> Over
                                </span>
                              )
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Bulk throughput */}
        <AnimatePresence>
          {bulk && (
            <motion.section
              key="bulk"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-border/40 bg-card/40 p-4"
            >
              <h2 className="text-sm font-semibold mb-3 inline-flex items-center gap-2">
                <Zap className="size-4 text-amber-300" /> Bulk Operations throughput
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border/40">
                      <th className="py-2 pr-3 font-medium">Operation</th>
                      <th className="py-2 pr-3 font-medium text-right">Items</th>
                      <th className="py-2 pr-3 font-medium text-right">Time</th>
                      <th className="py-2 pr-3 font-medium text-right">Throughput</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulk.map((b) => (
                      <tr key={b.type} className="border-b border-border/20 last:border-0">
                        <td className="py-2 pr-3">{b.label}</td>
                        <td className="py-2 pr-3 text-right font-mono">{b.items.toLocaleString()}</td>
                        <td className="py-2 pr-3 text-right font-mono">{fmtMs(b.ms)}</td>
                        <td className="py-2 pr-3 text-right font-mono">{fmtRate(b.itemsPerSecond)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Sampled on up to 500 products to keep the harness responsive. Extrapolate to full catalog size.
              </p>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Notes */}
        <section className="rounded-xl border border-border/30 bg-muted/5 p-4 text-[11px] text-muted-foreground leading-relaxed">
          <div className="font-semibold text-foreground/80 mb-1">Notes</div>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>Runs entirely in this browser — no data leaves the device and no product is mutated.</li>
            <li>Budgets are baseline targets, not authoritative SLAs. Tune per environment before promoting them.</li>
            <li>Numbers vary with device CPU, thermal state, and other browser tabs. Compare deltas, not absolutes.</li>
          </ul>
        </section>
      </div>
    </AdminShell>
  );
}
