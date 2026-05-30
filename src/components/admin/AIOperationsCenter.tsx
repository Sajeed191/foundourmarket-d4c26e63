import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, AlertTriangle, TrendingUp, Zap, Lightbulb, Wallet, Boxes, Users,
  Megaphone, LayoutDashboard, Check, X, Clock, Archive, ArrowUpRight, Loader2,
  Brain, FileText, Activity, ShieldCheck, ThumbsUp, ThumbsDown, Ban, CheckCheck,
  Trophy, TrendingDown,
} from "lucide-react";
import { useAIOperations } from "@/lib/use-ai-operations";
import {
  CATEGORY_META, CATEGORY_ORDER, PRIORITY_META, FEEDBACK_META, groupByCategory,
  assistantGroups, VIEW_TO_ANCHOR,
  type AIRecommendation, type AICategory, type AISystem, type FeedbackVote,
} from "@/lib/ai-operations";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;
const money = (n: number, c = "USD") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: c, maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0);
const timeStamp = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

const CAT_ICON: Record<AICategory, typeof Sparkles> = {
  critical: AlertTriangle, risk: AlertTriangle, profit: TrendingUp,
  growth: Sparkles, efficiency: Zap, recommended: Lightbulb,
};
const SYS_ICON: Record<AISystem, typeof Boxes> = {
  inventory: Boxes, customers: Users, marketing: Megaphone, financial: Wallet,
  storefront: LayoutDashboard, products: Boxes, support: Users, executive: Brain,
};
const FB_ICON: Record<FeedbackVote, typeof ThumbsUp> = {
  helpful: ThumbsUp, not_helpful: ThumbsDown, incorrect: Ban, already_handled: CheckCheck,
};

type Ops = ReturnType<typeof useAIOperations>;

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

