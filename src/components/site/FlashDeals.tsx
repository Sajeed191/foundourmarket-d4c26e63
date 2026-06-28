import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Flame, ArrowRight, Sparkles, Heart, Eye } from "lucide-react";

import { Price } from "@/components/site/Price";
import { QuickViewDialog } from "@/components/site/QuickViewDialog";
import { InlineActiveToggle } from "@/components/admin/InlineActiveToggle";
import { trackFlashDealEvent } from "@/lib/flash-deal-analytics";
import { useProductAdminEditing } from "@/lib/admin-overlay";
import { useRegion } from "@/lib/region";
import { useWishlistActions, useWishlistSaved } from "@/lib/wishlist";
import { useFlashDeals } from "@/lib/use-flash-deals";
import { useHomepageSections, toggleHomepageSection } from "@/lib/use-homepage-sections";
import type { Product } from "@/lib/products";
import { singleBadge } from "@/lib/badges";

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
          <h3 className="text-base sm:text-lg font-display font-semibold">More deals are on the way.</h3>
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
            <div data-product-grid className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
              {featured.map((p) => (
                <Link key={p.id ?? p.slug} to="/products/$slug" params={{ slug: p.slug }} data-product-card data-android-static-card className="block group text-left">
                  <div data-product-media className="relative aspect-[4/5] rounded-2xl overflow-hidden bg-black/40 ring-1 ring-white/10">
                    {p.image && (
                      <img data-product-image src={p.image} alt={p.name} loading="lazy" decoding="sync" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <p data-product-text className="product-typography product-title-text mt-1.5 text-[11px] font-medium truncate">{p.name}</p>
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

type FlashItem = {
  product: Product;
  dealId: string;
  flashPrice?: number | null;
  endAt?: string | null;
};

function FlashCard({ item, now }: { item: FlashItem; now: number }) {
  const p = item.product;
  const { priceOf } = useRegion();
  const saved = useWishlistSaved(p.slug);
  const { toggle } = useWishlistActions();
  const [quickOpen, setQuickOpen] = useState(false);

  const regularPrice = priceOf(p);
  const hasFlash = item.flashPrice != null && item.flashPrice > 0;
  const displayPrice = hasFlash ? (item.flashPrice as number) : regularPrice;
  const off = hasFlash && regularPrice > 0
    ? Math.round(((regularPrice - (item.flashPrice as number)) / regularPrice) * 100)
    : 0;
  const showOnlyLeft = p.stockQuantity > 0 && p.stockQuantity <= 15;
  const dealBadge = singleBadge(p.flashDeal ? "flash_deal" : "hot_deal");

  const onWishlist = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    void toggle(p.slug);
  }, [toggle, p.slug]);

  const onQuick = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setQuickOpen(true);
  }, []);

  const iconBtn = "grid h-8 w-8 sm:h-9 sm:w-9 place-items-center rounded-full text-white/90 transition-colors hover:text-accent";
  const iconStyle = { backgroundColor: "rgba(20,20,20,0.6)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.12)" } as const;

  return (
    <>
      <Link
        to="/products/$slug"
        params={{ slug: p.slug }}
        data-product-card
        data-android-static-card
        onClick={() => trackFlashDealEvent("click", item.dealId, p.slug)}
        style={{ backgroundColor: "#111111", border: "1px solid rgba(255,138,0,0.18)" }}
        className="group flex h-full flex-col overflow-hidden rounded-[22px] shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition-[transform,box-shadow,border-color] duration-200 will-change-transform motion-safe:lg:hover:-translate-y-1 lg:hover:border-accent/50 lg:hover:shadow-[0_14px_36px_-8px_rgba(255,138,0,0.45)]"
      >
        <div data-product-media className="relative aspect-[4/5] overflow-hidden bg-black/40">
          {p.image && (
            <img
              data-product-image
              src={p.image}
              alt={p.name}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-300 motion-safe:lg:group-hover:scale-[1.04]"
            />
          )}
          <span
            data-product-badge
            className={`absolute left-2 top-2 inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-wide shadow-sm shadow-black/30 ${dealBadge.className}`}
          >
            <span aria-hidden>{dealBadge.emoji}</span>
            {dealBadge.label}
          </span>
          {off > 0 && (
            <span data-product-badge className="absolute right-2 top-2 inline-flex items-center rounded-full bg-accent px-2 py-0.5 font-mono text-[9px] font-bold text-black shadow-[var(--shadow-ember)]">
              -{off}%
            </span>
          )}
          <div className="absolute bottom-2 right-2 flex flex-col gap-1.5">
            <button onClick={onWishlist} style={iconStyle} className={iconBtn} aria-label={saved ? `Remove ${p.name} from wishlist` : `Add ${p.name} to wishlist`}>
              <Heart className={`size-4 ${saved ? "fill-accent text-accent" : ""}`} />
            </button>
            <button onClick={onQuick} style={iconStyle} className={iconBtn} aria-label={`Quick view ${p.name}`}>
              <Eye className="size-4" />
            </button>
          </div>
          {item.endAt && (
            <div className="absolute bottom-2 left-2 right-12">
              <Countdown end={item.endAt} now={now} />
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1 p-2.5 sm:p-3">
          <p
            data-product-text
            className="product-typography product-title-text text-[12px] sm:text-[13px] font-medium leading-snug"
            style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: "2.4em" }}
          >
            {p.name}
          </p>
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <Price value={displayPrice} className="text-sm sm:text-base font-display font-bold text-accent tabular-nums" />
            {hasFlash && (
              <Price value={regularPrice} className="text-[10px] sm:text-[11px] font-mono line-through text-muted-foreground tabular-nums" />
            )}
          </div>
          <p
            data-product-text
            className="product-typography mt-auto pt-0.5 text-[9px] font-mono uppercase tracking-wider text-accent/90"
            style={{ minHeight: "1.1em" }}
          >
            {showOnlyLeft ? `Only ${p.stockQuantity} left` : ""}
          </p>
        </div>
      </Link>
      {quickOpen && <QuickViewDialog product={p} open={quickOpen} onOpenChange={setQuickOpen} />}
    </>
  );
}


export function FlashDeals() {
  const { items: allItems, loading, now, products } = useFlashDeals();
  const { priceOf } = useRegion();
  const { sections } = useHomepageSections();
  const { canEdit: isAdmin } = useProductAdminEditing();

  // Admin-controlled homepage visibility (separate from product Flash Deal
  // status). Inactive hides the whole section from shoppers only — products
  // still appear on the Deals & Offers pages and remain untouched in the DB.
  const sectionActive = sections.flash_deals?.active ?? true;

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
    if (!sectionActive) return;
    items.forEach((i) => trackFlashDealEvent("impression", i.dealId, i.product.slug));
  }, [items, sectionActive]);

  // Section hidden by admin: invisible to shoppers, no empty state, no blank
  // space. Admins keep a compact control to re-enable it.
  if (!sectionActive && !isAdmin) return null;

  // Avoid flashing the empty state before the catalog resolves.
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
          {isAdmin && (
            <div className="ml-auto shrink-0">
              <InlineActiveToggle
                active={sectionActive}
                label="Flash Deals section"
                size="sm"
                onToggle={(next) => toggleHomepageSection("flash_deals", next)}
              />
            </div>
          )}
        </div>

        {/* 2x2 grid on mobile, 4-up on desktop — exactly 4 featured deals. */}
        <div data-product-grid className="relative grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
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
            // Flash section shows ONLY the Flash/Hot deal badge — never any
            // other badge. Flash Deal takes priority when both flags are set.
            const dealBadge = singleBadge(p.flashDeal ? "flash_deal" : "hot_deal");
            return (
              <Link
                key={p.id ?? p.slug}
                to="/products/$slug"
                params={{ slug: p.slug }}
                data-product-card
                data-android-static-card
                onClick={() => trackFlashDealEvent("click", i.dealId, p.slug)}
                className="flex flex-col group min-w-0"
              >
                <div data-product-media className="relative aspect-[4/5] rounded-2xl overflow-hidden bg-black/40 ring-1 ring-white/10">
                  {p.image && (
                    <img
                      data-product-image
                      src={p.image}
                      alt={p.name}
                      loading="lazy"
                      decoding="sync"
                      className="w-full h-full object-cover"
                    />
                  )}
                  <span
                    data-product-badge
                    className={`absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-wide shadow-sm shadow-black/30 ${dealBadge.className}`}
                  >
                    <span aria-hidden>{dealBadge.emoji}</span>
                    {dealBadge.label}
                  </span>
                  {off > 0 && (
                    <span data-product-badge className="absolute top-1.5 right-1.5 inline-flex items-center rounded-full bg-accent text-black text-[9px] font-bold font-mono px-2 py-0.5 shadow-[var(--shadow-ember)]">
                      -{off}%
                    </span>
                  )}
                  {i.endAt && (
                    <div className="absolute bottom-1.5 left-1.5 right-1.5">
                      <Countdown end={i.endAt} now={now} />
                    </div>
                  )}
                </div>
                <p data-product-text className="product-typography product-title-text mt-2 text-[11px] font-medium truncate">{p.name}</p>
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <Price value={displayPrice} className="text-xs font-display font-semibold text-accent tabular-nums" />
                  {hasFlash && (
                    <Price value={regularPrice} className="text-[10px] font-mono line-through text-muted-foreground tabular-nums" />
                  )}
                </div>
                {showOnlyLeft && (
                  <p data-product-text className="product-typography text-[9px] font-mono uppercase tracking-wider text-accent/90 mt-auto pt-0.5">
                    Only {p.stockQuantity} left
                  </p>
                )}
              </Link>
            );
          })}
        </div>

        {/* View All — navigates to the dedicated Flash Deals page. */}
        <div className="relative mt-5 flex justify-center">
          <Link
            to="/deals"
            className="inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground px-6 py-3 text-xs font-mono uppercase tracking-widest hover:opacity-90 transition shadow-[var(--shadow-ember)]"
          >
            View All Flash Deals <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
