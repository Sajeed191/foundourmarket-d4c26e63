/**
 * Compact Acquisition Intelligence summary card (P2-B).
 *
 * Embedded into Executive, Financial, Marketing and Customer Intelligence
 * dashboards. Reads the same staff-gated, real-data server function as the
 * full dashboard — no duplicated or simulated metrics.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Target, ArrowRight, TrendingUp, DollarSign, Users, Lightbulb, Loader2 } from "lucide-react";
import {
  fetchAcquisition, computeKpis, detectOpportunities,
  type ExecutiveKpis, type Opportunity, type TimeRange,
} from "@/lib/acquisition-intelligence";

const money = (n: number) => "$" + new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Math.round(n));
const x = (n: number) => n.toFixed(2) + "×";
const pct = (n: number) => (n * 100).toFixed(1) + "%";

export function AcquisitionSummary({ range = "30d", title = "Acquisition Intelligence" }: { range?: TimeRange; title?: string }) {
  const [kpis, setKpis] = useState<ExecutiveKpis | null>(null);
  const [top, setTop] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const raw = await fetchAcquisition(range, 30);
        if (!active) return;
        setKpis(computeKpis(raw));
        const opps = detectOpportunities(raw);
        setTop(opps.find((o) => o.severity === "critical") ?? opps[0] ?? null);
      } catch {
        /* staff-gated; non-staff simply see nothing */
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [range]);

  return (
    <section className="rounded-2xl border border-border bg-card/30 p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold"><Target className="h-4 w-4 text-accent" /> {title}</h3>
        <Link to="/admin-acquisition-intelligence" className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline">
          Open <ArrowRight className="h-3 w-3" />
        </Link>
      </header>
      {loading ? (
        <div className="grid place-items-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : !kpis ? (
        <p className="py-4 text-center text-xs text-muted-foreground">Unavailable.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-border/60 bg-background/40 p-2.5">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><TrendingUp className="h-3 w-3" /> ROAS</div>
              <div className={`text-base font-semibold ${kpis.roas >= 1 ? "text-emerald-400" : "text-rose-400"}`}>{kpis.spend > 0 ? x(kpis.roas) : "—"}</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/40 p-2.5">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><DollarSign className="h-3 w-3" /> CAC</div>
              <div className="text-base font-semibold">{kpis.conversions > 0 ? money(kpis.cac) : "—"}</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/40 p-2.5">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Users className="h-3 w-3" /> Conv.</div>
              <div className="text-base font-semibold">{pct(kpis.conversionRate)}</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/40 p-2.5">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><DollarSign className="h-3 w-3" /> Rev/visitor</div>
              <div className="text-base font-semibold">{money(kpis.revenuePerVisitor)}</div>
            </div>
          </div>
          {top && (
            <div className="mt-2 rounded-lg border border-border/60 bg-background/40 p-2.5">
              <div className="inline-flex items-center gap-1 text-[11px] font-medium"><Lightbulb className="h-3 w-3 text-accent" /> {top.title}</div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{top.recommendation}</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
