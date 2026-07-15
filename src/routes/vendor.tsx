/**
 * Vendor Dashboard — Track A, Phase 1.
 *
 * Presentation-only surface over the FROZEN Platform v1.0 contracts:
 *   - VendorIntelligence  (score, tier, averages)
 *   - Recommendation      (top blocker → one action)
 *   - MarketplaceHealthListing  (recent products)
 *
 * Scoped to a single vendor. Introduces NO new intelligence, no new
 * scoring, no forked publish engine. Vendor selection is stored in
 * localStorage as a stand-in for a real vendor auth session.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Store, Sparkles, ArrowRight, Package, Loader2,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { cn } from "@/lib/utils";
import { useMarketplaceHealth } from "@/lib/use-marketplace-health";
import { VENDOR_HEALTH_LABEL } from "@/lib/marketplace-intelligence";
import type { Recommendation } from "@/lib/catalog-intelligence";

export const Route = createFileRoute("/vendor")({
  head: () => ({
    meta: [
      { title: "Vendor Dashboard — FoundOurMarket™" },
      {
        name: "description",
        content: "Your store at a glance — one recommendation, one action.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: VendorDashboard,
});

const VENDOR_KEY = "fom.vendor-portal.current.v1";

function loadVendor(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(VENDOR_KEY);
  } catch {
    return null;
  }
}
function saveVendor(id: string) {
  try {
    window.localStorage.setItem(VENDOR_KEY, id);
  } catch {
    /* ignore */
  }
}

function tierTint(tier: string): string {
  if (tier === "trusted") return "text-emerald-400";
  if (tier === "reliable") return "text-sky-400";
  if (tier === "watch") return "text-amber-400";
  return "text-rose-400";
}

function statusEmoji(score: number): string {
  if (score >= 85) return "🟢";
  if (score >= 70) return "🔵";
  if (score >= 50) return "🟡";
  return "🔴";
}

function scoreTint(score: number): string {
  if (score >= 85) return "text-emerald-400";
  if (score >= 70) return "text-sky-400";
  if (score >= 50) return "text-amber-400";
  return "text-rose-400";
}


