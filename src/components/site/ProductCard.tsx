import { Link } from "@tanstack/react-router";
import { memo, useState } from "react";
import { Heart, Plus, Check, Star, Minus, Eye } from "lucide-react";
import { type Product, discountPercent } from "@/lib/products";
import { type BadgeKey } from "@/lib/badges";
import { useVisibleBadges, type BadgeContext } from "@/lib/badge-visibility";
import { useProductBadges, badgeAnimationClass } from "@/lib/use-product-badges";
import { useRegion } from "@/lib/region";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";
import { ProductCardAdminControlsGate } from "@/components/admin/ProductCardAdminControlsGate";
import { Price } from "@/components/site/Price";
import { ProductImage } from "@/components/site/ProductImage";
import { QuickViewDialog } from "@/components/site/QuickViewDialog";
import { formatSold } from "@/lib/format-sold";


function ProductCardImpl({ product, context = "default", forceBadge }: { product: Product; compact?: boolean; context?: BadgeContext; forceBadge?: BadgeKey | null }) {
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
  // Surface-aware badge visibility: each section applies its own policy (max 3
  // badges, Best Seller/Trending priority, 24h-rotating extra badge, Flash/Hot
  // hidden unless the product is in the active rotation). A forced badge shows
  // only that single section badge.
  const labels = useVisibleBadges(product, context, forceBadge);
  // Admin-assigned custom badges (Badge Manager / Bulk Badges) take priority on
  // the storefront so staff badge work is visible to every shopper.
  const assigned = useProductBadges(product.slug);
  const isPremium = labels.some((b) => b.key === "premium");
  const lowStock = product.inStock && product.stockQuantity > 0 && product.stockQuantity <= product.lowStockThreshold;

  return (
    <div
      data-product-card
      className={`group product-card-shell relative flex h-full flex-col overflow-hidden rounded-[22px] border bg-card transition-[box-shadow,border-color] duration-300 ${
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
            className="relative h-full w-full object-cover transition-opacity duration-500"
          />

          {/* Premium fade overlay */}
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-80" />

          {/* Top-left — inside a dedicated section (forceBadge) show ONLY that
              section's single badge; elsewhere admin-assigned custom badges take
              priority, else auto badges (max 3). */}
          {!forceBadge && assigned.length > 0 ? (
            <div className="absolute left-2 top-2 flex flex-col items-start gap-0.5 md:gap-1 lg:gap-1.5">
              {assigned.slice(0, 3).map((b) => (
                <span
                  key={b.assignmentId ?? b.id}
                  data-product-badge
                  className={`inline-flex animate-[fade-in_0.4s_ease-out] items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[7px] font-semibold uppercase leading-none tracking-wide shadow-sm shadow-black/30 md:gap-1 md:px-2 md:py-[3px] md:text-[8px] lg:gap-1.5 lg:px-3 lg:py-1 lg:text-sm ${badgeAnimationClass(b.animation)}`}
                  style={{
                    backgroundColor: b.backgroundColor || b.color,
                    color: b.textColor,
                    border: b.borderColor ? `1px solid ${b.borderColor}` : undefined,
                  }}
                >
                  {b.emoji && <span aria-hidden className="text-[8px] md:text-[9px] lg:text-[15px]">{b.emoji}</span>}
                  {b.label}
                </span>
              ))}
            </div>
          ) : labels.length > 0 ? (
            <div className="absolute left-2 top-2 flex flex-col items-start gap-0.5 md:gap-1 lg:gap-1.5">
              {labels.map((b) => (
                <span
                  key={b.key}
                  data-product-badge
                  className={`inline-flex animate-[fade-in_0.4s_ease-out] items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[7px] font-semibold uppercase leading-none tracking-wide shadow-sm shadow-black/30 md:gap-1 md:px-2 md:py-[3px] md:text-[8px] lg:gap-1.5 lg:px-3 lg:py-1 lg:text-sm ${b.className}`}
                >
                  <span aria-hidden className="text-[8px] md:text-[9px] lg:text-[15px]">{b.emoji}</span>
                  {b.label}
                </span>
              ))}
            </div>
          ) : null}

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
            className={`absolute right-3 top-3 grid size-7 place-items-center rounded-full border shadow-lg shadow-black/40 transition-colors duration-300 ${
              justSaved ? "animate-[save-pulse_0.6s_ease-out]" : ""
            } ${
              saved
                ? "border-accent bg-accent/25 text-accent"
                : "border-white/25 bg-black/40 text-white hover:border-accent hover:bg-accent/25 hover:text-accent"
            }`}
          >
            <Heart className={`size-3.5 transition-colors duration-300 ${saved ? "fill-accent" : ""}`} />
          </button>

          {/* Quick view — reveals on hover (desktop) / always tappable (mobile) */}
          <button
            onClick={(e) => {
              e.preventDefault();
              setQuickOpen(true);
            }}
            aria-label={`Quick view ${product.name}`}
            className="absolute bottom-3 right-3 grid size-7 place-items-center rounded-full border border-white/25 bg-black/65 text-white shadow-lg shadow-black/40 transition-colors duration-300 hover:border-accent hover:text-accent sm:opacity-0 sm:group-hover:opacity-100"
          >
            <Eye className="size-3.5" />
          </button>
        </div>
      </Link>

      {/* INFO */}
        <div data-product-copy className="product-copy relative flex flex-1 flex-col px-3 pb-3 pt-2">
        <Link to="/products/$slug" params={{ slug: product.slug }} className="block">
          {/* Title — max 2 lines */}
          <h3 className="product-typography product-title-text line-clamp-2 h-[2.6em] text-[15px] font-semibold leading-[1.3] text-foreground transition-colors group-hover:text-accent">
            {product.name}
          </h3>
        </Link>

        {/* Rating + social proof */}
        <div className="product-meta-flow mt-1 flex h-[16px] items-center gap-2">
          {product.reviews > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Star className="size-3.5 fill-accent text-accent" />
              <span className="product-typography product-rating-text text-[12px] font-semibold tabular-nums text-foreground">{product.rating.toFixed(1)}</span>
              <span className="product-typography product-rating-text font-mono text-[10px] text-muted-foreground">({product.reviews.toLocaleString()})</span>
            </span>
          ) : (
            <span className="product-typography product-rating-text text-[11px] font-medium text-accent">New Product</span>
          )}
          {product.soldCount > 0 && (
            <span className="product-typography product-rating-text text-[10px] font-medium text-muted-foreground">🔥 {formatSold(product.soldCount)} sold</span>
          )}
        </div>

        {/* Price */}
        <div className="product-price-flow mt-1.5 flex min-h-[34px] flex-col justify-center">
          <Price
            value={price}
            className="block font-display text-[20px] font-bold leading-none tabular-nums text-foreground"
          />
          {originalPrice && discount ? (
            <span className="mt-1 flex items-center gap-1.5 leading-none">
              <Price value={originalPrice} className="block font-mono text-[10px] tabular-nums text-muted-foreground line-through" />
              <span className="product-typography product-price-text font-mono text-[10px] font-semibold text-accent">{discount}% OFF</span>
            </span>
          ) : (
            <span aria-hidden className="product-typography mt-1 block text-[10px] leading-none invisible">.</span>
          )}
        </div>

        {/* Trust + stock — single line each, height reserved */}
        <div className="mt-1.5 flex h-[16px] items-center justify-between gap-2">
          {freeShipping ? (
            <span className="product-typography inline-flex items-center gap-1 text-[10px] font-medium text-emerald-300">
              <Check className="size-3" strokeWidth={2.5} /> Free Shipping
            </span>
          ) : product.returnEligible ? (
            <span className="product-typography inline-flex items-center gap-1 text-[10px] font-medium text-emerald-300">
              <Check className="size-3" strokeWidth={2.5} /> Easy Returns
            </span>
          ) : (
            <span aria-hidden className="product-typography text-[10px]">&nbsp;</span>
          )}
          {lowStock ? (
            <span className="product-typography text-[10px] font-semibold text-orange-300">⚠ Only {product.stockQuantity} left</span>
          ) : product.inStock ? (
            <span className="product-typography text-[10px] font-medium text-muted-foreground">In Stock</span>
          ) : null}
        </div>

        {/* Add to cart — 48px; switches to quantity selector once in cart */}
        <div className="mt-2.5">
          {!product.inStock ? (
            <span className="product-typography inline-flex h-12 w-full items-center justify-center rounded-full border border-white/10 bg-muted/40 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Sold Out
            </span>
          ) : cartQty > 0 && !justAdded ? (
            <div className="flex h-12 w-full items-center justify-between rounded-full border border-accent/40 bg-accent/10 px-1.5">
              <button
                onClick={(e) => { e.preventDefault(); setQty(product.slug, cartQty - 1); }}
                aria-label="Decrease quantity"
                className="grid size-9 place-items-center rounded-full text-accent transition-colors hover:bg-accent/15"
              >
                <Minus className="size-4" strokeWidth={2.5} />
              </button>
              <span className="product-typography min-w-7 text-center text-sm font-bold tabular-nums text-foreground">{cartQty}</span>
              <button
                onClick={(e) => { e.preventDefault(); setQty(product.slug, cartQty + 1); }}
                aria-label="Increase quantity"
                className="grid size-9 place-items-center rounded-full text-accent transition-colors hover:bg-accent/15"
              >
                <Plus className="size-4" strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <button
              onClick={handleAdd}
              aria-label={`Add ${product.name} to cart`}
              className={`product-typography relative inline-flex h-12 w-full items-center justify-center gap-1.5 overflow-hidden rounded-full text-[13px] font-semibold duration-200 ${
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
