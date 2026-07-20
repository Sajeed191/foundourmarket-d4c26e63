/**
 * Vendor Product Editor — Track A, Phase 2.
 *
 * Presentation-only surface over the FROZEN Platform v1.0 contracts.
 * Reuses the precomputed IntelligenceModule + MarketplaceReadiness that
 * useMarketplaceHealth already produces per listing — no new scoring, no
 * forked analyzers, no marketplace-wide metrics.
 *
 * Vendor scope: the listing must belong to the vendor currently selected
 * in the Vendor Portal (localStorage stand-in for real seller auth).
 * Cross-vendor access is refused with a plain-language message.
 *
 * Contract with the seller (frozen after this ships):
 *   - ONE recommendation, ONE action
 *   - Impact chip + Confidence chip
 *   - "Why this matters" — plain-language business explanation
 *   - "View Details" — progressive disclosure of per-module scores + evidence
 *   - No marketplace-wide scores, no other vendors' data, no queues embedded
 */
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft, Sparkles, ArrowRight, ChevronDown, ChevronUp, Info,
  CheckCircle2, AlertTriangle, XCircle, Loader2, Lock, Package,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { cn } from "@/lib/utils";
import { useMarketplaceHealth } from "@/lib/use-marketplace-health";
import {
  READINESS_EMOJI,
  READINESS_LABEL,
  type IntelligenceModule,
  type Recommendation,
} from "@/lib/catalog-intelligence";

const VENDOR_KEY = "fom.vendor-portal.current.v1";

function loadVendor(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(VENDOR_KEY); } catch { return null; }
}

const MODULE_LABEL: Record<string, string> = {
  product_completeness: "Completeness",
  attribute_intelligence: "Attributes",
  variant_intelligence: "Variants",
  seo_intelligence: "SEO",
  pricing_intelligence: "Pricing",
  image_intelligence: "Images",
};

/**
 * Plain-language "Why this matters" copy per module.
 * Business framing only — never mentions internal scores or algorithms.
 */
const WHY_IT_MATTERS: Record<string, string> = {
  product_completeness:
    "Complete listings appear in more searches and give customers the confidence to buy.",
  attribute_intelligence:
    "Filled-in attributes help customers filter, compare, and choose your product over similar ones.",
  variant_intelligence:
    "Clear sizes, colors, and options let customers pick the right variant without leaving your page.",
  seo_intelligence:
    "Better titles and descriptions bring in shoppers searching for exactly what you sell.",
  pricing_intelligence:
    "Consistent, competitive pricing builds trust and reduces cart abandonment.",
  image_intelligence:
    "High-quality images are the single biggest driver of clicks and conversions.",
};

const IMPACT_STYLE: Record<string, string> = {
  High: "border-destructive/40 bg-destructive/10 text-destructive",
  Medium: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  Low: "border-sky-400/40 bg-sky-400/10 text-sky-300",
};

const STATUS_STYLE: Record<string, string> = {
  ready: "border-emerald-400/40 bg-emerald-400/5",
  almost_ready: "border-amber-400/40 bg-amber-400/5",
  needs_attention: "border-orange-400/40 bg-orange-400/5",
  not_ready: "border-destructive/40 bg-destructive/5",
};

function statusIcon(score: number) {
  if (score >= 85) return <CheckCircle2 className="size-3.5 text-emerald-400" />;
  if (score >= 55) return <AlertTriangle className="size-3.5 text-amber-400" />;
  return <XCircle className="size-3.5 text-destructive" />;
}

