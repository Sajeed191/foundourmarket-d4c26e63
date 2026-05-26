import { Link } from "@tanstack/react-router";
import { Heart, Star, Plus } from "lucide-react";
import type { Product } from "@/lib/products";
import { useRegion } from "@/lib/region";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";

export function ProductCard({ product }: { product: Product }) {
  const { format } = useRegion();
  const { add } = useCart();
  const { has, toggle } = useWishlist();
  const saved = has(product.slug);
  const originalPrice = product.discount ? product.price * (1 + product.discount / 100) : null;

  return (
    <div className="group card-premium p-2.5 sm:p-3 overflow-hidden relative">
      {/* Ember halo on hover */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-[inherit] opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-0"
        style={{ background: "var(--gradient-ember-soft)", filter: "blur(20px)" }}
      />

      <Link to="/products/$slug" params={{ slug: product.slug }} className="block relative">
        <div className="relative aspect-square mb-3 sm:mb-4 rounded-xl overflow-hidden bg-black/40">
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

          <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5 items-start">
            {product.featured && (
              <span className="backdrop-blur-md bg-white/10 border border-white/15 text-white text-[10px] font-semibold font-mono px-2 py-0.5 rounded-full tracking-wider">
                FEATURED
              </span>
            )}
            {product.discount && (
              <span className="bg-accent text-accent-foreground text-[10px] font-bold font-mono px-2 py-0.5 rounded-full shadow-[var(--shadow-ember)]">
                −{product.discount}%
              </span>
            )}
          </div>

          <button
            onClick={(e) => { e.preventDefault(); toggle(product.slug); }}
            aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
            className={`absolute top-2.5 right-2.5 size-8 grid place-items-center rounded-full backdrop-blur-md border transition-all duration-300 ${
              saved
                ? "bg-accent/20 border-accent/50 text-accent scale-110"
                : "bg-black/40 border-white/10 text-white/80 hover:bg-accent/20 hover:border-accent/50 hover:text-accent hover:scale-110"
            }`}
          >
            <Heart className={`size-3.5 transition-all ${saved ? "fill-accent" : ""}`} />
          </button>

          {/* Quick add — slides up on hover (desktop) */}
          <button
            onClick={(e) => { e.preventDefault(); add(product.slug); }}
            className="hidden sm:flex absolute inset-x-2.5 bottom-2.5 items-center justify-center gap-1.5 py-2 rounded-xl bg-accent text-accent-foreground text-[11px] font-semibold uppercase tracking-wider opacity-0 translate-y-3 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 hover:brightness-110 shadow-[var(--shadow-ember)]"
          >
            <Plus className="size-3.5" /> Quick Add
          </button>
        </div>
      </Link>

      <Link to="/products/$slug" params={{ slug: product.slug }} className="block px-1 relative">
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="font-medium text-sm truncate group-hover:text-accent transition-colors">{product.name}</h4>
            <p className="text-[11px] text-muted-foreground truncate">{product.tagline}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-display font-semibold text-sm tabular-nums">{format(product.price)}</p>
            {originalPrice && (
              <p className="text-[10px] font-mono text-muted-foreground/70 line-through tabular-nums">{format(originalPrice)}</p>
            )}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
            <Star className="size-3 fill-accent text-accent" />
            <span className="text-foreground/80">{product.rating}</span>
            <span className="opacity-50">({product.reviews})</span>
          </div>
          <button
            onClick={(e) => { e.preventDefault(); add(product.slug); }}
            className="sm:hidden text-[10px] font-mono uppercase tracking-widest text-accent"
          >
            Add +
          </button>
        </div>
      </Link>
    </div>
  );
}
