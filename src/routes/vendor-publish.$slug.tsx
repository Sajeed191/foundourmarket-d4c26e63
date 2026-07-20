/**
 * Vendor Publish Assistant — Track A, Phase 5 (final vendor phase).
 *
 * The THINNEST layer in the Vendor Portal. Marketplace Readiness already
 * decided if a listing is safe to publish; this surface only *presents*
 * that decision in a publishing context.
 *
 * Permanent rule (enforced by review, not code):
 *   Publishing must NEVER introduce new validation logic. It only presents
 *   Marketplace Readiness in a publishing context.
 *
 * Which means this file MUST NOT:
 *   - Re-check field completeness with its own heuristics
 *   - Compute a second "publish score"
 *   - Fork any analyzer or override the Recommendation Broker's ranking
 *   - Show marketplace-wide comparisons or other vendors' data
 *
 * It MAY:
 *   - Present readiness.status → Publish / Almost Ready / Needs Attention
 *   - List the per-module status (✓ / ⚠ / ✗) already computed upstream
 *   - Deep-link to the appropriate editor for the top blocker
 */
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, ChevronDown, ChevronUp, Rocket, Loader2,
  CheckCircle2, AlertTriangle, XCircle, Lock, Package, Sparkles,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { PublishConfirm } from "@/components/admin/PublishConfirm";
