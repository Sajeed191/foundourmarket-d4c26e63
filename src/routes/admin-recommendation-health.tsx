import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Brain, Loader2, TrendingUp, TrendingDown, MousePointerClick, ShoppingCart, Sparkles, FlaskConical, Trophy } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { KpiCard } from "@/components/admin/KpiCard";
import { getPerformanceReport, type SourcePerformance } from "@/lib/recommendations";
import { activeSeasons } from "@/lib/recommendations";
import { fetchSectionAnalytics, type SectionStat } from "@/lib/section-analytics";
import { listAllExperiments, experimentStats, promoteWinner } from "@/lib/recommendations/experiments.functions";

export const Route = createFileRoute("/admin-recommendation-health")({
  head: () => ({ meta: [{ title: "Recommendation Health — Admin" }] }),
  component: RecommendationHealthPage,
});

function label(source: string): string {
  return source.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function RecommendationHealthPage() {
  const [report, setReport] = useState<SourcePerformance[] | null>(null);
  const [sections, setSections] = useState<SectionStat[] | null>(null);

  useEffect(() => {
    setReport(getPerformanceReport());
    fetchSectionAnalytics(30).then(setSections);
  }, []);

  const seasons = useMemo(() => activeSeasons(), []);

  const totals = useMemo(() => {
    const r = report ?? [];
    const impressions = r.reduce((s, x) => s + x.funnel.impression, 0);
    const clicks = r.reduce((s, x) => s + x.funnel.click, 0);
    const purchases = r.reduce((s, x) => s + x.funnel.purchase, 0);
    const carts = r.reduce((s, x) => s + x.funnel.add_to_cart, 0);
    return {
      impressions,
      clicks,
      purchases,
      carts,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    };
  }, [report]);

  return (
    <AdminShell
      title="Recommendation Health"
      subtitle="Self-learning engine · full-funnel quality per strategy (this device) + section analytics (30d)"
      allow={["admin", "super_admin", "manager"]}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Impressions" value={totals.impressions} icon={<Sparkles className="size-4 text-accent" />} />
        <KpiCard label="Overall CTR" value={`${totals.ctr.toFixed(1)}%`} icon={<MousePointerClick className="size-4 text-accent" />} />
        <KpiCard label="Add to Cart" value={totals.carts} icon={<ShoppingCart className="size-4 text-accent" />} />
        <KpiCard label="Purchases" value={totals.purchases} icon={<Brain className="size-4 text-accent" />} />
      </div>

      {seasons.length > 0 && (
        <div className="mb-6 card-premium rounded-2xl px-5 py-3 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Active seasonal boosts:</span>
          {seasons.map((s) => (
            <span key={s.key} className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border border-accent/40 bg-accent/10 text-accent">
              {s.label}
            </span>
          ))}
        </div>
      )}

      <div className="card-premium rounded-2xl overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-medium flex items-center gap-2"><Brain className="size-4 text-accent" /> Strategy Quality (self-learning)</h2>
        </div>
        {report === null ? (
          <div className="p-8"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
        ) : report.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-muted-foreground">No recommendation activity recorded on this device yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left px-5 py-2">Strategy</th>
                  <th className="text-right px-3 py-2">Impr.</th>
                  <th className="text-right px-3 py-2">CTR</th>
                  <th className="text-right px-3 py-2">Cart</th>
                  <th className="text-right px-3 py-2">Buy</th>
                  <th className="text-right px-5 py-2">Quality</th>
                </tr>
              </thead>
              <tbody>
                {report.map((r) => {
                  const strong = r.quality >= 60;
                  const weak = r.quality < 45;
                  const Trend = strong ? TrendingUp : weak ? TrendingDown : MousePointerClick;
                  const color = strong ? "text-emerald-400" : weak ? "text-red-400" : "text-muted-foreground";
                  return (
                    <tr key={r.source} className="border-b border-border/40 last:border-0 hover:bg-white/[0.02]">
                      <td className="px-5 py-2.5 text-xs">{label(r.source)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">{r.funnel.impression}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{r.ctr.toFixed(1)}%</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{r.funnel.add_to_cart}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{r.funnel.purchase}</td>
                      <td className="px-5 py-2.5 text-right">
                        <div className="inline-flex items-center gap-2">
                          <div className="h-1.5 w-14 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-accent/60" style={{ width: `${r.quality}%` }} />
                          </div>
                          <span className={`font-mono text-xs inline-flex items-center gap-1 ${color}`}><Trend className="size-3" /> {r.quality.toFixed(0)}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card-premium rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-medium flex items-center gap-2"><Sparkles className="size-4 text-accent" /> Section Analytics (30d, all visitors)</h2>
        </div>
        {sections === null ? (
          <div className="p-8"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
        ) : sections.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-muted-foreground">No section analytics yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left px-5 py-2">Section</th>
                  <th className="text-right px-3 py-2">Impr.</th>
                  <th className="text-right px-3 py-2">Clicks</th>
                  <th className="text-right px-5 py-2">CTR</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((s) => (
                  <tr key={s.section} className="border-b border-border/40 last:border-0 hover:bg-white/[0.02]">
                    <td className="px-5 py-2.5 text-xs">{label(s.section)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">{s.impressions}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">{s.clicks}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-xs">{s.ctr.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-6">
        <ExperimentsPanel />
      </div>
    </AdminShell>
  );
}

type ExperimentRow = {
  id: string;
  key: string;
  description: string | null;
  variants: unknown;
  traffic_split: unknown;
  status: string;
  winner: string | null;
};

function ExperimentsPanel() {
  const load = useServerFn(listAllExperiments);
  const loadStats = useServerFn(experimentStats);
  const promote = useServerFn(promoteWinner);
  const [rows, setRows] = useState<ExperimentRow[] | null>(null);
  const [stats, setStats] = useState<Record<string, Record<string, number>>>({});

  const refresh = () => {
    load().then((r) => setRows(r as ExperimentRow[])).catch(() => setRows([]));
    loadStats().then(setStats).catch(() => setStats({}));
  };
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPromote = async (id: string, winner: string) => {
    await promote({ data: { id, winner } });
    refresh();
  };

  return (
    <div className="card-premium rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <FlaskConical className="size-4 text-accent" /> Recommendation Experiments (A/B)
        </h2>
      </div>
      {rows === null ? (
        <div className="p-8"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="px-5 py-8 text-center text-xs text-muted-foreground">
          No experiments yet. Create one to A/B test recommendation strategies.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((exp) => {
            const variants = Array.isArray(exp.variants) ? (exp.variants as string[]) : [];
            const counts = stats[exp.key] ?? {};
            return (
              <div key={exp.id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm truncate">{exp.key}</p>
                    {exp.description && <p className="text-[11px] text-muted-foreground truncate">{exp.description}</p>}
                  </div>
                  <span className={`text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border ${exp.status === "running" ? "border-emerald-400/40 text-emerald-400" : exp.status === "completed" ? "border-accent/40 text-accent" : "border-border text-muted-foreground"}`}>
                    {exp.status}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {variants.map((v) => {
                    const isWinner = exp.winner === v;
                    return (
                      <div key={v} className={`rounded-xl border px-3 py-2 flex items-center justify-between ${isWinner ? "border-accent/50 bg-accent/5" : "border-border"}`}>
                        <div>
                          <p className="text-xs font-medium flex items-center gap-1">
                            {isWinner && <Trophy className="size-3 text-accent" />} {v}
                          </p>
                          <p className="text-[10px] font-mono text-muted-foreground">{counts[v] ?? 0} assigned</p>
                        </div>
                        {exp.status === "running" && !exp.winner && (
                          <button
                            onClick={() => onPromote(exp.id, v)}
                            className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-accent/40 text-accent hover:bg-accent/10 transition"
                          >
                            Promote
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

