import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Eye, MousePointerClick, Percent, TrendingUp, Target, Loader2, Globe } from "lucide-react";
import { fetchBlockAnalytics, type BlockStat } from "@/lib/block-analytics";
import type { StorefrontBlock } from "@/lib/use-storefront-blocks";
import { BLOCK_TYPE_META } from "@/lib/use-storefront-blocks";

const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

/** Per-block analytics drawer — views, clicks, CTR, conversion, revenue, region split. */
export function BlockAnalyticsPanel({
  block,
  open,
  onClose,
}: {
  block: StorefrontBlock | null;
  open: boolean;
  onClose: () => void;
}) {
  const [stat, setStat] = useState<BlockStat | null>(null);

  useEffect(() => {
    if (!open || !block) return;
    let alive = true;
    setStat(null);
    fetchBlockAnalytics(block.id, 30).then((s) => { if (alive) setStat(s); });
    return () => { alive = false; };
  }, [open, block?.id]);

  if (typeof document === "undefined" || !block) return null;

  const cards = stat && [
    { icon: Eye, label: "Views", value: stat.views.toLocaleString() },
    { icon: MousePointerClick, label: "Clicks", value: stat.clicks.toLocaleString() },
    { icon: Percent, label: "CTR", value: `${stat.ctr.toFixed(1)}%` },
    { icon: Target, label: "Conv. rate", value: `${stat.conversionRate.toFixed(1)}%` },
    { icon: TrendingUp, label: "Revenue", value: inr(stat.revenue) },
    { icon: Target, label: "Conversions", value: stat.conversions.toLocaleString() },
  ];

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[130] print:hidden">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} />
          <motion.aside
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col border-l border-accent/20 bg-background/95 backdrop-blur-2xl"
          >
            <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3.5">
              <div className="flex-1">
                <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-accent">Block analytics · 30d</p>
                <p className="text-sm font-medium">{block.title || BLOCK_TYPE_META[block.type].label}</p>
              </div>
              <button onClick={onClose} aria-label="Close"
                className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-white/5 hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {!stat ? (
                <div className="grid place-items-center py-16"><Loader2 className="size-5 animate-spin text-accent" /></div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2.5">
                    {cards!.map((c) => (
                      <div key={c.label} className="rounded-2xl border border-border bg-card/70 p-3">
                        <c.icon className="size-4 text-accent" />
                        <p className="mt-1.5 text-lg font-display tabular-nums leading-none">{c.value}</p>
                        <p className="mt-1.5 text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{c.label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-2xl border border-border bg-card/50 p-3">
                    <p className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      <Globe className="size-3" /> Region performance
                    </p>
                    {Object.keys(stat.byRegion).length === 0 ? (
                      <p className="py-4 text-center text-xs text-muted-foreground">No regional data yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {Object.entries(stat.byRegion).map(([region, v]) => (
                          <li key={region} className="flex items-center justify-between text-xs">
                            <span className="capitalize">{region}</span>
                            <span className="font-mono text-muted-foreground">
                              {v.views} views · {v.clicks} clicks
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {stat.views === 0 && (
                    <p className="text-center text-xs text-muted-foreground">
                      Engagement appears here as live visitors view and interact with this block.
                    </p>
                  )}
                </>
              )}
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
