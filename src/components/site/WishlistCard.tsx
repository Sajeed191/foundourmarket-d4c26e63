import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Heart, Plus, Minus, Check, Eye, TrendingDown } from "lucide-react";
import { type Product, discountPercent } from "@/lib/products";
import { useRegion } from "@/lib/region";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";
import { useBadgeSettings } from "@/lib/use-badge-settings";
import { computeBadges } from "@/lib/badges";
import { useProductBadges, badgeAnimationClass } from "@/lib/use-product-badges";
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

export function WishlistCard({
  product,
  variantSummary,
  priceDrop,
  selectMode,
  selected,
  onToggleSelect,
  onQuickView,
}: WishlistCardProps) {
  const { format, priceOf, compareOf, shippingFeeOf } = useRegion();
  const { add, items, setQty } = useCart();
  const { toggle } = useWishlist();
  const [imgLoaded, setImgLoaded] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const cartQty = items.find((i) => i.slug === product.slug)?.qty ?? 0;

  const price = priceOf(product);
  const originalPrice =
    compareOf(product) ?? (product.discount ? price * (1 + product.discount / 100) : null);
  const discount = discountPercent(price, originalPrice);
  const shippingFee = shippingFeeOf(product);
  const lowStock =
    product.stockQuantity > 0 && product.stockQuantity <= (product.lowStockThreshold || 10);

  const badgeSettings = useBadgeSettings();
  const assigned = useProductBadges(product.slug);
  const badges = assigned.length
    ? assigned.map((b) => ({
        key: b.badgeKey,
        label: b.label,
        emoji: b.emoji,
        backgroundColor: b.backgroundColor || b.color,
        textColor: b.textColor,
        borderColor: b.borderColor,
        animation: b.animation,
        className: undefined as string | undefined,
      }))
    : computeBadges(product, badgeSettings).map((b) => ({
        key: b.key,
        label: b.label,
        emoji: b.emoji,
        backgroundColor: undefined as string | undefined,
        textColor: undefined as string | undefined,
        borderColor: undefined as string | undefined,
        animation: undefined as string | undefined,
        className: b.className,
      }));

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    add(product.slug);
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 900);
  };

  const cardClick = (e: React.MouseEvent) => {
    if (selectMode) {
      e.preventDefault();
      onToggleSelect();
    }
  };

  return (
    <div
      className={`group card-premium overflow-hidden relative flex flex-col h-full p-2.5 sm:p-3 transition-all duration-300 ${
        selected ? "ring-2 ring-accent shadow-[var(--shadow-ember)]" : ""
      }`}
    >
      {/* Ember halo on hover */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-[inherit] opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-0"
        style={{ background: "var(--gradient-ember-soft)", filter: "blur(20px)" }}
      />

      {/* Select checkbox */}
      {selectMode && (
        <button
          onClick={onToggleSelect}
          aria-label={selected ? "Deselect" : "Select"}
          className="absolute top-2.5 left-2.5 z-20 grid place-items-center"
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
        <div className="relative aspect-square rounded-xl overflow-hidden bg-black/40 mb-3">
          <div
            aria-hidden
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
            style={{ background: "var(--gradient-ember-soft)" }}
          />
          {!imgLoaded && (
            <div
              aria-hidden
              className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent"
            />
          )}
          <img
            src={product.image}
            alt={`${product.name} — ${product.tagline || product.category}`}
            loading="lazy"
            width={800}
            height={800}
            onLoad={() => setImgLoaded(true)}
            className={`relative w-full h-full object-cover [transition:opacity_500ms_ease,transform_700ms_cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03] ${
              imgLoaded ? "opacity-100" : "opacity-0"
            }`}
          />

          {/* Badge stack */}
          <div
            className={`absolute flex flex-col items-start top-2.5 gap-1.5 ${
              selectMode ? "left-10" : "left-2.5"
            }`}
          >
            {badges.slice(0, 2).map((b) => (
              <span
                key={b.key}
                className={`inline-flex items-center gap-1 text-[9px] font-bold font-mono px-1.5 min-h-[18px] leading-none rounded-md tracking-wider whitespace-nowrap shadow-sm ${
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
                {b.emoji && <span aria-hidden>{b.emoji}</span>}
                {b.label}
              </span>
            ))}
          </div>

          {/* Discount badge */}
          {discount ? (
            <span className="absolute bottom-2.5 left-2.5 bg-accent/95 text-accent-foreground font-bold font-mono rounded-full whitespace-nowrap shadow-[var(--shadow-ember)] text-[10px] px-2.5 py-0.5">
              SAVE {discount}%
            </span>
          ) : null}

          {/* Out of stock veil */}
          {!product.inStock && (
            <div className="absolute inset-0 grid place-items-center bg-black/55 backdrop-blur-[1px]">
              <span className="rounded-full bg-black/70 border border-white/20 text-white/90 font-bold font-mono uppercase tracking-widest text-[10px] px-3 py-1.5">
                Sold Out
              </span>
            </div>
          )}

          {/* Glassmorphism action buttons */}
          <div className="absolute top-2.5 right-2.5 flex flex-col gap-1.5">
            <button
              onClick={(e) => {
                e.preventDefault();
                toggle(product.slug);
              }}
              aria-label="Remove from wishlist"
              className="size-8 grid place-items-center rounded-full bg-accent/25 border border-accent text-accent backdrop-blur-xl shadow-lg shadow-black/30 transition-all duration-300 active:scale-90 hover:brightness-125"
            >
              <Heart className="size-3 fill-accent" />
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                onQuickView();
              }}
              aria-label="Quick view"
              className="size-8 grid place-items-center rounded-full bg-black/40 border border-white/20 text-white backdrop-blur-xl shadow-lg shadow-black/30 transition-all duration-300 active:scale-90 hover:bg-accent/25 hover:border-accent hover:text-accent"
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
        <h4 className="font-medium line-clamp-2 group-hover:text-accent transition-colors text-sm leading-snug min-h-[2.5em]">
          {product.name}
        </h4>
        {product.tagline ? (
          <p className="text-muted-foreground truncate text-[11px] mt-0.5">{product.tagline}</p>
        ) : product.category ? (
          <p className="text-muted-foreground/70 capitalize truncate text-[11px] mt-0.5">
            {product.category.replace(/-/g, " ")}
          </p>
        ) : null}

        {/* Rating */}
        <div className="flex flex-col justify-center min-w-0 mt-1.5 min-h-[30px]">
          {product.reviews > 0 ? (
            <>
              <StarRating rating={product.rating} showValue starClassName="size-3" textClassName="text-[10px]" />
              <span className="font-mono text-muted-foreground/70 text-[9px] mt-0.5">
                {product.reviews.toLocaleString()} Reviews
              </span>
            </>
          ) : (
            <span className="font-mono uppercase tracking-wider text-emerald-400/90 text-[9px]">
              New Product
            </span>
          )}
        </div>

        {/* Variant summary */}
        {variantSummary ? (
          <p className="mt-1 text-[10px] font-mono text-muted-foreground/80 truncate">
            {variantSummary}
          </p>
        ) : null}

        {/* Stock + shipping row */}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 min-h-[14px]">
          {shippingFee <= 0 && (
            <span className="font-mono uppercase tracking-wider text-emerald-400/90 text-[9px]">
              Free Shipping
            </span>
          )}
          {product.inStock && lowStock && (
            <span className="font-mono uppercase tracking-wider text-accent/90 text-[9px]">
              Only {product.stockQuantity} left
            </span>
          )}
          {product.inStock && !lowStock && (
            <span className="font-mono uppercase tracking-wider text-emerald-400/80 text-[9px]">
              In Stock
            </span>
          )}
          {!product.inStock && (
            <span className="font-mono uppercase tracking-wider text-muted-foreground text-[9px]">
              Out of Stock
            </span>
          )}
        </div>

        {/* Price drop indicator */}
        {priceDrop && priceDrop > 0 ? (
          <span className="mt-1 inline-flex items-center gap-1 self-start rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-bold font-mono text-[9px] px-2 py-0.5">
            <TrendingDown className="size-2.5" /> Price dropped {format(priceDrop)}
          </span>
        ) : null}

        {/* Price + ADD */}
        <div className="mt-auto pt-2.5 border-t border-white/[0.07] flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-display font-semibold tabular-nums leading-none text-base sm:text-lg">
              {format(price)}
            </p>
            {originalPrice && discount ? (
              <p className="font-mono text-muted-foreground/60 line-through tabular-nums text-[10px] mt-1">
                {format(originalPrice)}
              </p>
            ) : null}
          </div>
          {!product.inStock ? (
            <span
              onClick={(e) => e.preventDefault()}
              className="shrink-0 inline-flex items-center rounded-full bg-muted/40 border border-white/10 text-muted-foreground font-bold font-mono uppercase tracking-wider px-3 py-1.5 text-[10px]"
            >
              Sold Out
            </span>
          ) : cartQty > 0 ? (
            <div
              onClick={(e) => e.preventDefault()}
              className="shrink-0 inline-flex items-center gap-1 rounded-full bg-accent/15 border border-accent/40 text-accent font-bold font-mono px-2 py-1 text-[11px]"
            >
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setQty(product.slug, cartQty - 1);
                }}
                aria-label="Decrease quantity"
                className="grid place-items-center rounded-full hover:bg-accent/20 active:scale-90 transition-transform size-5"
              >
                <Minus className="size-3" />
              </button>
              <span className="tabular-nums min-w-[1.25rem] text-center">{cartQty}</span>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setQty(product.slug, cartQty + 1);
                }}
                aria-label="Increase quantity"
                className="grid place-items-center rounded-full hover:bg-accent/20 active:scale-90 transition-transform size-5"
              >
                <Plus className="size-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleAdd}
              aria-label={`Add ${product.name} to cart`}
              className={`shrink-0 inline-flex items-center gap-1 rounded-full bg-accent text-accent-foreground font-bold font-mono uppercase tracking-wider transition-all hover:brightness-110 active:scale-95 shadow-[var(--shadow-ember)] px-3 py-1.5 text-[10px] ${
                justAdded ? "animate-[save-pulse_0.6s_ease-out]" : ""
              }`}
            >
              {justAdded ? <Check className="size-3" /> : <Plus className="size-3" />}
              {justAdded ? "Added" : "Add"}
            </button>
          )}
        </div>
      </Link>
    </div>
  );
}
