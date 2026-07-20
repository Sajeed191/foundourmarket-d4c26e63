import { Link } from "@tanstack/react-router";
import { memo, useEffect, useState } from "react";
import { Heart, Zap, Eye, TrendingDown } from "lucide-react";
import { type Product, discountPercent } from "@/lib/products";
import { useRegion } from "@/lib/region";
import { Price } from "@/components/site/Price";
import { useCart } from "@/lib/cart";
import { useBuyNow } from "@/lib/use-buy-now";
import { useWishlist } from "@/lib/wishlist";

import { useResolvedProductBadges, badgeAnimationClass } from "@/lib/use-product-badges";
import { StarRating } from "@/components/site/StarRating";
import { Checkbox } from "@/components/ui/checkbox";

export type WishlistCardProps = {
  product: Product;
  variantSummary?: string | null;
  priceDrop?: number | null;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onQuickView: () => void;
};

function WishlistCardImpl({
  product,
  variantSummary,
  priceDrop,
  selectMode,
  selected,
  onToggleSelect,
  onQuickView,
}: WishlistCardProps) {
  const { priceOf, compareOf, shippingFeeOf } = useRegion();
  const { items } = useCart();
  const { toggle } = useWishlist();
  const [imgLoaded, setImgLoaded] = useState(false);
  const buyNow = useBuyNow();
  const cartQty = items.find((i) => i.slug === product.slug)?.qty ?? 0;

  const price = priceOf(product);
  const originalPrice =
    compareOf(product) ?? (product.discount ? price * (1 + product.discount / 100) : null);
  const discount = discountPercent(price, originalPrice);
  const shippingFee = shippingFeeOf(product);
  const lowStock =
    product.stockQuantity > 0 && product.stockQuantity <= (product.lowStockThreshold || 10);

  const assigned = useResolvedProductBadges(product.slug);
  const badges = assigned.map((b) => ({
    key: b.badgeKey,
    label: b.label,
    emoji: b.emoji,
    backgroundColor: b.backgroundColor || b.color,
    textColor: b.textColor,
    borderColor: b.borderColor,
    animation: b.animation,
    className: undefined as string | undefined,
  }));

  const handleBuyNow = (e: React.MouseEvent) => {
    e.preventDefault();
    buyNow(product);
  };


  useEffect(() => {
    setImgLoaded(false);
  }, [product.image]);

  const cardClick = (e: React.MouseEvent) => {
    if (selectMode) {
      e.preventDefault();
      onToggleSelect();
    }
  };

  return (
    <div
      data-product-card
      data-android-static-card
      className={`group product-card-glass overflow-hidden relative flex flex-col h-full p-2 transition-all duration-300 ${
        selected ? "ring-2 ring-accent shadow-[var(--shadow-ember)]" : ""
      }`}
    >
      {/* Select checkbox */}
      {selectMode && (
        <button
          onClick={onToggleSelect}
          aria-label={selected ? "Deselect" : "Select"}
          className="absolute top-2 left-2 z-20 grid place-items-center"
        >
          <Checkbox checked={selected} className="size-5 bg-black/50 border-white/40" />
        </button>
      )}

      <Link
        to="/products/$slug"
        params={{ slug: product.slug }}
        onClick={cardClick}
        className="block relative"
      >
        <div data-product-media className="relative aspect-[4/5] rounded-2xl overflow-hidden bg-black/40">
          {!imgLoaded && (
            <div
              aria-hidden
              className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent"
            />
          )}
          <img
            data-product-image
            src={product.image}
            alt={`${product.name} — ${product.tagline || product.category}`}
            loading="lazy"
            decoding="sync"
            width={800}
            height={1000}
            onLoad={() => setImgLoaded(true)}
            className={`relative w-full h-full object-cover transition-opacity duration-500 ${
              imgLoaded ? "opacity-100" : "opacity-0"
            }`}
          />

          {/* Discount percentage badge removed sitewide per design decision. */}

          {/* Badge stack — below the discount pill */}
          <div
            className={`absolute flex flex-col items-start gap-1 ${discount ? "top-9" : "top-2"} ${
              selectMode ? "left-10" : "left-2"
            } md:gap-1.5 lg:gap-2`}
          >
            {badges.slice(0, 2).map((b) => (
              <span
                key={b.key}
                data-product-badge
                className={`inline-flex items-center gap-1 text-[9px] font-bold font-mono px-1.5 min-h-[18px] leading-none rounded-md tracking-wider whitespace-nowrap shadow-sm md:gap-1 md:text-[10px] md:px-2 md:min-h-[20px] lg:gap-1.5 lg:text-sm lg:px-3 lg:min-h-[26px] ${
                  b.className ?? ""
                } ${badgeAnimationClass(b.animation)}`}
                style={
                  b.className
                    ? undefined
                    : {
                        backgroundColor: b.backgroundColor,
                        color: b.textColor,
                        border: b.borderColor ? `1px solid ${b.borderColor}` : undefined,
                      }
                }
              >
                {b.emoji && <span aria-hidden className="md:text-[10px] lg:text-base">{b.emoji}</span>}
                {b.label}
              </span>
            ))}
          </div>

          {/* Out of stock veil */}
          {!product.inStock && (
            <div className="absolute inset-0 grid place-items-center bg-black/55 backdrop-blur-[1px]">
              <span className="rounded-full bg-black/70 border border-white/20 text-white/90 font-bold font-mono uppercase tracking-widest text-[10px] px-3 py-1.5">
                Sold Out
              </span>
            </div>
          )}

          {/* Glassmorphism action buttons */}
          <div className="absolute top-2 right-2 flex flex-col gap-1.5">
            <button
              onClick={(e) => {
                e.preventDefault();
                toggle(product.slug);
              }}
              aria-label="Remove from wishlist"
               className="size-8 grid place-items-center rounded-full bg-accent/25 border border-accent text-accent backdrop-blur-xl shadow-lg shadow-black/30 transition-colors duration-300 hover:brightness-125"
            >
              <Heart className="size-3 fill-accent" />
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                onQuickView();
              }}
              aria-label="Quick view"
              className="size-8 grid place-items-center rounded-full bg-black/40 border border-white/20 text-white backdrop-blur-xl shadow-lg shadow-black/30 transition-colors duration-300 hover:bg-accent/25 hover:border-accent hover:text-accent"
            >
              <Eye className="size-3.5" />
            </button>
          </div>
        </div>
      </Link>

      <Link
        to="/products/$slug"
        params={{ slug: product.slug }}
        onClick={cardClick}
        className="relative flex flex-1 flex-col px-1"
      >
          <h4 data-product-text className="product-typography product-title-text font-medium line-clamp-2 group-hover:text-accent transition-colors text-sm leading-snug min-h-[2.5em]">
          {product.name}
        </h4>
        {product.tagline ? (
          <p data-product-text className="product-typography text-muted-foreground truncate text-[11px] mt-0.5">{product.tagline}</p>
        ) : product.category ? (
          <p data-product-text className="product-typography text-muted-foreground/70 capitalize truncate text-[11px] mt-0.5">
            {product.category.replace(/-/g, " ")}
          </p>
        ) : null}

        {/* Rating */}
        <div className="flex flex-col justify-center min-w-0 mt-1.5 min-h-[30px]">
          {product.reviews > 0 ? (
            <>
              <StarRating rating={product.rating} showValue starClassName="size-3" textClassName="text-[10px]" />
              <span data-product-text className="product-typography product-rating-text font-mono text-muted-foreground/70 text-[9px] mt-0.5">
                {product.reviews.toLocaleString()} Reviews
              </span>
            </>
          ) : (
            <span data-product-text className="product-typography product-rating-text font-mono uppercase tracking-wider text-emerald-400/90 text-[9px]">
              New Product
            </span>
          )}
        </div>

        {/* Variant summary */}
        {variantSummary ? (
          <p data-product-text className="product-typography mt-1 text-[10px] font-mono text-muted-foreground/80 truncate">
            {variantSummary}
          </p>
        ) : null}

        {/* Stock + shipping row */}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 min-h-[14px]">
          {shippingFee <= 0 && (
            <span data-product-text className="product-typography font-mono uppercase tracking-wider text-emerald-400/90 text-[9px]">
              Free Shipping
            </span>
          )}
          {product.inStock && lowStock && (
            <span data-product-text className="product-typography font-mono uppercase tracking-wider text-accent/90 text-[9px]">
              Only {product.stockQuantity} left
            </span>
          )}
          {product.inStock && !lowStock && (
            <span data-product-text className="product-typography font-mono uppercase tracking-wider text-emerald-400/80 text-[9px]">
              In Stock
            </span>
          )}
          {!product.inStock && (
            <span data-product-text className="product-typography font-mono uppercase tracking-wider text-muted-foreground text-[9px]">
              Out of Stock
            </span>
          )}
        </div>

        {/* Price drop indicator */}
        {priceDrop && priceDrop > 0 ? (
          <span className="product-typography product-price-text mt-1 inline-flex items-center gap-1 self-start rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-bold font-mono text-[9px] px-2 py-0.5">
            <TrendingDown className="size-2.5" /> Price dropped <Price value={priceDrop} skeletonClassName="h-[1em] w-8" />
          </span>
        ) : null}

        {/* Price + floating cart icon button */}
        <div className="mt-auto pt-2 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <Price value={price} className="font-display font-bold text-white tabular-nums leading-none block text-base" />
            {originalPrice && discount ? (
              <Price value={originalPrice} variant="compare" className="block text-[10px] mt-1" />
            ) : null}
          </div>
          {product.inStock ? (
            <button
              onClick={handleBuyNow}
              aria-label={`Buy ${product.name} now`}
              className="relative shrink-0 grid place-items-center size-10 rounded-xl bg-gradient-to-br from-accent to-[oklch(0.68_0.18_42)] text-black backdrop-blur-xl border border-white/20 shadow-[var(--shadow-ember)] transition-colors duration-300 hover:brightness-110"
            >
              <Zap className="size-4" strokeWidth={2.5} />
              {cartQty > 0 && (
              <span data-product-text className="product-typography absolute -top-1.5 -right-1.5 grid place-items-center min-w-[16px] h-4 px-1 rounded-full bg-black text-white text-[9px] font-bold tabular-nums border border-white/20">
                  {cartQty}
                </span>
              )}
            </button>
          ) : (
            <span
              onClick={(e) => e.preventDefault()}
              data-product-text
              className="product-typography shrink-0 inline-flex items-center rounded-full bg-muted/40 border border-white/10 text-muted-foreground font-bold font-mono uppercase tracking-wider px-2 py-1 text-[9px]"
            >
              Sold Out
            </span>
          )}
        </div>
      </Link>
    </div>
  );
}

export const WishlistCard = memo(WishlistCardImpl, (a, b) =>
  a.selected === b.selected &&
  a.selectMode === b.selectMode &&
  a.priceDrop === b.priceDrop &&
  a.variantSummary === b.variantSummary &&
  a.onToggleSelect === b.onToggleSelect &&
  a.onQuickView === b.onQuickView &&
  a.product.slug === b.product.slug &&
  a.product.image === b.product.image &&
  a.product.name === b.product.name &&
  a.product.price === b.product.price &&
  a.product.comparePriceInr === b.product.comparePriceInr &&
  a.product.inStock === b.product.inStock &&
  a.product.stockQuantity === b.product.stockQuantity &&
  a.product.rating === b.product.rating &&
  a.product.reviews === b.product.reviews,
);
