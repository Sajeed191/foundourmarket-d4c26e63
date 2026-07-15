/**
 * Recommendation Quality Validation — Stabilization tool.
 *
 * Read-only reviewer surface that samples the frozen intelligence pipeline
 * across the analysed catalog and captures human judgment on each top
 * recommendation. Introduces no new intelligence — it only stores review
 * verdicts in localStorage and derives two quality KPIs:
 *
 *   - Acceptance Rate = Accepted / Reviewed
 *   - Precision       = Accepted / Total surfaced
 *
 * Verdicts feed future threshold + wording tuning without changing any
 * frozen contract.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Trash2 } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { cn } from "@/lib/utils";
import { useMarketplaceHealth } from "@/lib/use-marketplace-health";
import { brokerRecommendations, type Recommendation } from "@/lib/catalog-intelligence";

export const Route = createFileRoute("/admin-recommendation-validation")({
  head: () => ({
    meta: [
      { title: "Recommendation Quality Validation — FoundOurMarket™" },
      {
        name: "description",
        content:
          "Stabilization tool — validate whether the frozen intelligence platform surfaces the right top recommendation for each listing.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ValidationPage,
});

type Verdict = "correct" | "partial" | "incorrect";
type FeedbackTag =
  | "wrong_priority"
  | "wrong_action"
  | "unclear_wording"
  | "missing_context";

type ReviewEntry = {
  key: string; // productSlug::module::action
  productSlug: string;
  productName: string;
  module: string;
  action: string;
  impact: string;
  confidence: number;
  verdict: Verdict;
  tags: FeedbackTag[];
  note?: string;
  reviewedAt: string;
};

type ReviewStore = { entries: Record<string, ReviewEntry>; updatedAt: string };

const STORE_KEY = "fom.recommendation-validation.v1";

function loadStore(): ReviewStore {
  if (typeof window === "undefined") return { entries: {}, updatedAt: new Date().toISOString() };
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return { entries: {}, updatedAt: new Date().toISOString() };
    return JSON.parse(raw) as ReviewStore;
  } catch {
    return { entries: {}, updatedAt: new Date().toISOString() };
  }
}
function saveStore(s: ReviewStore) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

type SampleRow = {
  key: string;
  productSlug: string;
  productName: string;
  categoryName: string | null;
  vendorName: string | null;
  top: Recommendation;
  allRecs: Recommendation[];
  conflict: boolean;
};

const VERDICT_META: Record<Verdict, { label: string; icon: typeof CheckCircle2; className: string }> = {
  correct: { label: "Correct", icon: CheckCircle2, className: "border-emerald-400/50 bg-emerald-500/15 text-emerald-200" },
  partial: { label: "Partial", icon: AlertTriangle, className: "border-amber-400/50 bg-amber-500/15 text-amber-200" },
  incorrect: { label: "Incorrect", icon: XCircle, className: "border-rose-400/50 bg-rose-500/15 text-rose-200" },
};

const TAG_META: Record<FeedbackTag, string> = {
  wrong_priority: "Wrong priority",
  wrong_action: "Wrong action",
  unclear_wording: "Unclear wording",
  missing_context: "Missing context",
};

function ValidationPage() {
  const bundle = useMarketplaceHealth();
  const [store, setStore] = useState<ReviewStore>(() => loadStore());
  const [sampleSize, setSampleSize] = useState<number>(50);
  const [filter, setFilter] = useState<"all" | "unreviewed" | "flagged" | "conflicts">("all");

  useEffect(() => saveStore(store), [store]);

  const rows: SampleRow[] = useMemo(() => {
    if (!bundle.listings.length) return [];
    const out: SampleRow[] = [];
    for (const l of bundle.listings) {
      const recs = brokerRecommendations(l.modules);
      const top = recs[0];
      if (!top) continue;
      const conflict = recs.length >= 2 && recs[1].priority >= top.priority - 5;
      out.push({
        key: `${l.productSlug}::${top.module}::${top.action}`,
        productSlug: l.productSlug,
        productName: l.productName,
        categoryName: l.categoryName,
        vendorName: l.vendorName,
        top,
        allRecs: recs,
        conflict,
      });
    }
    return out.slice(0, sampleSize);
  }, [bundle.listings, sampleSize]);

  const visible = useMemo(() => {
    switch (filter) {
      case "unreviewed":
        return rows.filter((r) => !store.entries[r.key]);
      case "flagged":
        return rows.filter((r) => store.entries[r.key] && store.entries[r.key].verdict !== "correct");
      case "conflicts":
        return rows.filter((r) => r.conflict);
      default:
        return rows;
    }
  }, [rows, filter, store.entries]);

  const kpis = useMemo(() => {
    const total = rows.length;
    const reviewed = rows.filter((r) => store.entries[r.key]).length;
    const accepted = rows.filter((r) => store.entries[r.key]?.verdict === "correct").length;
    const partial = rows.filter((r) => store.entries[r.key]?.verdict === "partial").length;
    const incorrect = rows.filter((r) => store.entries[r.key]?.verdict === "incorrect").length;
    const acceptanceRate = reviewed ? Math.round((accepted / reviewed) * 100) : 0;
    const precision = total ? Math.round((accepted / total) * 100) : 0;
    const conflicts = rows.filter((r) => r.conflict).length;
    return { total, reviewed, accepted, partial, incorrect, acceptanceRate, precision, conflicts };
  }, [rows, store.entries]);

  function setVerdict(row: SampleRow, verdict: Verdict) {
    setStore((s) => {
      const existing = s.entries[row.key];
      const entry: ReviewEntry = {
        key: row.key,
        productSlug: row.productSlug,
        productName: row.productName,
        module: row.top.module,
        action: row.top.action,
        impact: row.top.impact,
        confidence: row.top.confidence,
        verdict,
        tags: existing?.tags ?? [],
        note: existing?.note,
        reviewedAt: new Date().toISOString(),
      };
      return { entries: { ...s.entries, [row.key]: entry }, updatedAt: new Date().toISOString() };
    });
  }
  function toggleTag(row: SampleRow, tag: FeedbackTag) {
    setStore((s) => {
      const existing = s.entries[row.key];
      if (!existing) return s;
      const has = existing.tags.includes(tag);
      const tags = has ? existing.tags.filter((t) => t !== tag) : [...existing.tags, tag];
      return {
        entries: { ...s.entries, [row.key]: { ...existing, tags } },
        updatedAt: new Date().toISOString(),
      };
    });
  }
  function setNote(row: SampleRow, note: string) {
    setStore((s) => {
      const existing = s.entries[row.key];
      if (!existing) return s;
      return {
        entries: { ...s.entries, [row.key]: { ...existing, note } },
        updatedAt: new Date().toISOString(),
      };
    });
  }
  function reset() {
    if (!window.confirm("Clear all review verdicts?")) return;
    const empty = { entries: {}, updatedAt: new Date().toISOString() };
    setStore(empty);
  }
  function exportJson() {
    const data = JSON.stringify(store, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recommendation-validation-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AdminShell title="Recommendation Quality Validation">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
        <div className="flex items-center justify-between">
          <Link
            to="/admin-executive"
            className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Command Center
          </Link>
          <div className="flex gap-2">
            <button
              onClick={exportJson}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
            >
              Export JSON
            </button>
            <button
              onClick={reset}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-500/20"
            >
              <Trash2 className="h-3.5 w-3.5" /> Reset
            </button>
          </div>
        </div>

        <header className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h1 className="text-xl font-semibold text-white">Recommendation Quality Validation</h1>
          <p className="mt-1 max-w-3xl text-sm text-white/60">
            Sample the frozen intelligence platform and mark whether each top recommendation is
            the highest-value fix. Verdicts stay local — nothing changes the frozen contracts.
          </p>
        </header>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <Kpi label="Sampled" value={String(kpis.total)} />
          <Kpi label="Reviewed" value={`${kpis.reviewed}/${kpis.total}`} />
          <Kpi label="Acceptance Rate" value={`${kpis.acceptanceRate}%`} accent="emerald" hint="Correct / Reviewed" />
          <Kpi label="Precision" value={`${kpis.precision}%`} accent="sky" hint="Correct / Total surfaced" />
          <Kpi label="Flagged" value={String(kpis.partial + kpis.incorrect)} accent="amber" />
          <Kpi label="Conflicts" value={String(kpis.conflicts)} accent="rose" hint="Priority within 5 pts" />
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <label className="text-xs uppercase tracking-wide text-white/50">Sample size</label>
          {[25, 50, 100, 120].map((n) => (
            <button
              key={n}
              onClick={() => setSampleSize(n)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs",
                sampleSize === n
                  ? "border-white/40 bg-white/15 text-white"
                  : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10",
              )}
            >
              {n}
            </button>
          ))}
          <div className="mx-2 h-4 w-px bg-white/10" />
          <label className="text-xs uppercase tracking-wide text-white/50">Filter</label>
          {(["all", "unreviewed", "flagged", "conflicts"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs capitalize",
                filter === f
                  ? "border-white/40 bg-white/15 text-white"
                  : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10",
              )}
            >
              {f}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 text-xs text-white/50">
            <RefreshCw className="h-3.5 w-3.5" />
            Pool: {bundle.analysedProducts}/{bundle.totalProducts} products
          </div>
        </div>

        {/* Rows */}
        {bundle.loading ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-sm text-white/60">
            Loading catalog…
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-sm text-white/60">
            No recommendations match this filter.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {visible.map((row) => {
              const review = store.entries[row.key];
              return (
                <article
                  key={row.key}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-white/50">
                        <span>{row.categoryName ?? "—"}</span>
                        <span>·</span>
                        <span>{row.vendorName ?? "—"}</span>
                        {row.conflict && (
                          <span className="rounded border border-rose-400/40 bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-200">
                            conflict
                          </span>
                        )}
                      </div>
                      <h3 className="mt-0.5 truncate text-sm font-medium text-white">
                        {row.productName}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <Chip>{row.top.module}</Chip>
                      <Chip>{row.top.impact} impact</Chip>
                      <Chip>{row.top.confidence}% conf</Chip>
                      <Chip>prio {row.top.priority}</Chip>
                    </div>
                  </div>

                  <p className="mt-3 text-sm text-white/85">{row.top.recommendation}</p>
                  <p className="mt-1 text-xs text-white/55">Action: {row.top.action}</p>

                  {row.allRecs.length > 1 && (
                    <details className="mt-2 text-xs text-white/50">
                      <summary className="cursor-pointer hover:text-white/80">
                        {row.allRecs.length - 1} other recommendation{row.allRecs.length > 2 ? "s" : ""}
                      </summary>
                      <ul className="mt-2 space-y-1 pl-3">
                        {row.allRecs.slice(1, 5).map((r, i) => (
                          <li key={i}>
                            · <span className="text-white/70">{r.module}</span> — {r.recommendation}{" "}
                            <span className="text-white/40">(prio {r.priority})</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

                  {/* Verdict buttons */}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {(Object.keys(VERDICT_META) as Verdict[]).map((v) => {
                      const meta = VERDICT_META[v];
                      const Icon = meta.icon;
                      const active = review?.verdict === v;
                      return (
                        <button
                          key={v}
                          onClick={() => setVerdict(row, v)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition",
                            active
                              ? meta.className
                              : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10",
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {meta.label}
                        </button>
                      );
                    })}
                  </div>

                  {review && review.verdict !== "correct" && (
                    <>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {(Object.keys(TAG_META) as FeedbackTag[]).map((tag) => {
                          const active = review.tags.includes(tag);
                          return (
                            <button
                              key={tag}
                              onClick={() => toggleTag(row, tag)}
                              className={cn(
                                "rounded-md border px-2 py-0.5 text-[11px]",
                                active
                                  ? "border-amber-400/50 bg-amber-500/15 text-amber-200"
                                  : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10",
                              )}
                            >
                              {TAG_META[tag]}
                            </button>
                          );
                        })}
                      </div>
                      <textarea
                        value={review.note ?? ""}
                        onChange={(e) => setNote(row, e.target.value)}
                        placeholder="Optional note (why is it wrong, what would be better?)"
                        rows={2}
                        className="mt-2 w-full resize-none rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
                      />
                    </>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function Kpi({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: string;
  accent?: "emerald" | "sky" | "amber" | "rose";
  hint?: string;
}) {
  const accents: Record<string, string> = {
    emerald: "text-emerald-300",
    sky: "text-sky-300",
    amber: "text-amber-300",
    rose: "text-rose-300",
  };
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[10px] uppercase tracking-wide text-white/50">{label}</div>
      <div className={cn("mt-1 text-xl font-semibold text-white", accent && accents[accent])}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-white/40">{hint}</div>}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/70">
      {children}
    </span>
  );
}
