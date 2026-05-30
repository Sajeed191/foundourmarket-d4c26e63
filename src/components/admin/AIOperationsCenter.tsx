import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Sparkles, AlertTriangle, TrendingUp, Zap, Lightbulb, Wallet, Boxes, Users,
  Megaphone, LayoutDashboard, Check, X, Clock, Archive, ArrowUpRight, Loader2,
  Brain, FileText, Activity,
} from "lucide-react";
import { useAIOperations } from "@/lib/use-ai-operations";
import {
  CATEGORY_META, CATEGORY_ORDER, PRIORITY_META, groupByCategory, assistantGroups,
  type AIRecommendation, type AICategory, type AISystem,
} from "@/lib/ai-operations";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;
const money = (n: number, c = "USD") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: c, maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0);

const CAT_ICON: Record<AICategory, typeof Sparkles> = {
  critical: AlertTriangle, risk: AlertTriangle, profit: TrendingUp,
  growth: Sparkles, efficiency: Zap, recommended: Lightbulb,
};
const SYS_ICON: Record<AISystem, typeof Boxes> = {
  inventory: Boxes, customers: Users, marketing: Megaphone, financial: Wallet,
  storefront: LayoutDashboard, products: Boxes, support: Users, executive: Brain,
};

function Panel({ title, icon, children, id, actions }: { title: string; icon: React.ReactNode; children: React.ReactNode; id?: string; actions?: React.ReactNode }) {
  return (
    <motion.section id={id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
      className="relative overflow-hidden rounded-2xl glass glass-reflect scroll-mt-24"
      style={{ boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.05), 0 22px 50px -32px oklch(0 0 0 / 0.85)" }}>
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 min-w-0"><span className="text-accent shrink-0">{icon}</span><h2 className="text-[13px] font-medium truncate">{title}</h2></div>
        {actions}
      </div>
      <div className="px-4 pb-4">{children}</div>
    </motion.section>
  );
}

function RecCard({ rec, onAct, busy }: { rec: AIRecommendation; onAct: ReturnType<typeof useAIOperations>["act"]; busy: string | null }) {
  const isBusy = busy === rec.key;
  return (
    <li className={cn("rounded-xl border p-3 space-y-2", CATEGORY_META[rec.category].tone)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{rec.title}</p>
          <p className="text-[11px] text-muted-foreground line-clamp-2">{rec.detail}</p>
        </div>
        <span className={cn("shrink-0 text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border", PRIORITY_META[rec.priority].tone)}>{PRIORITY_META[rec.priority].label}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {rec.impact > 0 && <span className="text-[10px] tabular-nums text-emerald-300">Impact ~{money(rec.impact)}</span>}
        <span className="text-[10px] text-accent">Confidence {rec.confidence}%</span>
        {rec.systems.map((s) => {
          const Icon = SYS_ICON[s];
          return <span key={s} className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-muted-foreground"><Icon className="size-3" />{s}</span>;
        })}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <ActBtn onClick={() => onAct(rec, "approved")} busy={isBusy} icon={<Check className="size-3" />} label="Approve" tone="emerald" />
        <ActBtn onClick={() => onAct(rec, "rejected")} busy={isBusy} icon={<X className="size-3" />} label="Reject" tone="rose" />
        <ActBtn onClick={() => onAct(rec, "snoozed", { snoozeHours: 24 })} busy={isBusy} icon={<Clock className="size-3" />} label="Snooze" tone="neutral" />
        <ActBtn onClick={() => onAct(rec, "executed", { outcome: "executed" })} busy={isBusy} icon={<Zap className="size-3" />} label="Execute" tone="accent" />
        <ActBtn onClick={() => onAct(rec, "archived")} busy={isBusy} icon={<Archive className="size-3" />} label="Archive" tone="neutral" />
        {rec.to && <Link to={rec.to} className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-full bg-white/[0.04] border border-white/10 hover:border-accent/30 inline-flex items-center gap-1">Open <ArrowUpRight className="size-3" /></Link>}
      </div>
    </li>
  );
}

function ActBtn({ onClick, busy, icon, label, tone }: { onClick: () => void; busy: boolean; icon: React.ReactNode; label: string; tone: "emerald" | "rose" | "accent" | "neutral" }) {
  const tones = {
    emerald: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
    rose: "bg-rose-400/15 text-rose-300 border-rose-400/30",
    accent: "bg-accent/15 text-accent border-accent/30",
    neutral: "bg-white/[0.04] text-muted-foreground border-white/10",
  } as const;
  return (
    <button disabled={busy} onClick={onClick}
      className={cn("text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-full border inline-flex items-center gap-1 disabled:opacity-50 active:scale-95 transition-all", tones[tone])}>
      {busy ? <Loader2 className="size-3 animate-spin" /> : icon} {label}
    </button>
  );
}

const VIEW_ANCHORS: Record<string, string> = {
  recommendations: "recommendations", risks: "cat-risk", opportunities: "cat-profit",
  critical: "cat-critical", briefing: "briefing", weekly: "weekly", assistants: "assistants",
};

export function AIOperationsCenter({ focusView }: { focusView?: string }) {
  const { loading, currency, recs, briefing, weekly, busy, act } = useAIOperations();
  const [tab, setTab] = useState<"actions" | "assistants" | "briefing">("actions");

  if (focusView && VIEW_ANCHORS[focusView]) {
    requestAnimationFrame(() => {
      const el = document.getElementById(VIEW_ANCHORS[focusView]);
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); el.classList.add("deep-link-flash"); setTimeout(() => el.classList.remove("deep-link-flash"), 2000); }
    });
  }

  if (loading) return <div className="min-h-[40vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>;

  const groups = groupByCategory(recs);
  const assistants = assistantGroups(recs);

  const counts: { c: AICategory; n: number }[] = CATEGORY_ORDER.map((c) => ({ c, n: groups[c].length }));

  return (
    <div className="space-y-5">
      {/* summary counters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {counts.map(({ c, n }, i) => {
          const Icon = CAT_ICON[c];
          return (
            <motion.a href={`#cat-${c}`} key={c} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02, ease: EASE }}
              className="rounded-2xl glass p-4 block hover:border-accent/30 transition-all">
              <div className="flex items-center gap-2 mb-2"><Icon className="size-4 text-accent" /><span className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground/80 truncate">{CATEGORY_META[c].label}</span></div>
              <p className="text-2xl font-display font-semibold tabular-nums">{n}</p>
            </motion.a>
          );
        })}
      </div>

      {/* tabs */}
      <div className="flex items-center gap-2">
        {([["actions", "Actions"], ["assistants", "Assistants"], ["briefing", "Briefing & Report"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn("text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full border transition-all", tab === id ? "bg-accent/15 text-accent border-accent/30" : "bg-white/[0.03] text-muted-foreground border-white/10")}>{label}</button>
        ))}
      </div>

      {tab === "actions" && (
        <div id="recommendations" className="space-y-5">
          {CATEGORY_ORDER.map((c) => groups[c].length > 0 && (
            <Panel key={c} id={`cat-${c}`} title={CATEGORY_META[c].label} icon={<span className={cn("inline-block size-2 rounded-full", CATEGORY_META[c].dot)} />}
              actions={<span className="text-[10px] font-mono text-muted-foreground">{groups[c].length}</span>}>
              <ul className="space-y-2">
                {groups[c].map((r) => <RecCard key={r.key} rec={r} onAct={act} busy={busy} />)}
              </ul>
            </Panel>
          ))}
          {recs.length === 0 && <Panel title="All clear" icon={<Sparkles className="size-4" />}><p className="text-[11px] text-muted-foreground py-3">No open recommendations. The platform is monitoring in real time.</p></Panel>}
        </div>
      )}

      {tab === "assistants" && (
        <div id="assistants" className="grid lg:grid-cols-2 gap-5">
          {assistants.map((a) => {
            const Icon = SYS_ICON[a.system];
            return (
              <Panel key={a.system} title={a.label} icon={<Icon className="size-4" />} actions={<span className="text-[10px] font-mono text-muted-foreground">{a.recs.length}</span>}>
                {a.recs.length ? (
                  <ul className="space-y-2">{a.recs.slice(0, 6).map((r) => <RecCard key={r.key} rec={r} onAct={act} busy={busy} />)}</ul>
                ) : <p className="text-[11px] text-muted-foreground py-3">No active signals. Monitoring in real time.</p>}
              </Panel>
            );
          })}
        </div>
      )}

      {tab === "briefing" && (
        <div className="grid lg:grid-cols-2 gap-5">
          <Panel id="briefing" title="Executive Daily Briefing" icon={<FileText className="size-4" />} actions={briefing && <span className="text-[10px] font-mono text-muted-foreground">{briefing.date}</span>}>
            {briefing ? (
              <div className="space-y-3 text-xs">
                <BriefBlock label="What happened" items={briefing.whatHappened} />
                <BriefBlock label="What changed" items={briefing.whatChanged} />
                <BriefBlock label="Biggest risks" items={briefing.biggestRisks} tone="rose" />
                <BriefBlock label="Biggest opportunities" items={briefing.biggestOpportunities} tone="emerald" />
                <BriefBlock label="Recommended actions" items={briefing.recommendedActions} tone="accent" />
                <BriefBlock label="Expected outcomes" items={briefing.expectedOutcomes} />
              </div>
            ) : <p className="text-[11px] text-muted-foreground py-3">No data yet.</p>}
          </Panel>
          <Panel id="weekly" title="Executive Weekly Report" icon={<Activity className="size-4" />}>
            {weekly ? (
              <div className="space-y-3 text-xs">
                <BriefBlock label="Growth summary" items={[weekly.growth]} />
                <BriefBlock label="Profit summary" items={[weekly.profit]} />
                <BriefBlock label="Customer summary" items={[weekly.customer]} />
                <BriefBlock label="Inventory summary" items={[weekly.inventory]} />
                <BriefBlock label="Marketing summary" items={[weekly.marketing]} />
                <BriefBlock label="Executive recommendations" items={weekly.recommendations} tone="accent" />
              </div>
            ) : <p className="text-[11px] text-muted-foreground py-3">No data yet.</p>}
          </Panel>
        </div>
      )}
    </div>
  );
}

function BriefBlock({ label, items, tone }: { label: string; items: string[]; tone?: "rose" | "emerald" | "accent" }) {
  const toneCls = tone === "rose" ? "text-rose-300" : tone === "emerald" ? "text-emerald-300" : tone === "accent" ? "text-accent" : "text-foreground/90";
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <ul className="space-y-1">
        {items.map((it, i) => <li key={i} className={cn("leading-snug", toneCls)}>• {it}</li>)}
      </ul>
    </div>
  );
}
