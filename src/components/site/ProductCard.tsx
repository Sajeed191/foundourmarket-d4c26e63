import { Link } from "@tanstack/react-router";
import { Heart, Star, Plus, BadgeCheck } from "lucide-react";
import type { Product } from "@/lib/products";
import { useRegion } from "@/lib/region";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";

const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;

export function ProductCard({ product, compact }: { product: Product; compact?: boolean }) {
  const { format } = useRegion();
  const { add } = useCart();
  const { has, toggle } = useWishlist();
  const saved = has(product.slug);
  const originalPrice = product.discount ? product.price * (1 + product.discount / 100) : null;

  const isNew = product.createdAt
    ? Date.now() - new Date(product.createdAt).getTime() < FOURTEEN_DAYS
    : false;
  const isHot = (product.viewsCount ?? 0) >= 200;
  const isLimited =
    product.stockQuantity > 0 &&
    product.stockQuantity <= Math.max(5, product.lowStockThreshold ?? 5);
  const showOnlyLeft = product.stockQuantity > 0 && product.stockQuantity <= 10;

  return (
    <div className={`group card-premium overflow-hidden relative ${compact ? "p-1.5 sm:p-2" : "p-2.5 sm:p-3"}`}>
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
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            width={800}
            height={800}
            className="relative w-full h-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110"
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

          <div className={`absolute flex flex-col gap-1 items-start ${compact ? "top-2 left-2" : "top-2.5 left-2.5 gap-1.5"}`}>
            {isHot && (
              <span className="bg-accent text-accent-foreground text-[9px] font-bold font-mono px-1.5 py-0.5 rounded-md shadow-[var(--shadow-ember)] tracking-wider">
                HOT
              </span>
            )}
            {isNew && !isHot && (
              <span className="bg-emerald-500/90 text-white text-[9px] font-bold font-mono px-1.5 py-0.5 rounded-md tracking-wider">
                NEW
              </span>
            )}
            {isLimited && (
              <span className="bg-red-500/90 text-white text-[9px] font-bold font-mono px-1.5 py-0.5 rounded-md tracking-wider">
                LIMITED
              </span>
            )}
            {product.featured && !isHot && !isNew && (
              <span className="backdrop-blur-md bg-white/10 border border-white/15 text-white text-[10px] font-semibold font-mono px-2 py-0.5 rounded-full tracking-wider">
                FEATURED
              </span>
            )}
            {product.discount && (
              <span className="bg-accent/90 text-accent-foreground text-[10px] font-bold font-mono px-2 py-0.5 rounded-full">
                −{product.discount}%
              </span>
            )}
          </div>

          <button
            onClick={(e) => { e.preventDefault(); toggle(product.slug); }}
            aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
            className={`absolute grid place-items-center rounded-full backdrop-blur-md border transition-all duration-300 ${
              compact
                ? "top-2 right-2 size-7"
                : "top-2.5 right-2.5 size-8"
            } ${
              saved
                ? "bg-accent/20 border-accent/50 text-accent scale-110"
                : "bg-black/40 border-white/10 text-white/80 hover:bg-accent/20 hover:border-accent/50 hover:text-accent hover:scale-110"
            }`}
          >
            <Heart className={`transition-all ${compact ? "size-3" : "size-3.5"} ${saved ? "fill-accent" : ""}`} />
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

      <Link to="/products/$slug" params={{ slug: product.slug }} className={`block relative ${compact ? "" : "px-1"}`}>
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0 flex-1">
            <h4 className={`font-medium truncate group-hover:text-accent transition-colors ${compact ? "text-[11px] leading-tight" : "text-sm"}`}>{product.name}</h4>
            <p className={`text-muted-foreground truncate ${compact ? "text-[8px] mt-0.5" : "text-[11px]"}`}>{product.tagline}</p>

          </div>
          <div className="text-right shrink-0">
            <p className={`font-display font-semibold tabular-nums ${compact ? "text-[11px]" : "text-sm"}`}>{format(product.price)}</p>
            {originalPrice && (
              <p className={`font-mono text-muted-foreground/70 line-through tabular-nums ${compact ? "text-[9px]" : "text-[10px]"}`}>{format(originalPrice)}</p>
            )}
          </div>
        </div>
        <div className={`flex items-center justify-between gap-2 ${compact ? "mt-1" : "mt-2"}`}>
          <div className={`flex items-center gap-1 font-mono text-muted-foreground min-w-0 ${compact ? "text-[9px]" : "text-[10px]"}`}>
            <Star className={`fill-accent text-accent shrink-0 ${compact ? "size-2.5" : "size-3"}`} />
            <span className="text-foreground/80">{product.rating}</span>
            <span className="opacity-50">({product.reviews})</span>
            <span className="inline-flex items-center gap-0.5 ml-1 text-emerald-400/90" title="Verified seller">
              <BadgeCheck className={`${compact ? "size-2.5" : "size-3"}`} />
            </span>
          </div>
          <button
            onClick={(e) => { e.preventDefault(); add(product.slug); }}
            className={`sm:hidden font-mono uppercase tracking-widest text-accent ${compact ? "text-[9px]" : "text-[10px]"}`}
          >
            Add +
          </button>
        </div>
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
      </Link>
    </div>
  );
}
