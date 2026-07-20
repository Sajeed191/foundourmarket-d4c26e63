import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Zap, Heart, Star, Truck, Timer } from "lucide-react";

import { Price } from "@/components/site/Price";
import { InlineActiveToggle } from "@/components/admin/InlineActiveToggle";
import { trackFlashDealEvent } from "@/lib/flash-deal-analytics";
import { useProductAdminEditing } from "@/lib/admin-overlay";
import { useRegion } from "@/lib/region";
import { useWishlistActions, useWishlistSaved } from "@/lib/wishlist";
import { useFlashDeals, type FlashItem } from "@/lib/use-flash-deals";
import { useHomepageSections, toggleHomepageSection } from "@/lib/use-homepage-sections";
import type { Product } from "@/lib/products";
import { ProductImage } from "@/components/site/ProductImage";

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

/** Premium inline countdown — "02:13:48 Remaining". Days shown only when needed. */
function InlineCountdown({ end, now }: { end: string; now: number }) {
  const diff = Math.max(0, new Date(end).getTime() - now);
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  const label = d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
  return (
    <span className="font-mono tabular-nums tracking-wider text-accent">{label}</span>
  );
}

/** Deterministic stock-intelligence copy — no random values, based only on quantity. */
function stockMessage(qty: number): string | null {
  if (qty <= 0) return null;
  if (qty <= 2) return "Almost Gone";
  if (qty <= 5) return "Last Few Units";
  if (qty <= 10) return `Only ${qty} Remaining`;
  if (qty <= 20) return "Selling Fast";
  return null;
}

function FlashCard({ item, now }: { item: FlashItem; now: number }) {
  const p = item.product;
  const { priceOf } = useRegion();
  const saved = useWishlistSaved(p.slug);
  const { toggle } = useWishlistActions();

  const regularPrice = priceOf(p);
  const hasFlash = item.flashPrice != null && item.flashPrice > 0;
  const displayPrice = hasFlash ? (item.flashPrice as number) : regularPrice;
  const off = hasFlash && regularPrice > 0
    ? Math.round(((regularPrice - (item.flashPrice as number)) / regularPrice) * 100)
    : 0;
  const stockMsg = stockMessage(p.stockQuantity);

  const onWishlist = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    void toggle(p.slug);
  }, [toggle, p.slug]);

  return (
    <Link
      to="/products/$slug"
      params={{ slug: p.slug }}
      data-product-card
      data-android-static-card
      onClick={() => trackFlashDealEvent("click", item.dealId, p.slug)}
      style={{
        background: "linear-gradient(180deg, #141416 0%, #101012 100%)",
        border: "1px solid rgba(255,255,255,0.06)",
        boxShadow: "0 10px 30px -14px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
      className="group flex h-full flex-col overflow-hidden rounded-[22px] transition-[transform,box-shadow,border-color] duration-200 will-change-transform motion-safe:lg:hover:-translate-y-0.5 lg:hover:border-accent/40 lg:hover:shadow-[0_18px_40px_-14px_rgba(255,138,0,0.35)]"
    >
      {/* Image occupies ~70% of card height via tall aspect ratio */}
      <div data-product-media className="relative aspect-[4/5] overflow-hidden bg-gradient-to-b from-white/[0.03] to-black/40">
        {p.image && (
          <ProductImage
            src={p.image}
            alt={p.name}
            className="h-full w-full object-cover transition-transform duration-500 motion-safe:lg:group-hover:scale-[1.03]"
          />
        )}

        {/* FLASH DEAL premium capsule */}
        <span
          data-product-badge
          className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase leading-none tracking-[0.12em] text-black shadow-[0_4px_14px_-2px_rgba(255,122,0,0.55)]"
          style={{ background: "linear-gradient(135deg, #FFB347 0%, #FF6A00 100%)" }}
        >
          Flash Deal
        </span>

        {/* Discount percent — subtle, top-right corner of image */}
        {off > 0 && (
          <span
            data-product-badge
            className="absolute right-2.5 top-2.5 rounded-full bg-black/70 px-2 py-1 font-mono text-[10px] font-bold text-accent ring-1 ring-accent/30"
          >
            −{off}%
          </span>
        )}

        {/* Wishlist — floating glass */}
        <button
          onClick={onWishlist}
          aria-label={saved ? `Remove ${p.name} from wishlist` : `Add ${p.name} to wishlist`}
          className="deal-icon-glass absolute bottom-2.5 right-2.5 grid h-9 w-9 place-items-center rounded-full text-white/90 transition-colors hover:text-accent"
          style={{ backgroundColor: "rgba(20,20,20,0.65)", border: "1px solid rgba(255,255,255,0.14)" }}
        >
          <Heart className={`size-4 ${saved ? "fill-accent text-accent" : ""}`} />
        </button>
      </div>

      {/* Card body */}
      <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-3.5">
        <p
          data-product-text
          className="product-typography product-title-text text-[12.5px] sm:text-[13.5px] font-medium leading-snug text-white/95"
          style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: "2.4em" }}
        >
          {p.name}
        </p>

        {/* Rating — compact */}
        {p.rating > 0 && (
          <div className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
            <Star className="size-3 fill-accent text-accent" strokeWidth={0} />
            <span className="font-semibold text-white/90 tabular-nums">{p.rating.toFixed(1)}</span>
            {p.reviews > 0 && <span className="tabular-nums">({p.reviews.toLocaleString()})</span>}
          </div>
        )}

        {/* Price row */}
        <div className="flex items-baseline gap-2 flex-wrap pt-0.5">
          <Price value={displayPrice} className="text-[15px] sm:text-base font-display font-bold text-accent tabular-nums" />
          {hasFlash && (
            <Price value={regularPrice} variant="compare" className="text-[11px] text-muted-foreground line-through" />
          )}
          {off > 0 && (
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-accent/90">
              {off}% off
            </span>
          )}
        </div>

        {/* Meta row — stock + delivery */}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1.5 text-[10px]">
          <span className="font-mono uppercase tracking-wider text-accent/90" style={{ minHeight: "1.1em" }}>
            {stockMsg ?? ""}
          </span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Truck className="size-3" />
            Free
          </span>
        </div>

        {/* Countdown foot — only if a live deal window applies */}
        {item.endAt && (
          <div className="mt-1.5 flex items-center gap-1.5 border-t border-white/[0.06] pt-1.5 text-[10px] text-muted-foreground">
            <Timer className="size-3 text-accent/90" />
            <InlineCountdown end={item.endAt} now={now} />
            <span className="uppercase tracking-wider">Left</span>
          </div>
        )}
      </div>
    </Link>
  );
}

