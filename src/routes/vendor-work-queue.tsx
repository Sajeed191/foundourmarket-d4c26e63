/**
 * Vendor Work Queue — Track A, Phase 3.
 *
 * Presentation-only surface over the FROZEN Smart Work Queue engine
 * (Marketplace Operations 1.0). Reuses `useSmartQueues` exactly and
 * simply filters each queue's items to the current vendor's listings.
 *
 * Same queue engine, same priority/effort/impact math, same one-recommendation-
 * one-action row model — only scope, permissions, and labels differ.
 *
 * Per the composition-first + experience-layers rules: NO new queue engine,
 * NO new prioritisation, NO forked scoring.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, ArrowRight, RefreshCw, Sparkles, Package, CheckCircle2, Store,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { cn } from "@/lib/utils";
import { useSmartQueues } from "@/lib/use-smart-queues";
import { useMarketplaceHealth } from "@/lib/use-marketplace-health";
import {
  EFFORT_LABEL,
  estimateMinutesForItems,
  type QueueId,
  type QueueItem,
} from "@/lib/marketplace-operations";

const VALID_QUEUES: QueueId[] = [
  "high_impact", "seo", "variants", "images", "pricing", "ready_to_publish",
];

const VENDOR_KEY = "fom.vendor-portal.current.v1";
function loadVendor(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(VENDOR_KEY); } catch { return null; }
}

const IMPACT_TONE: Record<QueueItem["impact"], string> = {
  High: "border-destructive/40 bg-destructive/10 text-destructive",
  Medium: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  Low: "border-sky-400/40 bg-sky-400/10 text-sky-300",
};

const EFFORT_TONE: Record<QueueItem["effort"], string> = {
  small: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  medium: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  large: "border-destructive/30 bg-destructive/10 text-destructive",
};

export const Route = createFileRoute("/vendor-work-queue")({
  head: () => ({
    meta: [
      { title: "My Work Queue — FoundOurMarket™" },
      {
        name: "description",
        content:
          "Your prioritised listing improvements — one recommendation, one action per row.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { queue?: QueueId } => {
    const q = search.queue;
    return typeof q === "string" && (VALID_QUEUES as readonly string[]).includes(q)
      ? { queue: q as QueueId }
      : {};
  },
  component: VendorWorkQueue,
});

function VendorWorkQueue() {
  const { queues, loading } = useSmartQueues();
  const bundle = useMarketplaceHealth();
  const search = Route.useSearch();
  const nav = useNavigate({ from: "/vendor-work-queue" });
  const activeQueueId: QueueId = search.queue ?? "high_impact";
  const [showAll, setShowAll] = useState(false);

  const vendorId = loadVendor();
  const currentVendor = useMemo(
    () => bundle.vendors.find((v) => v.vendorId === vendorId) ?? null,
    [bundle.vendors, vendorId],
  );
  const vendorNameLc = (currentVendor?.vendorName ?? "").toLowerCase();

  // Filter every queue's items to this vendor — same engine, scoped view.
  const scopedQueues = useMemo(() => {
    if (!queues) return null;
    return queues.queues.map((q) => ({
      ...q,
      label: `My ${q.label}`,
      items: vendorNameLc
        ? q.items.filter((i) => (i.vendorName ?? "").toLowerCase() === vendorNameLc)
        : [],
    }));
  }, [queues, vendorNameLc]);

  const activeQueue = useMemo(
    () => scopedQueues?.find((q) => q.id === activeQueueId) ?? null,
    [scopedQueues, activeQueueId],
  );

  const items = activeQueue
    ? (showAll ? activeQueue.items : activeQueue.items.slice(0, 25))
    : [];
  const minutes = activeQueue ? estimateMinutesForItems(activeQueue.items) : 0;
  const totalOpen = scopedQueues
    ? scopedQueues.reduce((sum, q) => sum + (q.id === "ready_to_publish" ? 0 : q.items.length), 0)
    : 0;

  return (
    <AdminShell
      title="My Work Queue"
      subtitle="Your prioritised listing improvements — one recommendation, one action"
      actions={
        <Link
          to="/vendor"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/40 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-border/70 transition"
        >
          <ArrowLeft className="size-3.5" /> Dashboard
        </Link>
      }
    >
      {/* Store banner (stand-in for vendor auth) */}
      {currentVendor && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-border/40 bg-card/40 px-3 py-2 text-xs text-muted-foreground">
          <Store className="size-3.5 text-muted-foreground" />
          Store: <span className="text-foreground">{currentVendor.vendorName}</span>
          <span className="ml-auto tabular-nums">
            {totalOpen} open item{totalOpen === 1 ? "" : "s"}
          </span>
        </div>
      )}

      {loading || !scopedQueues ? (
        <div className="rounded-2xl border border-border/40 bg-card/40 p-8 text-center text-sm text-muted-foreground">
          <RefreshCw className="mx-auto mb-3 size-5 animate-spin text-accent" />
          Assembling your prioritised work…
        </div>
      ) : !currentVendor ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-8 text-center text-sm text-muted-foreground">
          Pick a store on the Vendor Dashboard first.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Queue selector */}
          <div className="flex flex-wrap gap-2">
            {scopedQueues.map((q) => {
              const active = q.id === activeQueueId;
              return (
                <button
                  key={q.id}
                  onClick={() => { nav({ search: { queue: q.id } }); setShowAll(false); }}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition",
                    active
                      ? cn(q.tone, "shadow-[0_0_0_1px_currentColor]")
                      : "border-border/40 bg-card/40 text-muted-foreground hover:text-foreground hover:border-border/70",
                  )}
                >
                  <span>{q.emoji}</span>
                  <span>{q.label}</span>
                  <span className="tabular-nums text-[11px] opacity-80">({q.items.length})</span>
                </button>
              );
            })}
          </div>

          {/* Queue header */}
          {activeQueue && (
            <div className="card-premium rounded-2xl p-5 flex flex-wrap items-center gap-4">
              <div className={cn("inline-flex items-center justify-center rounded-xl border px-3 py-2 text-lg", activeQueue.tone)}>
                {activeQueue.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{activeQueue.label}</div>
                <div className="text-xs text-muted-foreground">{activeQueue.description}</div>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                <div><span className="text-foreground tabular-nums font-medium">{activeQueue.items.length}</span> items</div>
                <div><span className="text-foreground tabular-nums font-medium">≈ {minutes}m</span> total effort</div>
              </div>
            </div>
          )}

          {/* Items */}
          {activeQueue && activeQueue.items.length === 0 ? (
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-8 text-center">
              <CheckCircle2 className="mx-auto mb-3 size-6 text-emerald-400" />
              <div className="text-sm font-medium text-emerald-300">Queue clear</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Nothing needs your attention here right now. 🎉
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {items.map((item, idx) => (
                  <motion.div
                    key={item.productId}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25, delay: Math.min(idx * 0.015, 0.2) }}
                    className="group rounded-2xl border border-border/40 bg-card/40 hover:bg-card/60 hover:border-border/70 p-4 transition"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="size-11 shrink-0 overflow-hidden rounded-lg border border-border/40 bg-muted/20 grid place-items-center">
                        {item.productImage ? (
                          <img loading="lazy" decoding="async" src={item.productImage} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Package className="size-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{item.productName}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {item.categoryName ?? "—"}
                          {" · "}Readiness <span className="tabular-nums">{item.readinessScore}</span>
                        </div>
                        {item.recommendation && (
                          <div className="mt-1.5 text-xs text-foreground/90 truncate">
                            {item.recommendation.recommendation}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium", IMPACT_TONE[item.impact])}>
                          {item.impact}
                        </span>
                        <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium", EFFORT_TONE[item.effort])}>
                          {EFFORT_LABEL[item.effort]}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-border/40 bg-card/60 px-2 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                          conf {item.confidence}
                        </span>
                      </div>
                      <Link
                        to="/vendor-product/$slug"
                        params={{ slug: item.productSlug }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20 transition"
                      >
                        {item.action} <ArrowRight className="size-3.5" />
                      </Link>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {activeQueue && activeQueue.items.length > items.length && (
                <button
                  onClick={() => setShowAll(true)}
                  className="w-full rounded-2xl border border-dashed border-border/40 bg-card/20 px-4 py-3 text-xs text-muted-foreground hover:text-foreground hover:border-border/70 transition"
                >
                  Show all {activeQueue.items.length} items
                </button>
              )}
            </div>
          )}

          <div className="rounded-2xl border border-border/30 bg-card/20 p-4 text-[11px] text-muted-foreground leading-relaxed">
            <div className="flex items-center gap-2 text-foreground/80 text-xs font-medium">
              <Sparkles className="size-3.5 text-accent" /> Same engine as Admin, scoped to your store
            </div>
            <p className="mt-2">
              Your queue is filtered from the same frozen Smart Work Queue that admins use.
              Priority, effort, and confidence come from FoundOurMarket™ Platform v1.0 — no
              vendor-specific scoring. When you resolve an item in the product editor, it drops
              off this list automatically.
            </p>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
