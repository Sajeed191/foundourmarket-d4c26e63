import { Link } from "@tanstack/react-router";
import { memo, useState } from "react";
import { Heart, Plus, Check, Star, Minus, Eye } from "lucide-react";
import { type Product, discountPercent } from "@/lib/products";
import { computeBadges, singleBadge, DEFAULT_BADGE_SETTINGS, type BadgeKey } from "@/lib/badges";
import { useRegion } from "@/lib/region";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";
import { ProductCardAdminControlsGate } from "@/components/admin/ProductCardAdminControlsGate";
import { Price } from "@/components/site/Price";
import { ProductImage } from "@/components/site/ProductImage";
import { QuickViewDialog } from "@/components/site/QuickViewDialog";
import { formatSold } from "@/lib/format-sold";

/** Premium card: show at most two badges for a luxury marketplace feel. */
const MAX_BADGES = 2;

function ProductCardImpl({ product, forceBadge }: { product: Product; compact?: boolean; forceBadge?: BadgeKey | null }) {
  const { priceOf, compareOf, shippingFeeOf } = useRegion();
  const { add, setQty, items } = useCart();
  const { has, toggle } = useWishlist();
  const saved = has(product.slug);
  const [justAdded, setJustAdded] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const cartQty = items.find((i) => i.slug === product.slug)?.qty ?? 0;

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    add(product.slug);
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 800);
  };

  const price = priceOf(product);
  const originalPrice =
    compareOf(product) ?? (product.discount ? price * (1 + product.discount / 100) : null);
  const discount = discountPercent(price, originalPrice);
  const shippingFee = shippingFeeOf(product);
  const freeShipping = shippingFee <= 0;
  // In a dedicated section (Trending, Best Sellers, New Arrivals, Premium) show
  // ONLY that section's badge to avoid badge overload. Elsewhere show the full
  // computed set.
  const labels = forceBadge
    ? [singleBadge(forceBadge)]
    : computeBadges(product, DEFAULT_BADGE_SETTINGS, MAX_BADGES);
  const isPremium = labels.some((b) => b.key === "premium");
  const lowStock = product.inStock && product.stockQuantity > 0 && product.stockQuantity <= product.lowStockThreshold;

  return (
    <div
      className={`group relative flex h-full flex-col overflow-hidden rounded-[22px] border bg-card/40 backdrop-blur-xl transition-[transform,box-shadow,border-color] duration-300 will-change-transform active:scale-[0.99] sm:hover:scale-[1.02] ${
        isPremium
          ? "border-accent/45 shadow-[0_8px_30px_-12px_oklch(0.72_0.18_55/0.45)] sm:group-hover:shadow-[0_16px_44px_-12px_oklch(0.72_0.18_55/0.6)]"
          : "border-accent/15 shadow-[0_4px_24px_-14px_oklch(0_0_0/0.7)] sm:group-hover:border-accent/35 sm:group-hover:shadow-[0_14px_40px_-14px_oklch(0.72_0.18_55/0.4)]"
      }`}
    >
      <ProductCardAdminControlsGate product={product} />

      {/* IMAGE — ~55% of card height */}
      <Link to="/products/$slug" params={{ slug: product.slug }} className="relative block">
        <div className="relative aspect-[4/3] overflow-hidden bg-black/40">
          <ProductImage
            src={product.image}
            alt={`${product.name} — ${product.tagline || product.category}`}
            className="relative h-full w-full object-cover [transition:opacity_500ms_ease,transform_700ms_cubic-bezier(0.16,1,0.3,1)] sm:group-hover:scale-[1.08]"
          />

          {/* Premium fade overlay */}
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-80" />

          {/* Top-left — up to two badges */}
          {labels.length > 0 && (
            <div className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1">
              {labels.map((b) => (
                <span
                  key={b.key}
                  className={`inline-flex animate-[fade-in_0.4s_ease-out] items-center gap-1 rounded-full px-2 py-1 text-[9px] font-semibold uppercase leading-none tracking-wide shadow-sm shadow-black/30 backdrop-blur-sm ${b.className}`}
                >
                  <span aria-hidden>{b.emoji}</span>
                  {b.label}
                </span>
              ))}
            </div>
          )}

          {/* Wishlist — smaller, inset, glass */}
          <button
            onClick={(e) => {
              e.preventDefault();
              toggle(product.slug);
              if (!saved) {
                setJustSaved(true);
                window.setTimeout(() => setJustSaved(false), 600);
              }
            }}
            aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
            className={`absolute right-3 top-3 grid size-7 place-items-center rounded-full border shadow-lg shadow-black/40 backdrop-blur-xl transition-all duration-300 active:scale-90 ${
              justSaved ? "animate-[save-pulse_0.6s_ease-out]" : ""
            } ${
              saved
                ? "scale-110 border-accent bg-accent/25 text-accent"
                : "border-white/25 bg-white/10 text-white hover:scale-110 hover:border-accent hover:bg-accent/25 hover:text-accent"
            }`}
          >
            <Heart className={`size-3.5 transition-all duration-300 ${saved ? "scale-110 fill-accent" : ""}`} />
          </button>

          {/* Quick view — reveals on hover (desktop) / always tappable (mobile) */}
          <button
            onClick={(e) => {
              e.preventDefault();
              setQuickOpen(true);
            }}
            aria-label={`Quick view ${product.name}`}
            className="absolute bottom-3 right-3 grid size-7 place-items-center rounded-full border border-white/25 bg-black/45 text-white shadow-lg shadow-black/40 backdrop-blur-xl transition-all duration-300 hover:border-accent hover:text-accent active:scale-90 sm:translate-y-2 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100"
          >
            <Eye className="size-3.5" />
          </button>
        </div>
      </Link>

      {/* INFO */}
      <div className="relative flex flex-1 flex-col px-3 pb-3 pt-2">
        <Link to="/products/$slug" params={{ slug: product.slug }} className="block">
          {/* Title — max 2 lines */}
          <h4 className="line-clamp-2 h-[2.6em] text-[15px] font-semibold leading-[1.3] tracking-[-0.01em] text-foreground/95 transition-colors group-hover:text-accent">
            {product.name}
          </h4>
        </Link>

        {/* Rating + social proof */}
        <div className="mt-1 flex h-[16px] items-center gap-2">
          {product.reviews > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Star className="size-3.5 fill-accent text-accent" />
              <span className="text-[12px] font-semibold tabular-nums text-foreground">{product.rating.toFixed(1)}</span>
              <span className="font-mono text-[10px] text-muted-foreground/70">({product.reviews.toLocaleString()})</span>
            </span>
          ) : (
            <span className="text-[11px] font-medium text-accent/90">New Product</span>
          )}
          {product.soldCount > 0 && (
            <span className="text-[10px] font-medium text-muted-foreground/80">🔥 {formatSold(product.soldCount)} sold</span>
          )}
        </div>

        {/* Price */}
        <div className="mt-1.5 flex min-h-[34px] flex-col justify-center">
          <Price
            value={price}
            className="block font-display text-[20px] font-bold leading-none tracking-[-0.02em] tabular-nums text-foreground"
          />
          {originalPrice && discount ? (
            <span className="mt-1 flex items-center gap-1.5 leading-none">
              <Price value={originalPrice} className="block font-mono text-[10px] tabular-nums text-muted-foreground/55 line-through" />
              <span className="font-mono text-[10px] font-semibold text-accent">{discount}% OFF</span>
            </span>
          ) : (
            <span aria-hidden className="mt-1 block text-[10px] leading-none invisible">.</span>
          )}
        </div>

        {/* Trust + stock — single line each, height reserved */}
        <div className="mt-1.5 flex h-[16px] items-center justify-between gap-2">
          {freeShipping ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-300/90">
              <Check className="size-3" strokeWidth={2.5} /> Free Shipping
            </span>
          ) : product.returnEligible ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-300/90">
              <Check className="size-3" strokeWidth={2.5} /> Easy Returns
            </span>
          ) : (
            <span aria-hidden className="text-[10px]">&nbsp;</span>
          )}
          {lowStock ? (
            <span className="text-[10px] font-semibold text-orange-300">⚠ Only {product.stockQuantity} left</span>
          ) : product.inStock ? (
            <span className="text-[10px] font-medium text-muted-foreground/70">In Stock</span>
          ) : null}
        </div>

        {/* Add to cart — 48px; switches to quantity selector once in cart */}
        <div className="mt-2.5">
          {!product.inStock ? (
            <span className="inline-flex h-12 w-full items-center justify-center rounded-full border border-white/10 bg-muted/40 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Sold Out
            </span>
          ) : cartQty > 0 && !justAdded ? (
            <div className="flex h-12 w-full items-center justify-between rounded-full border border-accent/40 bg-accent/10 px-1.5">
              <button
                onClick={(e) => { e.preventDefault(); setQty(product.slug, cartQty - 1); }}
                aria-label="Decrease quantity"
                className="grid size-9 place-items-center rounded-full text-accent transition-colors hover:bg-accent/15 active:scale-90"
              >
                <Minus className="size-4" strokeWidth={2.5} />
              </button>
              <span className="min-w-7 text-center text-sm font-bold tabular-nums text-white">{cartQty}</span>
              <button
                onClick={(e) => { e.preventDefault(); setQty(product.slug, cartQty + 1); }}
                aria-label="Increase quantity"
                className="grid size-9 place-items-center rounded-full text-accent transition-colors hover:bg-accent/15 active:scale-90"
              >
                <Plus className="size-4" strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <button
              onClick={handleAdd}
              aria-label={`Add ${product.name} to cart`}
              className={`relative inline-flex h-12 w-full items-center justify-center gap-1.5 overflow-hidden rounded-full text-[13px] font-semibold tracking-[-0.01em] transition-transform duration-200 active:scale-[0.97] ${
                justAdded
                  ? "bg-emerald-500 text-black"
                  : "bg-[linear-gradient(135deg,oklch(0.80_0.18_58),oklch(0.68_0.20_42))] text-black shadow-[var(--shadow-ember)] hover:brightness-[1.05]"
              }`}
            >
              {justAdded ? (
                <><Check className="size-4" /> Added</>
              ) : (
                <><Plus className="size-4" strokeWidth={2.5} /> Add to Cart</>
              )}
            </button>
          )}
        </div>
      </div>

      <QuickViewDialog product={product} open={quickOpen} onOpenChange={setQuickOpen} />
    </div>
  );
}

/**
 * Memoized so a card only re-renders when its own product, cart quantity, or
 * wishlist state changes — preventing whole-rail re-renders.
 */
export const ProductCard = memo(ProductCardImpl);