function FallbackNotice() {
  return (
    <section className="px-4 sm:px-6 py-8 sm:py-10 max-w-7xl mx-auto">
      <div
        className="relative overflow-hidden rounded-[22px] px-6 py-10 text-center"
        style={{
          background: "linear-gradient(160deg, #0b0b0d 0%, #141416 55%, #1a1a1d 100%)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 h-48 w-2/3 rounded-full blur-3xl opacity-30"
          style={{ background: "var(--gradient-ember)" }}
        />
        <div className="relative flex flex-col items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-accent/15 text-accent ring-1 ring-accent/25">
            <Zap className="size-5" strokeWidth={2} />
          </div>
          <h3 className="text-base sm:text-lg font-display font-semibold">New Flash Deals Arriving Soon</h3>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-sm">
            Limited-time exclusive offers refresh throughout the day.
          </p>
          <Link
            to="/search"
            className="mt-1 inline-flex items-center gap-2 rounded-full border border-accent/40 text-accent px-5 py-2.5 text-xs font-mono uppercase tracking-widest hover:bg-accent/10 transition"
          >
            Browse Catalog <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

export function FlashDeals() {
  const { items: allItems, loading, now, products } = useFlashDeals();
  const { sections } = useHomepageSections();
  const { canEdit: isAdmin } = useProductAdminEditing();

  const sectionActive = sections.flash_deals?.active ?? true;

  // Homepage shows only the first 4 active flash deals per the shared hook's rotation.
  const items = useMemo(() => allItems.slice(0, 4), [allItems]);

  // Countdown source: the soonest-ending live deal window in the visible set.
  const soonestEndAt = useMemo(() => {
    const ends = items.map((i) => i.endAt).filter((x): x is string => !!x);
    if (ends.length === 0) return null;
    return ends.reduce((a, b) => (new Date(a).getTime() < new Date(b).getTime() ? a : b));
  }, [items]);

  useEffect(() => {
    if (!sectionActive) return;
    items.forEach((i) => trackFlashDealEvent("impression", i.dealId, i.product.slug));
  }, [items, sectionActive]);

  if (!sectionActive && !isAdmin) return null;
  if (loading && products.length === 0) return null;

  if (!sectionActive && isAdmin) {
    return (
      <section className="px-4 sm:px-6 py-4 max-w-7xl mx-auto">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-border bg-card/50 px-4 py-3">
          <span className="text-xs text-muted-foreground">
            Flash Deals section is hidden from the homepage.
          </span>
          <InlineActiveToggle
            active={false}
            label="Flash Deals section"
            size="sm"
            onToggle={(next) => toggleHomepageSection("flash_deals", next)}
          />
        </div>
      </section>
    );
  }

  if (items.length === 0) return <FallbackNotice />;

  return (
    <section className="px-4 sm:px-6 py-8 sm:py-12 max-w-7xl mx-auto">
      <div
        className="relative overflow-hidden rounded-[24px] p-5 sm:p-8 lg:p-10 motion-safe:animate-fade-in"
        style={{
          background: "linear-gradient(160deg, #0a0a0c 0%, #131316 55%, #1a1a1d 100%)",
          border: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "0 30px 80px -30px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.03)",
        }}
      >
        {/* Subtle orange ambient glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 h-64 w-[70%] rounded-full blur-3xl opacity-25"
          style={{ background: "var(--gradient-ember)" }}
        />

        {/* Header — premium unified section heading */}
        <PremiumSectionHeading
          icon={Zap}
          title="Flash Deals"
          subtitle="Limited-time offers. Don't miss today's biggest savings."
          live
          liveLabel="Live"
          right={
            <div className="flex items-center gap-2">
              {soonestEndAt && (
                <div
                  className="hidden sm:flex items-center gap-2 rounded-full px-3 py-2 text-[11px]"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,138,0,0.22)",
                  }}
                >
                  <Timer className="size-3.5 text-accent" strokeWidth={2} />
                  <InlineCountdown end={soonestEndAt} now={now} />
                  <span className="text-muted-foreground uppercase tracking-wider text-[10px]">
                    Remaining
                  </span>
                </div>
              )}
              {isAdmin && (
                <InlineActiveToggle
                  active={sectionActive}
                  label="Flash Deals section"
                  size="sm"
                  onToggle={(next) => toggleHomepageSection("flash_deals", next)}
                />
              )}
            </div>
          }
        />


        {/* Mobile-only compact countdown chip */}
        {soonestEndAt && (
          <div className="relative -mt-3 mb-5 sm:hidden">
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10.5px]"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,138,0,0.22)",
              }}
            >
              <Timer className="size-3 text-accent" strokeWidth={2} />
              <InlineCountdown end={soonestEndAt} now={now} />
              <span className="text-muted-foreground uppercase tracking-wider text-[9.5px]">
                Remaining
              </span>
            </div>
          </div>
        )}

        {/* Grid: 2 mobile, 3 tablet, 4 desktop */}
        <div
          data-product-grid
          className="relative grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5"
        >
          {items.map((i) => (
            <FlashCard key={i.product.id ?? i.product.slug} item={i} now={now} />
          ))}
        </div>

        {/* View All — premium outline pill */}
        <div className="relative mt-7 sm:mt-9 flex justify-center">
          <Link
            to="/deals"
            className="group inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/[0.04] px-7 py-3.5 text-[12px] font-mono font-semibold uppercase tracking-[0.18em] text-accent transition-[background-color,border-color,box-shadow] duration-200 hover:bg-accent/10 hover:border-accent/60 hover:shadow-[0_10px_30px_-12px_rgba(255,138,0,0.5)]"
          >
            View All Flash Deals
            <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}
