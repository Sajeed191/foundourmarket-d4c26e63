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
import { detectAndroid } from "@/lib/use-low-end-device";


function ProductCardImpl({ product, context = "default", forceBadge }: { product: Product; compact?: boolean; context?: BadgeContext; forceBadge?: BadgeKey | null }) {
  const { priceOf, compareOf, shippingFeeOf } = useRegion();
  const { add, setQty, items } = useCart();
  const { has, toggle } = useWishlist();
  const saved = has(product.slug);
  const [justAdded, setJustAdded] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  // Decide the layout ONCE, synchronously, to avoid a post-mount swap that
  // would remount every card's DOM subtree right after hydration (jank + image
  // re-decode). On the server (no document) we render the rich card; on the
  // client we read the SSR-set `data-android` attribute so non-Android devices
  // never swap, and Android renders its lightweight static card from the start.
  const [renderMode] = useState<"static" | "rich">(() => {
    if (typeof document === "undefined") return "rich";
    const android =
      document.documentElement.getAttribute("data-android") === "true" || detectAndroid();
    return android ? "static" : "rich";
  });
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

  const allBadges = !forceBadge && assigned.length > 0 ? assigned : labels;
  const visibleBadges = allBadges.slice(0, 2);
  const extraBadges = Math.max(0, allBadges.length - 2);

  const androidStaticCard = (
      <article
        data-product-card
        data-android-static-card
        className="android-static-product-card flex h-full flex-col overflow-hidden rounded-[24px] border border-border bg-card shadow-[0_4px_20px_-12px_oklch(0_0_0/0.7)]"
      >
        <Link to="/products/$slug" params={{ slug: product.slug }} className="relative block p-3">
          <div data-product-media className="android-static-product-media relative aspect-square w-full overflow-hidden rounded-[18px] bg-white">
            <img
              data-product-image
              src={product.image}
              alt={`${product.name} — ${product.tagline || product.category}`}
              width={800}
              height={800}
              loading="lazy"
              decoding="sync"
              className="block h-full w-full object-contain"
            />
            {visibleBadges.length > 0 && (
              <div className="absolute left-2 top-2 flex flex-nowrap items-center gap-1">
                {visibleBadges.map((b) => (
                  <span
                    key={("assignmentId" in b ? b.assignmentId : undefined) ?? ("key" in b ? b.key : b.id)}
                    data-product-badge
                    className="inline-flex h-[19px] items-center gap-1 whitespace-nowrap rounded-full bg-accent/15 px-2 text-[10px] font-bold uppercase leading-none tracking-wide text-accent"
                  >
                    {b.emoji && <span aria-hidden>{b.emoji}</span>}
                    {b.label}
                  </span>
                ))}
                {extraBadges > 0 && (
                  <span data-product-badge className="inline-flex h-[19px] items-center whitespace-nowrap rounded-full bg-accent/15 px-2 text-[10px] font-bold leading-none text-accent">
                    +{extraBadges}
                  </span>
                )}
              </div>
            )}

            {/* Wishlist — top-right inside image */}
            <button
              onClick={(e) => {
                e.preventDefault();
                toggle(product.slug);
                if (!saved) setJustSaved(true);
                window.setTimeout(() => setJustSaved(false), 600);
              }}
              aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
              className={`absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-full border bg-black/45 ${saved ? "border-accent text-accent" : "border-white/25 text-white"}`}
            >
              <Heart className={`size-4 ${saved ? "fill-accent text-accent" : ""}`} />
            </button>

            {/* Quick view — bottom-right inside image */}
            <button
              onClick={(e) => { e.preventDefault(); setQuickOpen(true); }}
              aria-label={`Quick view ${product.name}`}
              className="absolute bottom-2 right-2 grid h-10 w-10 place-items-center rounded-full border border-white/25 bg-black/55 text-white"
            >
              <Eye className="size-4" />
            </button>
          </div>
        </Link>



        <div data-product-copy className="android-static-product-copy flex flex-1 flex-col px-3.5 pb-3.5 pt-3">
          <Link to="/products/$slug" params={{ slug: product.slug }} className="block">
            <h3 data-product-text className="product-typography product-title-text line-clamp-2 h-[2.6em] text-[16px] font-semibold leading-[1.3] text-foreground">
              {product.name}
            </h3>
          </Link>

          <div className="mt-2 flex h-[16px] items-center gap-2">
            {product.reviews > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Star className="size-3.5 fill-accent text-accent" />
                <span data-product-text className="product-typography product-rating-text text-[12px] font-semibold tabular-nums text-foreground">{product.rating.toFixed(1)}</span>
                <span data-product-text className="product-typography product-rating-text font-mono text-[11px] text-muted-foreground">({product.reviews.toLocaleString()})</span>
              </span>
            ) : (
              <span data-product-text className="product-typography product-rating-text text-[11px] font-medium text-accent">New Product</span>
            )}
            {product.soldCount > 0 && (
              <span data-product-text className="product-typography product-rating-text text-[10px] font-medium text-muted-foreground">🔥 {formatSold(product.soldCount)} sold</span>
            )}
          </div>

          <div className="mt-2 flex min-h-[40px] flex-col justify-center">
            <Price value={price} className="block font-display text-[32px] font-bold leading-none tabular-nums text-foreground" />
            {originalPrice && discount ? (
              <div className="mt-1.5 flex items-center gap-2">
                <Price value={originalPrice} className="block font-mono text-[12px] tabular-nums text-muted-foreground line-through" />
                <span data-product-text className="product-typography font-mono text-[12px] font-bold leading-none text-accent">{discount}% OFF</span>
              </div>
            ) : (
              <span aria-hidden data-product-text className="product-typography mt-1.5 block text-[12px] leading-none invisible">.</span>
            )}
          </div>

          <div className="mt-2.5 flex h-[16px] items-center justify-between gap-2">
            {freeShipping ? (
              <span data-product-text className="product-typography inline-flex items-center gap-1 text-[11px] font-medium text-emerald-300">
                <Check className="size-3" strokeWidth={2.5} /> Free Shipping
              </span>
            ) : product.returnEligible ? (
              <span data-product-text className="product-typography inline-flex items-center gap-1 text-[11px] font-medium text-emerald-300">
                <Check className="size-3" strokeWidth={2.5} /> Easy Returns
              </span>
            ) : (
              <span aria-hidden data-product-text className="product-typography text-[11px]">&nbsp;</span>
            )}
            {lowStock ? (
              <span data-product-text className="product-typography text-[11px] font-semibold text-orange-300">⚠ Only {product.stockQuantity} left</span>
            ) : product.inStock ? (
              <span data-product-text className="product-typography text-[11px] font-medium text-muted-foreground">In Stock</span>
            ) : null}
          </div>

          <div className="mt-3.5">
            {!product.inStock ? (
              <span data-product-text className="product-typography inline-flex h-[52px] w-full items-center justify-center rounded-full border border-border bg-muted font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Sold Out
              </span>
            ) : cartQty > 0 && !justAdded ? (
              <div className="flex h-[52px] w-full items-center justify-between rounded-full border border-accent/40 bg-accent/10 px-2">
                <button onClick={(e) => { e.preventDefault(); setQty(product.slug, cartQty - 1); }} aria-label="Decrease quantity" className="grid size-10 place-items-center rounded-full text-accent">
                  <Minus className="size-4" strokeWidth={2.5} />
                </button>
                <span data-product-text className="product-typography min-w-7 text-center text-base font-bold tabular-nums text-foreground">{cartQty}</span>
                <button onClick={(e) => { e.preventDefault(); setQty(product.slug, cartQty + 1); }} aria-label="Increase quantity" className="grid size-10 place-items-center rounded-full text-accent">
                  <Plus className="size-4" strokeWidth={2.5} />
                </button>
              </div>
            ) : (
              <button
                onClick={handleAdd}
                aria-label={`Add ${product.name} to cart`}
                className={`product-typography inline-flex h-[52px] w-full items-center justify-center gap-1.5 rounded-full text-[15px] font-bold ${justAdded ? "bg-emerald-500 text-black" : "bg-accent text-accent-foreground"}`}
              >
                {justAdded ? <><Check className="size-5" /> Added</> : <><Plus className="size-5" strokeWidth={2.75} /> Add to Cart</>}
              </button>
            )}
          </div>

        </div>
      </article>
  );

  if (renderMode === "static") return androidStaticCard;

  const richCard = (
      <div
      data-product-card
      data-android-rich-card
      className={`group product-card-shell relative flex h-full flex-col overflow-visible rounded-[24px] border bg-card transition-[box-shadow,border-color] duration-300 ${
        isPremium
          ? "border-accent/45 shadow-[0_8px_30px_-12px_oklch(0.72_0.18_55/0.45)] sm:group-hover:shadow-[0_16px_44px_-12px_oklch(0.72_0.18_55/0.6)]"
          : "border-accent/15 shadow-[0_4px_24px_-14px_oklch(0_0_0/0.7)] sm:group-hover:border-accent/35 sm:group-hover:shadow-[0_14px_40px_-14px_oklch(0.72_0.18_55/0.4)]"
      }`}
    >
      <ProductCardAdminControlsGate product={product} />

      {/* IMAGE */}
      <Link to="/products/$slug" params={{ slug: product.slug }} className="relative block p-3">
        <div data-product-media className="relative aspect-square overflow-hidden rounded-[18px] bg-white">
          <ProductImage
            src={product.image}
            alt={`${product.name} — ${product.tagline || product.category}`}
            className="relative h-full w-full object-contain transition-opacity duration-500"
          />

          {/* Top-left — inside a dedicated section (forceBadge) show ONLY that
              section's single badge; elsewhere admin-assigned custom badges take
              priority, else auto badges. Compact horizontal pills, max 3 + overflow. */}
          {!forceBadge && assigned.length > 0 ? (
            <div className="absolute left-2 top-2 flex flex-nowrap items-center gap-1">
              {assigned.slice(0, 3).map((b) => (
                <span
                  key={b.assignmentId ?? b.id}
                  data-product-badge
                  className={`inline-flex h-[19px] animate-[fade-in_0.4s_ease-out] items-center gap-1 whitespace-nowrap rounded-full px-2 text-[10px] font-bold uppercase leading-none tracking-wide shadow-sm shadow-black/30 ${badgeAnimationClass(b.animation)}`}
                  style={{
                    backgroundColor: b.backgroundColor || b.color,
                    color: b.textColor,
                    border: b.borderColor ? `1px solid ${b.borderColor}` : undefined,
                  }}
                >
                  {b.emoji && <span aria-hidden>{b.emoji}</span>}
                  {b.label}
                </span>
              ))}
              {assigned.length > 3 && (
                <span data-product-badge className="inline-flex h-[19px] items-center whitespace-nowrap rounded-full bg-accent/15 px-2 text-[10px] font-bold leading-none text-accent">+{assigned.length - 3}</span>
              )}
            </div>
          ) : labels.length > 0 ? (
            <div className="absolute left-2 top-2 flex flex-nowrap items-center gap-1">
              {labels.slice(0, 3).map((b) => (
                <span
                  key={b.key}
                  data-product-badge
                  className={`inline-flex h-[19px] animate-[fade-in_0.4s_ease-out] items-center gap-1 whitespace-nowrap rounded-full px-2 text-[10px] font-bold uppercase leading-none tracking-wide shadow-sm shadow-black/30 ${b.className}`}
                >
                  <span aria-hidden>{b.emoji}</span>
                  {b.label}
                </span>
              ))}
              {labels.length > 3 && (
                <span data-product-badge className="inline-flex h-[19px] items-center whitespace-nowrap rounded-full bg-accent/15 px-2 text-[10px] font-bold leading-none text-accent">+{labels.length - 3}</span>
              )}
            </div>
          ) : null}


          {/* Wishlist — top-right, circular 40px */}
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
            className={`absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-full border shadow-lg shadow-black/30 transition-colors duration-300 ${
              justSaved ? "animate-[save-pulse_0.6s_ease-out]" : ""
            } ${
              saved
                ? "border-accent bg-accent/25 text-accent"
                : "border-white/30 bg-black/45 text-white hover:border-accent hover:bg-accent/25 hover:text-accent"
            }`}
          >
            <Heart className={`size-4 transition-colors duration-300 ${saved ? "fill-accent" : ""}`} />
          </button>

          {/* Quick view — bottom-right, circular 40px */}
          <button
            onClick={(e) => {
              e.preventDefault();
              setQuickOpen(true);
            }}
            aria-label={`Quick view ${product.name}`}
            className="absolute bottom-2 right-2 grid h-10 w-10 place-items-center rounded-full border border-white/30 bg-black/55 text-white shadow-lg shadow-black/30 transition-colors duration-300 hover:border-accent hover:text-accent sm:opacity-0 sm:group-hover:opacity-100"
          >
            <Eye className="size-4" />
          </button>
        </div>
      </Link>


      {/* INFO */}
        <div data-product-copy className="product-copy flex flex-1 flex-col px-3.5 pb-3.5 pt-3">
        <Link to="/products/$slug" params={{ slug: product.slug }} className="block">
          {/* Title — max 2 lines */}
          <h3 data-product-text className="product-typography product-title-text line-clamp-2 h-[2.6em] text-[16px] font-semibold leading-[1.3] text-foreground transition-colors group-hover:text-accent">
            {product.name}
          </h3>
        </Link>

        {/* Rating + social proof */}
        <div className="product-meta-flow mt-2 flex h-[16px] items-center gap-2">
          {product.reviews > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Star className="size-3.5 fill-accent text-accent" />
              <span data-product-text className="product-typography product-rating-text text-[12px] font-semibold tabular-nums text-foreground">{product.rating.toFixed(1)}</span>
              <span data-product-text className="product-typography product-rating-text font-mono text-[11px] text-muted-foreground">({product.reviews.toLocaleString()})</span>
            </span>
          ) : (
            <span data-product-text className="product-typography product-rating-text text-[11px] font-medium text-accent">New Product</span>
          )}
          {product.soldCount > 0 && (
            <span data-product-text className="product-typography product-rating-text text-[10px] font-medium text-muted-foreground">🔥 {formatSold(product.soldCount)} sold</span>
          )}
        </div>

        {/* Price */}
        <div className="product-price-flow mt-2 flex min-h-[40px] flex-col justify-center">
          <Price
            value={price}
            className="block font-display text-[32px] font-bold leading-none tabular-nums text-foreground"
          />
          {originalPrice && discount ? (
            <div className="mt-1.5 flex items-center gap-2">
              <Price value={originalPrice} className="block font-mono text-[12px] tabular-nums text-muted-foreground line-through" />
              <span data-product-text className="product-typography product-price-text font-mono text-[12px] font-bold leading-none text-accent">{discount}% OFF</span>
            </div>
          ) : (
            <span aria-hidden data-product-text className="product-typography mt-1.5 block text-[12px] leading-none invisible">.</span>
          )}
        </div>


        {/* Trust + stock — single line each, height reserved */}
        <div className="mt-2.5 flex h-[16px] items-center justify-between gap-2">
          {freeShipping ? (
            <span data-product-text className="product-typography inline-flex items-center gap-1 text-[11px] font-medium text-emerald-300">
              <Check className="size-3" strokeWidth={2.5} /> Free Shipping
            </span>
          ) : product.returnEligible ? (
            <span data-product-text className="product-typography inline-flex items-center gap-1 text-[11px] font-medium text-emerald-300">
              <Check className="size-3" strokeWidth={2.5} /> Easy Returns
            </span>
          ) : (
            <span aria-hidden data-product-text className="product-typography text-[11px]">&nbsp;</span>
          )}
          {lowStock ? (
            <span data-product-text className="product-typography text-[11px] font-semibold text-orange-300">⚠ Only {product.stockQuantity} left</span>
          ) : product.inStock ? (
            <span data-product-text className="product-typography text-[11px] font-medium text-muted-foreground">In Stock</span>
          ) : null}
        </div>

        {/* Add to cart — 52px; switches to quantity selector once in cart */}
        <div className="mt-3.5">
          {!product.inStock ? (
            <span data-product-text className="product-typography inline-flex h-[52px] w-full items-center justify-center rounded-full border border-white/10 bg-muted/40 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Sold Out
            </span>
          ) : cartQty > 0 && !justAdded ? (
            <div className="flex h-[52px] w-full items-center justify-between rounded-full border border-accent/40 bg-accent/10 px-2">
              <button
                onClick={(e) => { e.preventDefault(); setQty(product.slug, cartQty - 1); }}
                aria-label="Decrease quantity"
                className="grid size-10 place-items-center rounded-full text-accent transition-colors hover:bg-accent/15"
              >
                <Minus className="size-4" strokeWidth={2.5} />
              </button>
              <span data-product-text className="product-typography min-w-7 text-center text-base font-bold tabular-nums text-foreground">{cartQty}</span>
              <button
                onClick={(e) => { e.preventDefault(); setQty(product.slug, cartQty + 1); }}
                aria-label="Increase quantity"
                className="grid size-10 place-items-center rounded-full text-accent transition-colors hover:bg-accent/15"
              >
                <Plus className="size-4" strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <button
              onClick={handleAdd}
              aria-label={`Add ${product.name} to cart`}
              className={`product-typography relative inline-flex h-[52px] w-full items-center justify-center gap-1.5 overflow-hidden rounded-full text-[15px] font-bold duration-200 ${
                justAdded
                  ? "bg-emerald-500 text-black"
                  : "bg-accent text-accent-foreground hover:brightness-[1.05]"
              }`}
            >
              {justAdded ? (
                <><Check className="size-5" /> Added</>
              ) : (
                <><Plus className="size-5" strokeWidth={2.75} /> Add to Cart</>
              )}
            </button>
          )}
        </div>

      </div>

      <QuickViewDialog product={product} open={quickOpen} onOpenChange={setQuickOpen} />
      </div>
  );

  return richCard;
}

/**
 * Memoized so a card only re-renders when its own product, cart quantity, or
 * wishlist state changes — preventing whole-rail re-renders.
 */
export const ProductCard = memo(ProductCardImpl);