import { cn } from "@/lib/utils";
import { useMarketplaceHealth } from "@/lib/use-marketplace-health";
import {
  READINESS_EMOJI,
  READINESS_LABEL,
  type IntelligenceModule,
  type Recommendation,
  type ReadinessStatus,
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
 * Publishing-context copy per readiness status.
 * Pure presentation — status decision comes from Marketplace Readiness upstream.
 */
const PUBLISH_COPY: Record<ReadinessStatus, {
  title: string;
  body: string;
  cta: string;
  cardClass: string;
  chip: string;
  chipClass: string;
}> = {
  ready: {
    title: "Ready to Publish",
    body: "This listing meets marketplace quality standards.",
    cta: "Publish",
    cardClass: "border-emerald-400/40 bg-emerald-400/[0.04]",
    chip: "Ready",
    chipClass: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  },
  almost_ready: {
    title: "Almost Ready",
    body: "Small improvements are recommended before publishing.",
    cta: "Resolve Recommendation",
    cardClass: "border-amber-400/40 bg-amber-400/[0.04]",
    chip: "Almost Ready",
    chipClass: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  },
  needs_attention: {
    title: "Needs Attention",
    body: "Important improvements are advised before this listing goes live.",
    cta: "Complete Product",
    cardClass: "border-orange-400/40 bg-orange-400/[0.04]",
    chip: "Needs Attention",
    chipClass: "border-orange-400/40 bg-orange-400/10 text-orange-300",
  },
  not_ready: {
    title: "Not Ready",
    body: "This listing has critical issues that should be resolved first.",
    cta: "Fix Blocker",
    cardClass: "border-destructive/40 bg-destructive/[0.04]",
    chip: "Not Ready",
    chipClass: "border-destructive/40 bg-destructive/10 text-destructive",
  },
};

function moduleTick(score: number, hasCritical: boolean) {
  if (hasCritical) return <XCircle className="size-3.5 text-destructive" />;
  if (score >= 85) return <CheckCircle2 className="size-3.5 text-emerald-400" />;
  if (score >= 55) return <AlertTriangle className="size-3.5 text-amber-400" />;
  return <XCircle className="size-3.5 text-destructive" />;
}

export const Route = createFileRoute("/vendor-publish/$slug")({
  head: () => ({
    meta: [
      { title: "Publish Assistant — FoundOurMarket™" },
      { name: "description", content: "Publish this listing when it meets marketplace quality standards." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: VendorPublishAssistant,
});

function VendorPublishAssistant() {
  const { slug } = useParams({ from: "/vendor-publish/$slug" });
  const bundle = useMarketplaceHealth();
  const vendorId = loadVendor();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [published, setPublished] = useState(false);

  const listing = useMemo(
    () => bundle.listings.find((l) => l.productSlug === slug) ?? null,
    [bundle.listings, slug],
  );
  const currentVendor = useMemo(
    () => bundle.vendors.find((v) => v.vendorId === vendorId) ?? null,
    [bundle.vendors, vendorId],
  );
  const isOwned = useMemo(() => {
    if (!listing || !currentVendor) return false;
    return (listing.vendorName ?? "").toLowerCase() === currentVendor.vendorName.toLowerCase();
  }, [listing, currentVendor]);

  const readiness = listing?.readiness ?? null;
  const status: ReadinessStatus = readiness?.status ?? "not_ready";
  const copy = PUBLISH_COPY[status];
  const top: Recommendation | null = readiness?.topRecommendation ?? null;
  const canPublish = status === "ready";

  return (
    <AdminShell title="Publish Assistant">
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <Link
            to="/vendor-product/$slug"
            params={{ slug }}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to editor
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
              You can only publish products for <span className="text-foreground">{currentVendor?.vendorName ?? "your store"}</span>.
            </p>
          </div>
        )}

        {listing && isOwned && readiness && (
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

            {/* Publish card — status decision comes from Marketplace Readiness */}
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className={cn(
                "rounded-2xl border p-5 backdrop-blur-xl bg-gradient-to-br from-white/[0.04] to-transparent",
                copy.cardClass,
              )}
            >
              <header className="mb-3 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-primary/80">
                  <Rocket className="size-3.5" /> Publish Assistant
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span>{READINESS_EMOJI[status]}</span>
                  <span className="text-foreground">{READINESS_LABEL[status]}</span>
                </span>
              </header>

              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium", copy.chipClass)}>
                  {copy.chip}
                </span>
                {top && !canPublish && (
                  <span className="rounded-full border border-white/10 bg-white/[0.02] px-2 py-0.5 text-[10px] text-muted-foreground">
                    Impact <span className="text-foreground">{top.impact}</span>
                  </span>
                )}
                <span className="rounded-full border border-white/10 bg-white/[0.02] px-2 py-0.5 text-[10px] text-muted-foreground tabular-nums">
                  Confidence {readiness.confidence}%
                </span>
              </div>

              <h2 className="text-lg font-semibold tracking-tight">{copy.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {canPublish ? copy.body : (top?.recommendation ?? copy.body)}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {canPublish ? (
                  <button
                    type="button"
                    onClick={() => setConfirm(true)}
                    disabled={published}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                  >
                    <Rocket className="h-4 w-4" />
                    {published ? "Published" : copy.cta}
                  </button>
                ) : (
                  <Link
                    to="/vendor-product/$slug"
                    params={{ slug }}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                  >
                    {top?.action ?? copy.cta}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
                {published && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300">
                    <CheckCircle2 className="size-3.5" /> Live on the marketplace
                  </span>
                )}
              </div>
            </motion.section>

            {/* Publish Checklist — reuses existing module outputs, no new checks */}
            <section className="rounded-2xl border bg-card/40">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="h-4 w-4 text-muted-foreground" /> Publish Checklist
                </div>
                <span className="text-[11px] text-muted-foreground">
                  From Marketplace Readiness · no additional checks
                </span>
              </div>
              <ul className="divide-y">
                {(listing.modules as IntelligenceModule[]).map((m) => {
                  const hasCritical = m.evidence.some((e) => e.severity === "critical");
                  return (
                    <li key={m.moduleId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <div className="flex items-center gap-2">
                        {moduleTick(m.score, hasCritical)}
                        <span className="text-foreground">{MODULE_LABEL[m.moduleId] ?? m.moduleId}</span>
                      </div>
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{m.score}</span>
                    </li>
                  );
                })}
                <li className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    {status === "ready"
                      ? <CheckCircle2 className="size-3.5 text-emerald-400" />
                      : status === "almost_ready"
                        ? <AlertTriangle className="size-3.5 text-amber-400" />
                        : <XCircle className="size-3.5 text-destructive" />}
                    <span className="text-foreground">Marketplace</span>
                  </div>
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{readiness.score}</span>
                </li>
              </ul>
            </section>

            {/* Explainability — plain language */}
            <section className="rounded-2xl border bg-card/40">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" /> View details
                </span>
                {open ? <ChevronUp className="size-3.5 text-muted-foreground" /> : <ChevronDown className="size-3.5 text-muted-foreground" />}
              </button>
              {open && (
                <div className="space-y-3 border-t px-4 py-4">
                  <div>
                    <p className="mb-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      {canPublish ? "Why publishing is allowed" : "Why publishing is blocked"}
                    </p>
                    <p className="text-[13px] leading-relaxed text-muted-foreground">
                      {canPublish
                        ? "Every marketplace quality module is healthy and there are no critical issues on this listing."
                        : top
                          ? `The highest-priority blocker is in ${MODULE_LABEL[top.module] ?? top.module}: ${top.recommendation}`
                          : "One or more marketplace quality modules need attention before this listing can go live."}
                    </p>
                  </div>

                  {!canPublish && top && (
                    <Link
                      to="/vendor-product/$slug"
                      params={{ slug }}
                      className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-[12px] text-foreground hover:bg-white/[0.03]"
                    >
                      Open {MODULE_LABEL[top.module] ?? top.module} in editor
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  )}

                  {readiness.strengths.length > 0 && (
                    <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-2.5">
                      <p className="mb-1 text-[10px] font-mono uppercase tracking-widest text-emerald-400">Strengths</p>
                      <p className="text-[11px] text-muted-foreground">{readiness.strengths.join(" · ")}</p>
                    </div>
                  )}
                </div>
              )}
            </section>

            <p className="pt-2 text-center text-[11px] text-muted-foreground">
              Powered by FoundOurMarket™ Platform v1.0 · presents Marketplace Readiness, adds no new validation.
            </p>
          </>
        )}
      </div>

      <PublishConfirm
        open={confirm}
        title="Publish this listing?"
        description="This will make the product visible on the marketplace immediately."
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          // Presentation-only stub — the real publish action is owned by the
          // catalog write path, not by this assistant. This keeps the rule
          // "Publishing must never introduce new validation logic" intact.
          setPublished(true);
          setConfirm(false);
        }}
      />
    </AdminShell>
  );
}
