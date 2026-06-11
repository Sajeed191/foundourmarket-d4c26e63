import { useEffect, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Flame, ArrowRight, Sparkles } from "lucide-react";

import { Price } from "@/components/site/Price";
import { trackFlashDealEvent } from "@/lib/flash-deal-analytics";
import { useRegion } from "@/lib/region";
import { useFlashDeals } from "@/lib/use-flash-deals";
import type { Product } from "@/lib/products";

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function Countdown({ end, now }: { end: string; now: number }) {
  const diff = Math.max(0, new Date(end).getTime() - now);
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  const cells: [string, string][] = [
    [pad(d), "D"],
    [pad(h), "H"],
    [pad(m), "M"],
    [pad(s), "S"],
  ];
  return (
    <div className="flex items-center justify-center gap-0.5 font-mono text-[9px] sm:text-[10px] tabular-nums w-full">
      {cells.map(([v, label], i) => (
        <span key={i} className="flex flex-col items-center min-w-0">
          <span className="px-1 py-0.5 rounded-md bg-black/60 ring-1 ring-accent/30 text-accent leading-none">{v}</span>
          <span className="text-[7px] sm:text-[8px] text-muted-foreground mt-0.5 leading-none">{label}</span>
        </span>
      ))}
    </div>
  );
}

function FallbackSection({ featured }: { featured: Product[] }) {
  const { priceOf } = useRegion();
  return (
    <section className="px-4 sm:px-6 py-8 sm:py-10 max-w-7xl mx-auto">
      <div className="relative rounded-3xl overflow-hidden border border-accent/20 bg-gradient-to-br from-accent/5 via-card to-card p-6 sm:p-8 text-center">
        <div
          aria-hidden
          className="absolute -top-16 -right-16 size-56 rounded-full blur-3xl opacity-30"
          style={{ background: "var(--gradient-ember)" }}
        />
        <div className="relative flex flex-col items-center gap-3">
          <div className="size-11 grid place-items-center rounded-2xl bg-accent/15 text-accent ring-1 ring-accent/30">
            <Sparkles className="size-5" />
          </div>
          <h3 className="text-base sm:text-lg font-display font-semibold">No Flash Deals Available Right Now</h3>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-sm">
            New limited-time prices drop daily. Explore our full collection in the meantime.
          </p>
          <Link
            to="/products"
            className="mt-1 inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground px-5 py-2.5 text-xs font-mono uppercase tracking-widest hover:opacity-90 transition shadow-[var(--shadow-ember)]"
          >
            Explore Products <ArrowRight className="size-3.5" />
          </Link>
        </div>

        {featured.length > 0 && (
          <div className="relative mt-7">
            <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-accent mb-3">Featured Picks</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
              {featured.map((p) => (
                <Link key={p.slug} to="/products/$slug" params={{ slug: p.slug }} className="block group text-left">
                  <div className="relative aspect-[4/5] rounded-2xl overflow-hidden bg-black/40 ring-1 ring-white/10">
                    {p.image && (
                      <img src={p.image} alt={p.name} loading="lazy" className="w-full h-full object-cover group-active:scale-105 transition-transform" />
                    )}
                  </div>
                  <p className="mt-1.5 text-[11px] font-medium truncate">{p.name}</p>
                  <Price value={priceOf(p)} className="text-xs font-display font-semibold text-accent tabular-nums" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function FlashDeals() {
  const { items: allItems, loading, now, products } = useFlashDeals();
  const { priceOf } = useRegion();

  // Homepage shows ONLY the first 4 active flash deals (rotated twice daily by
  // the shared hook). The remaining deals are loaded on the dedicated /deals page.
  const items = useMemo(() => allItems.slice(0, 4), [allItems]);

  // Featured fallback used only when no flash deals exist.
  const featuredFallback = useMemo(
    () =>
      products
        .filter((p) => p.featured && p.status === "published" && p.inStock && p.stockQuantity > 0)
        .slice(0, 5),
    [products],
  );

  // Record one impression per displayed flash item.
  useEffect(() => {
    items.forEach((i) => trackFlashDealEvent("impression", i.dealId, i.product.slug));
  }, [items]);

  // Avoid flashing the empty state before the catalog resolves.
  if (loading && products.length === 0) return null;

  if (items.length === 0) return <FallbackSection featured={featuredFallback} />;

  return (
    <section className="px-4 sm:px-6 py-8 sm:py-10 max-w-7xl mx-auto">
      <div className="relative rounded-3xl overflow-hidden border border-accent/30 bg-gradient-to-br from-accent/10 via-card to-card p-4 sm:p-6">
        <div
          aria-hidden
          className="absolute -top-16 -right-16 size-56 rounded-full blur-3xl opacity-40"
          style={{ background: "var(--gradient-ember)" }}
        />
        <div className="relative flex items-center gap-2 mb-4">
          <div className="animate-flame-pulse size-9 grid place-items-center rounded-xl bg-accent text-accent-foreground shadow-[var(--shadow-ember)] shrink-0">
            <Flame className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-accent">Flash Deals</p>
            <h3 className="text-sm sm:text-base font-display font-semibold truncate">Limited-time prices</h3>
          </div>
        </div>

        {/* 2x2 grid on mobile, 4-up on desktop — exactly 4 featured deals. */}
        <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          {items.map((i) => {
            const p = i.product;
            // Region-resolved regular selling price (INR/USD per market).
            const regularPrice = priceOf(p);
            // Use the flash price ONLY when it's a real value > 0; otherwise fall
            // back to the product's actual selling price. Never render ₹0 here.
            const hasFlash = i.flashPrice != null && i.flashPrice > 0;
            const displayPrice = hasFlash ? (i.flashPrice as number) : regularPrice;
            const off = hasFlash && regularPrice > 0
              ? Math.round(((regularPrice - (i.flashPrice as number)) / regularPrice) * 100)
              : 0;
            const showOnlyLeft = p.stockQuantity > 0 && p.stockQuantity <= 15;
            return (
              <Link
                key={p.slug}
                to="/products/$slug"
                params={{ slug: p.slug }}
                onClick={() => trackFlashDealEvent("click", i.dealId, p.slug)}
                className="flex flex-col group min-w-0"
              >
                <div className="relative aspect-[4/5] rounded-2xl overflow-hidden bg-black/40 ring-1 ring-white/10">
                  {p.image && (
                    <img
                      src={p.image}
                      alt={p.name}
                      loading="lazy"
                      className="w-full h-full object-cover group-active:scale-105 transition-transform"
                    />
                  )}
                  {off > 0 && (
                    <span className="absolute top-1.5 left-1.5 inline-flex items-center rounded-full bg-accent text-black text-[9px] font-bold font-mono px-2 py-0.5 shadow-[var(--shadow-ember)]">
                      -{off}%
                    </span>
                  )}
                  {i.endAt && (
                    <div className="absolute bottom-1.5 left-1.5 right-1.5">
                      <Countdown end={i.endAt} now={now} />
                    </div>
                  )}
                </div>
                <p className="mt-2 text-[11px] font-medium truncate">{p.name}</p>
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <Price value={displayPrice} className="text-xs font-display font-semibold text-accent tabular-nums" />
                  {hasFlash && (
                    <Price value={regularPrice} className="text-[10px] font-mono line-through text-muted-foreground tabular-nums" />
                  )}
                </div>
                {showOnlyLeft && (
                  <p className="text-[9px] font-mono uppercase tracking-wider text-accent/90 mt-auto pt-0.5">
                    Only {p.stockQuantity} left
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
