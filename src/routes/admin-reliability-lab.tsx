/**
 * Reliability & Regression Lab — /admin-reliability-lab
 *
 * Final stabilization deliverable before Track A (Vendor Portal). Runs a
 * read-only test suite over the frozen intelligence + operations contracts
 * and produces a single Platform Stability Score.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowLeft, Play, Loader2, CheckCircle2, AlertTriangle, XCircle, ShieldCheck,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { cn } from "@/lib/utils";
import {
  runReliabilitySuite,
  DEFAULT_TOGGLES,
  type FailureToggles,
  type RunSummary,
  type TestResult,
} from "@/lib/reliability-lab/tests";

export const Route = createFileRoute("/admin-reliability-lab")({
  head: () => ({
    meta: [
      { title: "Reliability & Regression Lab — FoundOurMarket™" },
      {
        name: "description",
        content:
          "Stabilization tool — verify the frozen platform remains correct after interruptions, upgrades and edge cases.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ReliabilityLabPage,
});

type SizeChoice = 500 | 2_000 | 10_000;
const SIZE_OPTIONS: SizeChoice[] = [500, 2_000, 10_000];

function fmtMs(ms: number): string {
  if (ms < 1) return `${ms.toFixed(2)}ms`;
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function scoreTint(score: number): string {
  if (score >= 95) return "text-emerald-400";
  if (score >= 80) return "text-amber-400";
  return "text-rose-400";
}

function StatusIcon({ status }: { status: TestResult["status"] }) {
  if (status === "pass") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "warn") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  if (status === "fail") return <XCircle className="h-4 w-4 text-rose-500" />;
  return <span className="text-muted-foreground text-xs">—</span>;
}

function ReliabilityLabPage() {
  const [size, setSize] = useState<SizeChoice>(2_000);
  const [toggles, setToggles] = useState<FailureToggles>({
    ...DEFAULT_TOGGLES,
    timeout: true,
    missingModule: true,
    staleContract: true,
  });
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    if (!summary) return null;
    const map = new Map<string, TestResult[]>();
    for (const r of summary.results) {
      const list = map.get(r.category) ?? [];
      list.push(r);
      map.set(r.category, list);
    }
    return Array.from(map.entries());
  }, [summary]);

  async function run() {
    setError(null);
    setSummary(null);
    setRunning(true);
    try {
      const s = await runReliabilitySuite(size, toggles, setStage);
      setSummary(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
      setStage(null);
    }
  }

  return (
    <AdminShell title="Reliability & Regression Lab">
      <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <Link
            to="/admin-executive"
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Reliability & Regression Lab</h1>
            <p className="text-sm text-muted-foreground">
              Verify the frozen platform degrades gracefully under interruptions, upgrades and edge cases.
            </p>
          </div>
        </div>

        {/* Controls */}
        <section className="rounded-xl border bg-card/50 p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Catalog size</label>
              <div className="mt-1 flex gap-1">
                {SIZE_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={running}
                    onClick={() => setSize(n)}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-xs",
                      size === n ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
                    )}
                  >
                    {n.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground">Failure injection</label>
              <div className="mt-1 flex flex-wrap gap-2">
                {(
                  [
                    ["timeout", "Timeout"],
                    ["storage", "Storage failure"],
                    ["corruptedSnapshot", "Corrupted snapshot"],
                    ["missingModule", "Missing module"],
                    ["staleContract", "Stale contract"],
                  ] as [keyof FailureToggles, string][]
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
                      toggles[key] ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={toggles[key]}
                      disabled={running}
                      onChange={(e) =>
                        setToggles((t) => ({ ...t, [key]: e.target.checked }))
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={run}
              disabled={running}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {running ? (stage ?? "Running…") : "Run suite"}
            </button>
          </div>
        </section>

        {error && (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        {summary && (
          <>
            {/* Stability score */}
            <section className="rounded-xl border bg-card/60 p-5">
              <div className="flex items-center gap-4">
                <ShieldCheck className={cn("h-10 w-10", scoreTint(summary.score))} />
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Platform Stability
                  </div>
                  <div className={cn("text-4xl font-semibold", scoreTint(summary.score))}>
                    {summary.score} / 100
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {summary.totals.pass} pass · {summary.totals.warn} warn · {summary.totals.fail} fail
                    · {summary.totals.total} total
                  </div>
                </div>
              </div>
              {summary.warnings.length > 0 && (
                <div className="mt-4 space-y-1">
                  <div className="text-xs font-semibold text-amber-400">Warnings</div>
                  <ul className="list-disc pl-5 text-xs text-muted-foreground">
                    {summary.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* Categorised results */}
            <section className="space-y-4">
              {grouped?.map(([category, rows]) => (
                <div key={category} className="rounded-xl border bg-card/40">
                  <div className="border-b px-4 py-2 text-sm font-medium">{category}</div>
                  <ul className="divide-y">
                    {rows.map((r) => (
                      <li key={r.id} className="flex items-start gap-3 px-4 py-2.5">
                        <div className="mt-0.5">
                          <StatusIcon status={r.status} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-sm">{r.name}</span>
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                              {fmtMs(r.ms)}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">{r.detail}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          </>
        )}

        {!summary && !running && (
          <p className="text-xs text-muted-foreground">
            Read-only. This lab never mutates catalog data — it only exercises the frozen public
            contracts (Intelligence + Operations) and reports whether each degrades gracefully.
          </p>
        )}
      </div>
    </AdminShell>
  );
}
