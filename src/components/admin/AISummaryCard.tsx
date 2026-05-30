import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Sparkles, AlertTriangle, TrendingUp, ArrowUpRight } from "lucide-react";
import { useAIOperations } from "@/lib/use-ai-operations";
import { groupByCategory } from "@/lib/ai-operations";

const EASE = [0.16, 1, 0.3, 1] as const;
const money = (n: number, c = "USD") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: c, maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0);

/** Compact AI Operations summary for the Executive Dashboard. */
export function AISummaryCard() {
  const { loading, recs, currency } = useAIOperations();
  if (loading) return null;

  const groups = groupByCategory(recs);
  const critical = groups.critical.length;
  const topOpp = [...groups.profit, ...groups.growth].sort((a, b) => b.impact - a.impact)[0];
  const topRisk = [...groups.critical, ...groups.risk][0];
  const expected = [...groups.profit, ...groups.growth].reduce((a, o) => a + o.impact, 0);

  return (
    <motion.section id="ai-summary" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
      className="relative overflow-hidden rounded-2xl glass glass-reflect scroll-mt-24"
      style={{ boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.05), 0 22px 50px -32px oklch(0 0 0 / 0.85)" }}>
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <div className="flex items-center gap-2"><Sparkles className="size-4 text-accent" /><h2 className="text-[13px] font-medium">AI Operations</h2></div>
        <Link to="/admin-ai-operations" className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-full bg-accent/15 text-accent border border-accent/30 inline-flex items-center gap-1">Open <ArrowUpRight className="size-3" /></Link>
      </div>
      <div className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Critical actions" value={String(critical)} tone={critical > 0 ? "rose" : "muted"} />
        <Stat label="Expected impact" value={expected > 0 ? `~${money(expected, currency)}` : "—"} tone="emerald" />
        <div className="col-span-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="flex items-center gap-1.5 mb-1"><TrendingUp className="size-3 text-emerald-300" /><span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">Top opportunity</span></div>
          <p className="text-[12px] text-foreground/90 line-clamp-2">{topOpp ? topOpp.title : "No new opportunities detected."}</p>
        </div>
        <div className="col-span-2 sm:col-span-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="flex items-center gap-1.5 mb-1"><AlertTriangle className="size-3 text-rose-300" /><span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">Top risk</span></div>
          <p className="text-[12px] text-foreground/90 line-clamp-2">{topRisk ? topRisk.title : "No critical risks detected."}</p>
        </div>
      </div>
    </motion.section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "rose" | "emerald" | "muted" }) {
  const cls = tone === "rose" ? "text-rose-300" : tone === "emerald" ? "text-emerald-300" : "text-foreground";
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p className={`text-lg font-display font-semibold tabular-nums ${cls}`}>{value}</p>
    </div>
  );
}
