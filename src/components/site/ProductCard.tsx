import { Link } from "@tanstack/react-router";
import { memo, useState } from "react";
import { Heart, Plus, Check, Star } from "lucide-react";
import { type Product, discountPercent } from "@/lib/products";
import { useRegion } from "@/lib/region";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";
import { ProductCardAdminControls } from "@/components/admin/ProductCardAdminControls";
import { Price } from "@/components/site/Price";
import { ProductImage } from "@/components/site/ProductImage";

// New products created within this window get a "New" badge when no discount.
const NEW_WINDOW_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function isNewProduct(product: Product): boolean {
  const created = (product as { createdAt?: string | null }).createdAt;
  if (!created) return product.reviews === 0;
  const t = Date.parse(created);
  return Number.isFinite(t) && Date.now() - t < NEW_WINDOW_MS;
}

function ProductCardImpl({ product }: { product: Product; compact?: boolean }) {
  const { priceOf, compareOf, shippingFeeOf } = useRegion();
  const { add, items } = useCart();
  const { has, toggle } = useWishlist();
  const saved = has(product.slug);
  const [justAdded, setJustAdded] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
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
  const showNew = !discount && isNewProduct(product);

  return (
    <div className="group product-card-glass overflow-hidden relative flex flex-col h-full">
      <ProductCardAdminControls product={product} />

      {/* IMAGE — ~65-70% of card height via portrait ratio */}
      <Link to="/products/$slug" params={{ slug: product.slug }} className="block relative">
        <div className="relative aspect-[4/5] overflow-hidden bg-black/40">
          <ProductImage
            src={product.image}
            alt={`${product.name} — ${product.tagline || product.category}`}
            className="relative w-full h-full object-cover [transition:opacity_500ms_ease,transform_700ms_cubic-bezier(0.16,1,0.3,1)] sm:group-hover:scale-[1.05]"
          />

          {/* Essential badge — Discount OR New, top-left only */}
          {discount ? (
            <span className="absolute top-2.5 left-2.5 inline-flex items-center rounded-full bg-gradient-to-br from-accent to-[oklch(0.66_0.19_38)] text-black font-extrabold font-mono text-[11px] px-2.5 py-1 shadow-[var(--shadow-ember)] ring-1 ring-black/10">
              -{discount}%
            </span>
          ) : showNew ? (
            <span className="absolute top-2.5 left-2.5 inline-flex items-center rounded-full bg-white/90 text-black font-bold font-mono uppercase tracking-wider text-[10px] px-2.5 py-1 shadow-sm ring-1 ring-black/5">
              New
            </span>
          ) : null}

          {/* Free Shipping — the one other allowed badge, bottom-left */}
          {freeShipping && (
            <span className="absolute bottom-2.5 left-2.5 inline-flex items-center rounded-full bg-black/55 backdrop-blur-md text-emerald-300 font-semibold font-mono uppercase tracking-wider text-[9px] px-2 py-1 ring-1 ring-white/10">
              Free Shipping
            </span>
          )}

          {/* Wishlist — top-right glass button */}
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
            className={`absolute top-2.5 right-2.5 grid place-items-center size-8 rounded-full backdrop-blur-xl border shadow-lg shadow-black/40 transition-all duration-300 active:scale-90 ${
              justSaved ? "animate-[save-pulse_0.6s_ease-out]" : ""
            } ${
              saved
                ? "bg-accent/25 border-accent text-accent scale-110"
                : "bg-white/10 border-white/25 text-white hover:bg-accent/25 hover:border-accent hover:text-accent hover:scale-110"
            }`}
          >
            <Heart className={`size-3.5 transition-all duration-300 ${saved ? "fill-accent scale-110" : ""}`} />
          </button>
        </div>
      </Link>

      {/* INFO — generous spacing, clear hierarchy */}
      <Link
        to="/products/$slug"
        params={{ slug: product.slug }}
        className="relative flex flex-1 flex-col gap-2 px-3 pt-3 pb-3"
      >
        {/* Name — up to 2 lines */}
        <h4 className="text-[13px] font-semibold text-white leading-snug line-clamp-2 min-h-[2.4em] group-hover:text-accent transition-colors">
          {product.name}
        </h4>

        {/* Rating */}
        <div className="flex items-center gap-1 min-h-[14px]">
          {product.reviews > 0 ? (
            <>
              <Star className="size-3 fill-accent text-accent" />
              <span className="text-[11px] font-bold text-white tabular-nums">{product.rating.toFixed(1)}</span>
              <span className="text-[10px] font-mono text-muted-foreground/70">
                ({product.reviews.toLocaleString()})
              </span>
            </>
          ) : (
            <span className="text-[9px] font-mono uppercase tracking-wider text-emerald-400/90">New Product</span>
          )}
        </div>

        {/* Price — strongest element after image — and integrated Add button */}
        <div className="mt-auto pt-1 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <Price
              value={price}
              className="font-display font-extrabold text-white tabular-nums leading-none block text-[20px]"
            />
            {originalPrice && discount ? (
              <Price
                value={originalPrice}
                className="mt-1 font-mono text-muted-foreground/55 line-through tabular-nums block text-[10px]"
              />
            ) : null}
          </div>

          {product.inStock ? (
            <button
              onClick={handleAdd}
              aria-label={`Add ${product.name} to cart`}
              className={`relative shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 h-9 text-[12px] font-semibold border transition-all duration-300 active:scale-95 ${
                justAdded
                  ? "bg-emerald-500/90 border-emerald-400 text-black"
                  : "bg-accent/15 border-accent/40 text-accent hover:bg-accent hover:text-black hover:border-accent"
              }`}
            >
              {justAdded ? (
                <>
                  <Check className="size-4" /> Added
                </>
              ) : (
                <>
                  <Plus className="size-4" /> Add
                </>
              )}
              {cartQty > 0 && !justAdded && (
                <span className="absolute -top-1.5 -right-1.5 grid place-items-center min-w-[16px] h-4 px-1 rounded-full bg-black text-white text-[9px] font-bold tabular-nums border border-white/20">
                  {cartQty}
                </span>
              )}
            </button>
          ) : (
            <span
              onClick={(e) => e.preventDefault()}
              className="shrink-0 inline-flex items-center rounded-full bg-muted/40 border border-white/10 text-muted-foreground font-bold font-mono uppercase tracking-wider px-2.5 py-1.5 text-[9px]"
            >
              Sold Out
            </span>
          )}
        </div>
      </Link>
    </div>
  );
}

/**
 * Memoized so a card only re-renders when its own product, cart quantity, or
 * wishlist state changes — preventing whole-rail re-renders.
 */
export const ProductCard = memo(ProductCardImpl);