function RecCard({ rec, ops, onExecute }: { rec: AIRecommendation; ops: Ops; onExecute: (r: AIRecommendation) => void }) {
  const { act, vote, busy, feedback, myVotes, generatedAt } = ops;
  const isBusy = busy === rec.key;
  const tally = feedback[rec.key];
  const mine = myVotes[rec.key];
  return (
    <li className={cn("rounded-xl border p-3 space-y-2", CATEGORY_META[rec.category].tone)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{rec.title}</p>
          <p className="text-[11px] text-muted-foreground line-clamp-2">{rec.detail}</p>
        </div>
        <span className={cn("shrink-0 text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border", PRIORITY_META[rec.priority].tone)}>{PRIORITY_META[rec.priority].label}</span>
      </div>
      {/* execution-safety evidence: reasoning, confidence, impact, systems, source time */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {rec.impact > 0 && <span className="text-[10px] tabular-nums text-emerald-300">Impact ~{money(rec.impact)}</span>}
        <span className="text-[10px] text-accent">Confidence {rec.confidence}%</span>
        {rec.systems.map((s) => {
          const Icon = SYS_ICON[s];
          return <span key={s} className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-muted-foreground"><Icon className="size-3" />{s}</span>;
        })}
        <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-muted-foreground/70"><Clock className="size-3" />as of {timeStamp(generatedAt)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <ActBtn onClick={() => act(rec, "approved")} busy={isBusy} icon={<Check className="size-3" />} label="Approve" tone="emerald" />
        <ActBtn onClick={() => act(rec, "rejected")} busy={isBusy} icon={<X className="size-3" />} label="Reject" tone="rose" />
        <ActBtn onClick={() => act(rec, "snoozed", { snoozeHours: 24 })} busy={isBusy} icon={<Clock className="size-3" />} label="Snooze" tone="neutral" />
        <ActBtn onClick={() => onExecute(rec)} busy={isBusy} icon={<Zap className="size-3" />} label="Execute" tone="accent" />
        <ActBtn onClick={() => act(rec, "archived")} busy={isBusy} icon={<Archive className="size-3" />} label="Archive" tone="neutral" />
        {rec.to && <Link to={rec.to} className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-full bg-white/[0.04] border border-white/10 hover:border-accent/30 inline-flex items-center gap-1">Open <ArrowUpRight className="size-3" /></Link>}
      </div>
      {/* feedback loop */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/5">
        <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/70 mr-0.5">Feedback</span>
        {(Object.keys(FEEDBACK_META) as FeedbackVote[]).map((v) => {
          const Icon = FB_ICON[v];
          const n = tally?.[v] ?? 0;
          return (
            <button key={v} disabled={isBusy} onClick={() => vote(rec, v)}
              className={cn("text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-full border inline-flex items-center gap-1 disabled:opacity-50 active:scale-95 transition-all",
                mine === v ? FEEDBACK_META[v].tone : "bg-white/[0.03] text-muted-foreground border-white/10")}>
              <Icon className="size-3" />{FEEDBACK_META[v].label}{n > 0 ? ` ${n}` : ""}
            </button>
          );
        })}
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

/* ----------------------------------------------- execution-safety modal */
function ExecuteDialog({ rec, ops, onClose }: { rec: AIRecommendation; ops: Ops; onClose: () => void }) {
  const { act, busy, generatedAt, currency } = ops;
  const confirm = async () => {
    await act(rec, "executed", {
      outcome: "executed",
      revenueImpact: rec.impact,
      successScore: rec.confidence,
    });
    onClose();
  };
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ ease: EASE, duration: 0.3 }}
        className="relative w-full max-w-md rounded-2xl glass glass-reflect p-5 space-y-4"
        style={{ boxShadow: "0 30px 70px -30px oklch(0 0 0 / 0.9)" }}>
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-accent" />
          <h3 className="text-sm font-medium">Confirm AI action</h3>
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{rec.title}</p>
          <p className="text-[12px] text-muted-foreground mt-1">{rec.detail}</p>
        </div>
        <dl className="space-y-2 text-[12px]">
          <Row label="Reasoning"><span className="text-foreground/90">{rec.detail}</span></Row>
          <Row label="Confidence"><span className="text-accent tabular-nums">{rec.confidence}%</span></Row>
          <Row label="Expected impact"><span className="text-emerald-300 tabular-nums">{rec.impact > 0 ? `~${money(rec.impact, currency)}` : "Qualitative"}</span></Row>
          <Row label="Affected systems"><span className="text-foreground/90">{rec.systems.join(", ")}</span></Row>
          <Row label="Source data"><span className="text-muted-foreground tabular-nums">{timeStamp(generatedAt)}</span></Row>
        </dl>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03] text-muted-foreground">Cancel</button>
          <button disabled={busy === rec.key} onClick={confirm}
            className="text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full border border-accent/40 bg-accent/15 text-accent inline-flex items-center gap-1 disabled:opacity-50 active:scale-95">
            {busy === rec.key ? <Loader2 className="size-3 animate-spin" /> : <Zap className="size-3" />} Execute now
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground shrink-0 pt-0.5">{label}</dt>
      <dd className="text-right min-w-0">{children}</dd>
    </div>
  );
}

export function AIOperationsCenter({ focusView }: { focusView?: string }) {
  const ops = useAIOperations();
  const { loading, recs, executed, briefing, weekly, currency } = ops;
  const [tab, setTab] = useState<"actions" | "assistants" | "briefing" | "outcomes">("actions");
  const [confirmRec, setConfirmRec] = useState<AIRecommendation | null>(null);

  // Deep-link: switch tab + auto-scroll + highlight
  useEffect(() => {
    if (loading) return;
    const map = focusView ? VIEW_TO_ANCHOR[focusView] : undefined;
    if (!map) return;
    setTab(map.tab);
    const t = setTimeout(() => {
      const el = document.getElementById(map.anchor);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add("deep-link-flash");
        setTimeout(() => el.classList.remove("deep-link-flash"), 2000);
      }
    }, 120);
    return () => clearTimeout(t);
  }, [focusView, loading]);

  if (loading) return <div className="min-h-[40vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>;

  const groups = groupByCategory(recs);
  const assistants = assistantGroups(recs);
  const counts: { c: AICategory; n: number }[] = CATEGORY_ORDER.map((c) => ({ c, n: groups[c].length }));

  const best = executed.filter((e) => (e.success_score ?? 0) >= 60);
  const failed = executed.filter((e) => e.outcome === "failed" || (e.success_score ?? 100) < 40);

  return (
    <div className="space-y-5">
      {/* summary counters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {counts.map(({ c, n }, i) => {
          const Icon = CAT_ICON[c];
          return (
            <motion.button onClick={() => { setTab("actions"); requestAnimationFrame(() => document.getElementById(`cat-${c}`)?.scrollIntoView({ behavior: "smooth", block: "start" })); }} key={c}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02, ease: EASE }}
              className="rounded-2xl glass p-4 text-left hover:border-accent/30 transition-all">
              <div className="flex items-center gap-2 mb-2"><Icon className="size-4 text-accent" /><span className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground/80 truncate">{CATEGORY_META[c].label}</span></div>
              <p className="text-2xl font-display font-semibold tabular-nums">{n}</p>
            </motion.button>
          );
        })}
      </div>

      {/* Fraud & Security integration */}
      <SecuritySummaryCard />


      {/* tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {([["actions", "Actions"], ["assistants", "Assistants"], ["briefing", "Briefing & Report"], ["outcomes", "Outcomes"]] as const).map(([id, label]) => (
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
                {groups[c].map((r) => <RecCard key={r.key} rec={r} ops={ops} onExecute={setConfirmRec} />)}
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
                  <ul className="space-y-2">{a.recs.slice(0, 6).map((r) => <RecCard key={r.key} rec={r} ops={ops} onExecute={setConfirmRec} />)}</ul>
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

      {tab === "outcomes" && (
        <div id="outcomes" className="space-y-5">
          <Panel title="Executed Recommendations" icon={<CheckCheck className="size-4" />} actions={<span className="text-[10px] font-mono text-muted-foreground">{executed.length}</span>}>
            {executed.length ? (
              <ul className="space-y-2">
                {executed.map((e) => (
                  <li key={e.rec_key} className="rounded-xl border border-white/10 bg-white/[0.02] p-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{e.title ?? e.rec_key}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {e.executed_at ? timeStamp(e.executed_at) : "—"}
                        {typeof e.revenue_impact === "number" ? ` · revenue ${money(e.revenue_impact, currency)}` : ""}
                        {typeof e.profit_impact === "number" ? ` · profit ${money(e.profit_impact, currency)}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] font-mono tabular-nums text-accent">Score {e.success_score ?? "—"}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-[11px] text-muted-foreground py-3">No executed recommendations yet. Outcomes are tracked here after you execute an action.</p>}
          </Panel>
          <div className="grid lg:grid-cols-2 gap-5">
            <Panel title="Best Performing Actions" icon={<Trophy className="size-4" />}>
              {best.length ? (
                <ul className="space-y-1.5">{best.slice(0, 8).map((e) => (
                  <li key={e.rec_key} className="flex items-center justify-between gap-2 text-xs"><span className="text-emerald-300 truncate">{e.title ?? e.rec_key}</span><span className="tabular-nums text-muted-foreground">{e.success_score}</span></li>
                ))}</ul>
              ) : <p className="text-[11px] text-muted-foreground py-3">No high-performing actions recorded yet.</p>}
            </Panel>
            <Panel title="Failed Actions" icon={<TrendingDown className="size-4" />}>
              {failed.length ? (
                <ul className="space-y-1.5">{failed.slice(0, 8).map((e) => (
                  <li key={e.rec_key} className="flex items-center justify-between gap-2 text-xs"><span className="text-rose-300 truncate">{e.title ?? e.rec_key}</span><span className="tabular-nums text-muted-foreground">{e.success_score ?? "—"}</span></li>
                ))}</ul>
              ) : <p className="text-[11px] text-muted-foreground py-3">No failed actions recorded.</p>}
            </Panel>
          </div>
        </div>
      )}

      <AnimatePresence>
        {confirmRec && <ExecuteDialog key="exec" rec={confirmRec} ops={ops} onClose={() => setConfirmRec(null)} />}
      </AnimatePresence>
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
