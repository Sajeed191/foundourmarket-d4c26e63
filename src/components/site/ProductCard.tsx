import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Heart, Plus } from "lucide-react";
import { type Product, discountPercent } from "@/lib/products";
import { useRegion } from "@/lib/region";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";
import { ProductCardAdminControls } from "@/components/admin/ProductCardAdminControls";
import { useBadgeSettings } from "@/lib/use-badge-settings";
import { computeBadges } from "@/lib/badges";
import { useProductBadges, trackBadgeClick, badgeAnimationClass } from "@/lib/use-product-badges";
import { StarRating } from "@/components/site/StarRating";

type DisplayBadge = {
  key: string;
  id?: string;
  label: string;
  emoji: string;
  className?: string;
  color?: string;
  textColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  glowColor?: string;
  iconColor?: string;
  shadowStrength?: number;
  radius?: number;
  subtitle?: string;
  animation?: string;
};


export function ProductCard({ product, compact }: { product: Product; compact?: boolean }) {
  const { format, priceOf, compareOf, shippingFeeOf } = useRegion();
  const { add } = useCart();
  const { has, toggle } = useWishlist();
  const saved = has(product.slug);
  const [imgLoaded, setImgLoaded] = useState(false);
  const price = priceOf(product);
  const originalPrice = compareOf(product) ?? (product.discount ? price * (1 + product.discount / 100) : null);
  const discount = discountPercent(price, originalPrice);
  const shippingFee = shippingFeeOf(product);

  const badgeSettings = useBadgeSettings();
  const assigned = useProductBadges(product.slug);
  // Admin-assigned badges win; otherwise fall back to auto-computed badges.
  const badges: DisplayBadge[] = assigned.length
    ? assigned.map((b) => ({
        key: b.badgeKey,
        id: b.id,
        label: b.label,
        emoji: b.emoji,
        color: b.color,
        textColor: b.textColor,
        backgroundColor: b.backgroundColor,
        borderColor: b.borderColor,
        glowColor: b.glowColor,
        iconColor: b.iconColor,
        shadowStrength: b.shadowStrength,
        radius: b.radius,
        subtitle: b.subtitle,
        animation: b.animation,
      }))
    : computeBadges(product, badgeSettings).map((b) => ({
        key: b.key,
        label: b.label,
        emoji: b.emoji,
        className: b.className,
      }));
  const showOnlyLeft =
    product.stockQuantity > 0 &&
    product.stockQuantity <= (product.lowStockThreshold || 10);

  return (
    <div className={`group card-premium overflow-hidden relative flex flex-col h-full ${compact ? "p-1.5 sm:p-2" : "p-2.5 sm:p-3"}`}>
      <ProductCardAdminControls product={product} />
      {/* Ember halo on hover */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-[inherit] opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-0"
        style={{ background: "var(--gradient-ember-soft)", filter: "blur(20px)" }}
      />

      <Link to="/products/$slug" params={{ slug: product.slug }} className="block relative">
        <div className={`relative aspect-square rounded-xl overflow-hidden bg-black/40 ${compact ? "mb-1" : "mb-3 sm:mb-4"}`}>
          {/* Glow on hover */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
            style={{ background: "var(--gradient-ember-soft)" }}
          />
          {/* Skeleton placeholder — prevents layout shift while the image loads */}
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
            className={`relative w-full h-full object-cover [transition:opacity_500ms_ease,transform_700ms_cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
          />


          {/* Shine sweep */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 overflow-hidden"
          >
            <div className="absolute -inset-y-2 -left-1/2 w-1/3 rotate-12 bg-gradient-to-r from-transparent via-white/15 to-transparent translate-x-[-120%] group-hover:translate-x-[420%] transition-transform duration-[1100ms] ease-out" />
          </div>

          {/* Bottom gradient for badges */}
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

          <div className={`absolute flex flex-col items-start ${compact ? "top-2 left-2 gap-1" : "top-2.5 left-2.5 gap-1.5"}`}>
            {badges.slice(0, 3).map((b) => {
              const bg = b.backgroundColor || b.color;
              const styled = !b.className;
              const shadow = b.shadowStrength
                ? `0 ${Math.round(b.shadowStrength / 12)}px ${Math.round(b.shadowStrength / 4)}px -2px ${b.glowColor || bg || "rgba(0,0,0,0.4)"}`
                : undefined;
              return (
                <span
                  key={b.key}
                  onClick={b.id ? () => trackBadgeClick(b.id!, product.slug) : undefined}
                  className={`inline-flex items-center gap-1 text-[9px] font-bold font-mono px-1.5 min-h-[18px] leading-none rounded-md tracking-wider whitespace-nowrap shadow-sm ${b.className ?? ""}`}
                  style={
                    styled
                      ? {
                          backgroundColor: bg,
                          color: b.textColor,
                          border: b.borderColor ? `1px solid ${b.borderColor}` : undefined,
                          borderRadius: b.radius != null ? `${b.radius}px` : undefined,
                          boxShadow: shadow,
                        }
                      : undefined
                  }
                >
                  {b.emoji && (
                    <span aria-hidden style={b.iconColor ? { color: b.iconColor } : undefined}>
                      {b.emoji}
                    </span>
                  )}
                  {b.label}
                </span>
              );
            })}
            {badges.length > 3 && (
              <span className="inline-flex items-center text-[9px] font-bold font-mono px-1.5 py-0.5 rounded-md tracking-wider bg-black/60 text-white/90 backdrop-blur-md">
                +{badges.length - 3}
              </span>
            )}
          </div>

          {/* Discount badge — kept in its own corner so it never crowds the badge stack */}
          {discount ? (
            <span className={`absolute bg-accent/95 text-accent-foreground font-bold font-mono rounded-full whitespace-nowrap shadow-[var(--shadow-ember)] ${compact ? "bottom-2 left-2 text-[9px] px-2 py-0.5" : "bottom-2.5 left-2.5 text-[10px] px-2.5 py-0.5"}`}>
              SAVE {discount}%
            </span>
          ) : null}


          <button
            onClick={(e) => { e.preventDefault(); toggle(product.slug); }}
            aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
            className={`absolute grid place-items-center rounded-full backdrop-blur-xl border shadow-lg shadow-black/30 transition-all duration-300 active:scale-90 ${
              compact
                ? "top-2 right-2 size-7"
                : "top-2.5 right-2.5 size-8"
            } ${
              saved
                ? "bg-accent/25 border-accent text-accent scale-110"
                : "bg-black/40 border-white/20 text-white hover:bg-accent/25 hover:border-accent hover:text-accent hover:scale-110"
            }`}
          >
            <Heart className={`transition-all ${compact ? "size-2.5" : "size-3"} ${saved ? "fill-accent" : ""}`} />
          </button>

          {/* Quick add — slides up on hover (desktop) */}
          <button
            onClick={(e) => { e.preventDefault(); add(product.slug); }}
            className={`hidden sm:flex absolute items-center justify-center gap-1.5 rounded-xl bg-accent text-accent-foreground font-semibold uppercase tracking-wider opacity-0 translate-y-3 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 hover:brightness-110 shadow-[var(--shadow-ember)] ${
              compact
                ? "inset-x-2 bottom-2 py-1.5 text-[10px]"
                : "inset-x-2.5 bottom-2.5 py-2 text-[11px]"
            }`}
          >
            <Plus className={`${compact ? "size-3" : "size-3.5"}`} /> Quick Add
          </button>
        </div>
      </Link>

      <Link to="/products/$slug" params={{ slug: product.slug }} className={`relative flex flex-1 flex-col ${compact ? "" : "px-1"}`}>
        {/* Title — fixed 2-line block keeps every card's footer aligned */}
        <h4 className={`font-medium line-clamp-2 group-hover:text-accent transition-colors ${compact ? "text-[11px] leading-tight min-h-[2.2em]" : "text-sm leading-snug min-h-[2.5em]"}`}>{product.name}</h4>
        {product.tagline ? (
          <p className={`text-muted-foreground truncate ${compact ? "text-[8px] mt-0.5" : "text-[11px] mt-0.5"}`}>{product.tagline}</p>
        ) : product.category ? (
          <p className={`text-muted-foreground/70 capitalize truncate ${compact ? "text-[8px] mt-0.5" : "text-[11px] mt-0.5"}`}>{product.category.replace(/-/g, " ")}</p>
        ) : null}

        {/* Rating row */}
        <div className={`flex items-center font-mono text-muted-foreground min-w-0 ${compact ? "mt-1 text-[9px]" : "mt-1.5 text-[10px]"}`}>
          {product.reviews > 0 ? (
            <StarRating
              rating={product.rating}
              count={product.reviews}
              showValue
              starClassName={compact ? "size-2.5" : "size-3"}
              textClassName={compact ? "text-[9px]" : "text-[10px]"}
            />
          ) : (
            <span className={`font-mono uppercase tracking-wider text-emerald-400/90 ${compact ? "text-[8px]" : "text-[9px]"}`}>
              New Product
            </span>
          )}
        </div>

        {/* Shipping row — free shipping when fee is 0, otherwise the actual charge */}
        {shippingFee > 0 ? (
          <p className={`font-mono text-muted-foreground/80 ${compact ? "mt-0.5 text-[8px]" : "mt-1 text-[10px]"}`}>
            Shipping {format(shippingFee)}
          </p>
        ) : (
          <p className={`font-mono uppercase tracking-wider text-emerald-400/90 ${compact ? "mt-0.5 text-[8px]" : "mt-1 text-[9px]"}`}>
            Free Shipping
          </p>
        )}
        {showOnlyLeft && (
          <p className={`font-mono uppercase tracking-wider text-accent/90 ${compact ? "mt-0.5 text-[8px]" : "mt-1 text-[9px]"}`}>
            Only {product.stockQuantity} left
          </p>
        )}
        {!product.inStock && (
          <p className={`font-mono uppercase tracking-wider text-muted-foreground ${compact ? "mt-0.5 text-[8px]" : "mt-1 text-[9px]"}`}>
            Out of stock
          </p>
        )}

        {/* Price + ADD — pinned to the bottom so it aligns across all cards */}
        <div className="flex items-end justify-between gap-2 mt-auto pt-2.5">
          <div className="min-w-0">
            <p className={`font-display font-semibold tabular-nums leading-none ${compact ? "text-sm" : "text-base sm:text-lg"}`}>{format(price)}</p>
            {originalPrice && discount ? (
              <p className={`font-mono text-muted-foreground/60 line-through tabular-nums ${compact ? "text-[9px] mt-0.5" : "text-[10px] mt-1"}`}>{format(originalPrice)}</p>
            ) : null}
          </div>
          <button
            onClick={(e) => { e.preventDefault(); add(product.slug); }}
            aria-label={`Add ${product.name} to cart`}
            className={`shrink-0 inline-flex items-center gap-1 rounded-full bg-accent text-accent-foreground font-bold font-mono uppercase tracking-wider transition-all hover:brightness-110 active:scale-95 shadow-[var(--shadow-ember)] ${compact ? "px-2 py-1 text-[9px]" : "px-3 py-1.5 text-[10px]"}`}
          >
            <Plus className={compact ? "size-2.5" : "size-3"} /> Add
          </button>
        </div>
      </Link>
    </div>
  );
}