export const Route = createFileRoute("/vendor-product/$slug")({
  head: () => ({
    meta: [
      { title: "Vendor Product Editor — FoundOurMarket™" },
      { name: "description", content: "One recommendation, one action for this listing." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: VendorProductEditor,
});

function VendorProductEditor() {
  const { slug } = useParams({ from: "/vendor-product/$slug" });
  const bundle = useMarketplaceHealth();
  const vendorId = loadVendor();
  const [open, setOpen] = useState(false);

  const listing = useMemo(
    () => bundle.listings.find((l) => l.productSlug === slug) ?? null,
    [bundle.listings, slug],
  );

  const currentVendor = useMemo(
    () => bundle.vendors.find((v) => v.vendorId === vendorId) ?? null,
    [bundle.vendors, vendorId],
  );

  // Vendor scope enforcement: listing.vendorName must match current vendor.
  const isOwned = useMemo(() => {
    if (!listing || !currentVendor) return false;
    return (listing.vendorName ?? "").toLowerCase() === currentVendor.vendorName.toLowerCase();
  }, [listing, currentVendor]);

  const top: Recommendation | null = listing?.readiness.topRecommendation ?? null;
  const impactClass = top ? IMPACT_STYLE[top.impact] ?? IMPACT_STYLE.Low : IMPACT_STYLE.Low;
  const statusClass = listing ? STATUS_STYLE[listing.readiness.status] : "";
  const whyItMatters = top ? WHY_IT_MATTERS[top.module] ?? null : null;

  return (
    <AdminShell title="Vendor Product Editor">
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <Link
            to="/vendor"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to your dashboard
          </Link>
          {currentVendor && (
            <span className="text-[11px] text-muted-foreground">
              Store: <span className="text-foreground">{currentVendor.vendorName}</span>
            </span>
          )}
        </div>

        {bundle.loading && (
          <div className="flex items-center justify-center rounded-xl border bg-card/40 py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!bundle.loading && !listing && (
          <div className="rounded-2xl border bg-card/40 p-6 text-center">
            <Package className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-foreground">Listing not found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              We couldn't find <span className="font-mono">{slug}</span> in your marketplace snapshot.
            </p>
          </div>
        )}

        {!bundle.loading && listing && !isOwned && (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-6 text-center">
            <Lock className="mx-auto mb-2 h-6 w-6 text-amber-400" />
            <p className="text-sm text-foreground">This listing belongs to another store</p>
            <p className="mt-1 text-xs text-muted-foreground">
              You can only edit products for <span className="text-foreground">{currentVendor?.vendorName ?? "your store"}</span>.
              Switch stores from the Vendor Dashboard to continue.
            </p>
          </div>
        )}

        {listing && isOwned && (
          <>
            {/* Listing header */}
            <motion.header
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 rounded-2xl border bg-card/50 p-4"
            >
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                {listing.productImage ? (
                  <img decoding="async" src={listing.productImage} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-base font-semibold tracking-tight">{listing.productName}</h1>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {listing.categoryName ?? "Uncategorised"} · <span className="font-mono">{listing.productSlug}</span>
                </p>
              </div>
            </motion.header>

            {/* Marketplace AI — one recommendation, one action */}
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className={cn(
                "rounded-2xl border p-5 backdrop-blur-xl bg-gradient-to-br from-white/[0.04] to-transparent",
                statusClass,
              )}
            >
              <header className="mb-3 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-primary/80">
                  <Sparkles className="size-3.5" /> Marketplace AI · Recommendation
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span>{READINESS_EMOJI[listing.readiness.status]}</span>
                  <span className="text-foreground">{READINESS_LABEL[listing.readiness.status]}</span>
                </span>
              </header>

              {top ? (
                <>
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                        impactClass,
                      )}
                    >
                      {top.impact} Impact
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.02] px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {MODULE_LABEL[top.module] ?? top.module.replace(/_/g, " ")}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/[0.02] px-2 py-0.5 text-[10px] text-muted-foreground tabular-nums">
                      Confidence {top.confidence}%
                    </span>
                  </div>

                  <p className="text-base font-medium leading-snug text-foreground">
                    {top.recommendation}
                  </p>

                  {/* Why this matters — plain-language business framing */}
                  {whyItMatters && (
                    <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                      <p className="mb-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                        Why this matters
                      </p>
                      <p className="text-[13px] leading-relaxed text-muted-foreground">
                        {whyItMatters}
                      </p>
                    </div>
                  )}

                  <div className="mt-4">
                    <Link
                      to="/vendor"
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                    >
                      {top.action}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </>
              ) : (
                <p className="flex items-center gap-2 text-sm text-emerald-300">
                  <CheckCircle2 className="size-4" />
                  This listing looks healthy — no priority recommendation right now.
                </p>
              )}

              {/* Progressive disclosure */}
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="mt-4 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
              >
                {open ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                {open ? "Hide details" : "View details"}
              </button>

              {open && (
                <div className="mt-3 space-y-3">
                  {/* Per-module scores — no marketplace-wide comparisons */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {(listing.modules as IntelligenceModule[]).map((m) => (
                      <div
                        key={m.moduleId}
                        className="flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-2.5"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            {statusIcon(m.score)}
                            <span className="truncate text-[11px] font-medium text-foreground">
                              {MODULE_LABEL[m.moduleId] ?? m.moduleId}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                            {m.recommendation ?? "Healthy"}
                          </p>
                        </div>
                        <span className="font-mono text-sm tabular-nums text-foreground">{m.score}</span>
                      </div>
                    ))}
                  </div>

                  {/* Strengths */}
                  {listing.readiness.strengths.length > 0 && (
                    <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-2.5">
                      <p className="mb-1 text-[10px] font-mono uppercase tracking-widest text-emerald-400">
                        Strengths
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {listing.readiness.strengths.join(" · ")}
                      </p>
                    </div>
                  )}

                  {/* Top evidence — flattened, capped at 5, business severity only */}
                  {(() => {
                    const ev = (listing.modules as IntelligenceModule[])
                      .flatMap((m) =>
                        m.evidence
                          .filter((e) => e.severity !== "info")
                          .map((e) => ({ ...e, moduleId: m.moduleId })),
                      )
                      .sort((a, b) => (b.impact ?? 0) - (a.impact ?? 0))
                      .slice(0, 5);
                    if (!ev.length) return null;
                    return (
                      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
                        <p className="mb-1.5 flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                          <Info className="size-3" /> What we noticed
                        </p>
                        <ul className="space-y-1">
                          {ev.map((e, i) => (
                            <li
                              key={`${e.moduleId}-${e.key}-${i}`}
                              className="flex items-start gap-1.5 text-[11px] text-muted-foreground"
                            >
                              {e.severity === "critical" ? (
                                <XCircle className="mt-0.5 size-3 shrink-0 text-destructive" />
                              ) : (
                                <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-400" />
                              )}
                              <span>
                                <span className="text-foreground">
                                  {MODULE_LABEL[e.moduleId] ?? e.moduleId}:
                                </span>{" "}
                                {e.message}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })()}
                </div>
              )}
            </motion.section>

            <p className="pt-2 text-center text-[11px] text-muted-foreground">
              Powered by FoundOurMarket™ Platform v1.0 · same recommendations as Admin, scoped to your listing.
            </p>
          </>
        )}
      </div>
    </AdminShell>
  );
}