function VendorDashboard() {
  const bundle = useMarketplaceHealth();
  const [vendorId, setVendorId] = useState<string | null>(loadVendor);

  // Default to the first vendor once data arrives.
  useEffect(() => {
    if (!vendorId && bundle.vendors.length > 0) {
      const first = bundle.vendors[0]!.vendorId;
      setVendorId(first);
      saveVendor(first);
    }
  }, [bundle.vendors, vendorId]);

  const vendor = useMemo(
    () => bundle.vendors.find((v) => v.vendorId === vendorId) ?? null,
    [bundle.vendors, vendorId],
  );

  const vendorListings = useMemo(
    () => (vendor ? bundle.listings.filter((l) => (l.vendorName ?? "").toLowerCase() === vendor.vendorName.toLowerCase()) : []),
    [bundle.listings, vendor],
  );

  // "Today's recommendation" = the single top blocker for this vendor.
  const topRecommendation: Recommendation | null = vendor?.topBlockers[0] ?? null;

  return (
    <AdminShell title="Vendor Portal">
      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        {/* Vendor picker (stand-in for real auth session) */}
        <div className="flex items-center gap-2 rounded-xl border bg-card/50 p-3 text-sm">
          <Store className="h-4 w-4 text-muted-foreground" />
          <label htmlFor="vendor" className="text-muted-foreground">Store</label>
          <select
            id="vendor"
            className="ml-1 flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
            value={vendorId ?? ""}
            onChange={(e) => {
              setVendorId(e.target.value);
              saveVendor(e.target.value);
            }}
            disabled={bundle.loading || bundle.vendors.length === 0}
          >
            {bundle.vendors.length === 0 && <option value="">No stores yet</option>}
            {bundle.vendors.map((v) => (
              <option key={v.vendorId} value={v.vendorId}>{v.vendorName}</option>
            ))}
          </select>
          <Link
            to="/vendor-work-queue"
            className="rounded-md border bg-background px-2 py-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Queue
          </Link>
          <Link
            to="/vendor-analytics"
            className="rounded-md border bg-background px-2 py-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Analytics
          </Link>
        </div>

        {bundle.loading && (
          <div className="flex items-center justify-center rounded-xl border bg-card/40 py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!bundle.loading && !vendor && (
          <div className="rounded-xl border bg-card/40 p-6 text-center text-sm text-muted-foreground">
            No store data available yet. Once your listings are indexed, your dashboard will appear here.
          </div>
        )}

        {vendor && (
          <>
            {/* Your Store — health */}
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border bg-gradient-to-br from-card via-card/80 to-card/40 p-5"
            >
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <Store className="h-3.5 w-3.5" /> Your Store
              </div>
              <div className="mt-1 flex items-baseline gap-3">
                <h1 className="text-xl font-semibold tracking-tight">{vendor.vendorName}</h1>
                <span className={cn("text-xs font-medium", tierTint(vendor.tier))}>
                  {VENDOR_HEALTH_LABEL[vendor.tier]}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border bg-background/40 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Health</div>
                  <div className={cn("mt-0.5 text-2xl font-semibold", scoreTint(vendor.score))}>
                    {vendor.score}
                    <span className="text-sm font-normal text-muted-foreground"> / 100</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{statusEmoji(vendor.score)} {VENDOR_HEALTH_LABEL[vendor.tier]}</div>
                </div>
                <div className="rounded-xl border bg-background/40 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Readiness (avg)</div>
                  <div className={cn("mt-0.5 text-2xl font-semibold", scoreTint(vendor.averages.readiness))}>
                    {vendor.averages.readiness}
                  </div>
                  <div className="text-[11px] text-muted-foreground">across {vendor.listingCount} listing{vendor.listingCount === 1 ? "" : "s"}</div>
                </div>
                <div className="col-span-2 rounded-xl border bg-background/40 p-3 sm:col-span-1">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Ready to Publish</div>
                  <div className="mt-0.5 text-2xl font-semibold text-emerald-400">
                    {vendor.distribution.ready ?? 0}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {vendor.distribution.almost_ready ?? 0} almost · {(vendor.distribution.needs_attention ?? 0) + (vendor.distribution.not_ready ?? 0)} needs work
                  </div>
                </div>
              </div>
            </motion.section>

            {/* Today's Recommendation — one message, one action */}
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="rounded-2xl border border-primary/30 bg-primary/5 p-5"
            >
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary/80">
                <Sparkles className="h-3.5 w-3.5" /> Today's Recommendation
              </div>
              {topRecommendation ? (
                <>
                  <p className="mt-2 text-base font-medium leading-snug">
                    {topRecommendation.recommendation}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>Impact <strong className="text-foreground">{topRecommendation.impact}</strong></span>
                    <span>Confidence <strong className="text-foreground">{topRecommendation.confidence}%</strong></span>
                    <span className="text-muted-foreground/70">via {topRecommendation.module}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Link
                      to="/vendor-work-queue"
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                    >
                      Start My Queue
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                    <span className="text-[11px] text-muted-foreground">
                      Next action: {topRecommendation.action}
                    </span>
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Your store is in good shape — no priority action right now. 🎉
                </p>
              )}
            </motion.section>

            {/* Recent activity — your listings */}
            <section className="rounded-2xl border bg-card/40">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Package className="h-4 w-4 text-muted-foreground" /> Your Recent Listings
                </div>
                <span className="text-xs text-muted-foreground">{vendorListings.length} shown</span>
              </div>
              {vendorListings.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No listings for this store yet.
                </div>
              ) : (
                <ul className="divide-y">
                  {vendorListings.slice(0, 10).map((l) => (
                    <li key={l.productId} className="flex items-center gap-2 px-4 py-2.5 transition-colors hover:bg-white/[0.03]">
                      <Link
                        to="/vendor-product/$slug"
                        params={{ slug: l.productSlug }}
                        className="flex min-w-0 flex-1 items-center gap-3"
                      >
                        <div className="h-8 w-8 shrink-0 overflow-hidden rounded-md bg-muted">
                          {l.productImage ? (
                            <img src={l.productImage} alt="" className="h-full w-full object-cover" loading="lazy" />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">{l.productName}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {l.categoryName ?? "Uncategorised"}
                          </div>
                        </div>
                        <div className={cn("text-xs font-semibold tabular-nums", scoreTint(l.readiness.score))}>
                          {statusEmoji(l.readiness.score)} {l.readiness.score}
                        </div>
                      </Link>
                      <Link
                        to="/vendor-publish/$slug"
                        params={{ slug: l.productSlug }}
                        className="shrink-0 rounded-md border bg-background px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
                        title="Publish Assistant"
                      >
                        Publish
                      </Link>
                    </li>
                  ))}

                </ul>
              )}
            </section>

            <p className="pt-2 text-center text-[11px] text-muted-foreground">
              Powered by FoundOurMarket™ Platform v1.0 · same scoring as Admin, scoped to your store.
            </p>
          </>
        )}
      </div>
    </AdminShell>
  );
}
