/**
 * DailyDigestCard — Marketplace Operations 1.0, Phase 4.
 *
 * "Good morning" card that lives at the top of Admin Home. It reads only
 * public contracts (Smart Queues + Marketplace Health + Recommendation
 * Analytics) and turns the day's #1 priority into one destination.
 *
 * One recommendation. One action. One click.
 */
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Sun, Sparkles, ArrowRight, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSmartQueues } from "@/lib/use-smart-queues";
import { useRecommendationAnalytics } from "@/lib/use-recommendation-analytics";
import { estimateMinutesForItems, EFFORT_LABEL, type QueueId } from "@/lib/marketplace-operations";

const QUEUE_LABEL: Record<QueueId, string> = {
  high_impact: "High Impact",
  seo: "SEO",
  variants: "Variants",
  images: "Images",
  pricing: "Pricing",
  ready_to_publish: "Ready to Publish",
};

const IMPACT_TONE: Record<string, string> = {
  High: "border-destructive/40 bg-destructive/10 text-destructive",
  Medium: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  Low: "border-sky-400/40 bg-sky-400/10 text-sky-300",
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function DailyDigestCard() {
  const { queues, loading } = useSmartQueues();
  const { analytics } = useRecommendationAnalytics();

  if (loading || !queues) {
    return (
      <div className="rounded-2xl border border-border/40 bg-card/40 p-5 flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-accent" /> Preparing your daily digest…
      </div>
    );
  }

  const top = queues.topPriorityItem;
  const focusQueue = top ? queues.queues.find((q) => q.id === top.queueId) : null;
  const focusMinutes = focusQueue ? estimateMinutesForItems(focusQueue.items) : 0;

  if (!top || !focusQueue) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-emerald-400/10 via-transparent to-transparent p-5"
      >
        <div className="flex items-center gap-2 text-emerald-300 text-xs font-mono uppercase tracking-[0.22em]">
          <CheckCircle2 className="size-3.5" /> {greeting()}
        </div>
        <div className="mt-2 text-lg font-display font-semibold">Nothing needs your attention right now.</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {queues.queues.reduce((a, q) => a + q.items.length, 0)} items in queues · {analytics ? `${analytics.resolutionRate7d}% resolved this week` : "healthy"}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="relative overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/15 via-card/50 to-card/20 p-5"
    >
      <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-accent/20 blur-3xl" />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-accent text-[11px] font-mono uppercase tracking-[0.24em]">
            <Sun className="size-3.5" /> {greeting()} · Today's Priority
          </div>
          {analytics && (
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Sparkles className="size-3 text-accent" />
              {analytics.resolutionRate7d}% resolved · 7d
            </div>
          )}
        </div>

        <div className="mt-3">
          <div className="text-lg font-display font-semibold leading-snug">
            {focusQueue.items.length === 1
              ? `Resolve 1 ${QUEUE_LABEL[focusQueue.id].toLowerCase()} issue`
              : `Work through ${focusQueue.items.length} ${QUEUE_LABEL[focusQueue.id].toLowerCase()} issues`}
          </div>
          <div className="mt-1 text-sm text-muted-foreground line-clamp-2">
            Starting with: <span className="text-foreground/90">{top.recommendation?.recommendation ?? top.action}</span> on <span className="text-foreground/90">{top.productName}</span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium", IMPACT_TONE[top.impact])}>
            Impact {top.impact}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-card/60 px-2 py-0.5 text-muted-foreground">
            <Clock className="size-3" /> ≈ {focusMinutes} min
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-card/60 px-2 py-0.5 text-muted-foreground">
            {EFFORT_LABEL[top.effort]} first
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-card/60 px-2 py-0.5 tabular-nums text-muted-foreground">
            conf {top.confidence}
          </span>
        </div>

        <div className="mt-5 flex items-center gap-2">
          <Link
            to="/admin-work-queue"
            search={{ queue: focusQueue.id }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:bg-accent/90 transition shadow-[0_4px_24px_-8px_hsl(var(--accent))]"
          >
            Start Queue <ArrowRight className="size-3.5" />
          </Link>
          <Link
            to="/admin-work-queue"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border/40 bg-card/40 px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border/70 transition"
          >
            All queues
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
