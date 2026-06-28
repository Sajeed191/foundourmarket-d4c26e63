import { Link } from "@tanstack/react-router";
import { memo, useCallback, useMemo, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { Heart, Plus, Check, Star, Minus, Eye } from "lucide-react";
import { type Product, discountPercent } from "@/lib/products";
import { type BadgeKey } from "@/lib/badges";
import { useVisibleBadges, type BadgeContext } from "@/lib/badge-visibility";
import { useProductBadges, type RenderBadge } from "@/lib/use-product-badges";
import { useRegion } from "@/lib/region";
import { useCartActions, useCartQty } from "@/lib/cart";
import { useWishlistActions, useWishlistSaved } from "@/lib/wishlist";
import { ProductCardAdminControlsGate } from "@/components/admin/ProductCardAdminControlsGate";
import { Price } from "@/components/site/Price";
import { ProductImage } from "@/components/site/ProductImage";
import { QuickViewDialog } from "@/components/site/QuickViewDialog";
import { formatSold } from "@/lib/format-sold";

type ProductCardProps = {
  product: Product;
  compact?: boolean;
  context?: BadgeContext;
  forceBadge?: BadgeKey | null;
  priority?: boolean;
};

type CardBadge = {
  id: string;
  label: string;
  emoji?: string;
  className?: string;
  style?: CSSProperties;
};

export function productIdentity(product: Product): string {
  return product.id || product.slug;
}

/* Exactly two lines, clamped. Fixed height (2 * 1.3em) keeps every card the
   same height with zero layout jump. display:block + fixed height is the
   Android-safe clamp (the global .product-title-text rule disables
   -webkit-line-clamp). */
const TITLE_CLASS =
  "product-typography product-title-text block h-[2.6em] overflow-hidden break-words text-[15px] font-bold leading-[1.3] text-white sm:text-[19px]";

/**
 * Premium badge styles keyed by normalized label. Subtle gradients, soft
 * shadow and a slight glossy top sheen. White text, compact 24px pills.
 */
const BADGE_GRADIENTS: Record<string, { bg: string; fg: string }> = {
  TRENDING: { bg: "linear-gradient(135deg,#FFA52E 0%,#FF7A00 100%)", fg: "#FFFFFF" },
  "FLASH SALE": { bg: "linear-gradient(135deg,#FF5A52 0%,#E11D1D 100%)", fg: "#FFFFFF" },
  "HOT DEAL": { bg: "linear-gradient(135deg,#FF7A3D 0%,#FF2D2D 100%)", fg: "#FFFFFF" },
  "FAST SELLING": { bg: "linear-gradient(135deg,#C45CFF 0%,#7A1FE0 100%)", fg: "#FFFFFF" },
  PREMIUM: { bg: "linear-gradient(135deg,#2B3A67 0%,#0E1530 100%)", fg: "#FFFFFF" },
  NEW: { bg: "linear-gradient(135deg,#34E07A 0%,#10A64A 100%)", fg: "#FFFFFF" },
  BESTSELLER: { bg: "linear-gradient(135deg,#FFD964 0%,#F4B400 100%)", fg: "#000000" },
  "BEST SELLER": { bg: "linear-gradient(135deg,#FFD964 0%,#F4B400 100%)", fg: "#000000" },
  "LIMITED STOCK": { bg: "linear-gradient(135deg,#FFC940 0%,#F49B00 100%)", fg: "#000000" },
};

function badgeStyle(label: string, fallback?: CSSProperties): CSSProperties {
  const c = BADGE_GRADIENTS[label.trim().toUpperCase()];
  const base: CSSProperties = {
    boxShadow: "0 2px 6px rgba(0,0,0,0.28)",
    border: "none",
  };
  if (c) return { ...base, background: c.bg, color: c.fg };
  return { ...base, ...(fallback ?? {}) };
}

function toAssignedBadge(b: RenderBadge): CardBadge {
  return {
    id: b.assignmentId ?? b.id,
    label: b.label,
    emoji: b.emoji,
    // Product-listing badges are intentionally static: transform/keyframe badge
    // animations caused cross-browser paint invalidation while scrolling large
    // grids. Admin animation settings are preserved outside listing cards.
    className: "",
    style: badgeStyle(b.label, {
      background: b.backgroundColor || b.color,
      color: b.textColor,
    }),
  };
}

function ProductBadgesImpl({ badges }: { badges: CardBadge[] }) {
  if (badges.length === 0) return null;
  const visible = badges.slice(0, 3);
  return (
    <div className="absolute left-2 top-2 z-10 flex max-w-[calc(100%-3.5rem)] flex-col items-start gap-1 overflow-hidden">
      {visible.map((b) => (
        <span
          key={b.id}
          data-product-badge
          className={`inline-flex h-4 sm:h-5 w-fit min-w-0 max-w-full items-center gap-1 whitespace-nowrap rounded-full px-2 sm:px-2.5 text-[9px] sm:text-[11px] font-bold uppercase leading-none tracking-[0.4px] ${b.className ?? ""}`}
          style={b.style ?? badgeStyle(b.label)}
        >
          {b.emoji && <span aria-hidden className="shrink-0">{b.emoji}</span>}
          <span className="truncate">{b.label}</span>
        </span>
      ))}
    </div>
  );
}
const ProductBadges = memo(ProductBadgesImpl);

function WishlistButtonImpl({ slug, name }: { slug: string; name: string }) {
  const saved = useWishlistSaved(slug);
  const { toggle } = useWishlistActions();
  const [justSaved, setJustSaved] = useState(false);

  const onClick = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    void toggle(slug);
    if (!saved) {
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 600);
    }
  }, [saved, slug, toggle]);

  return (
    <button
      onClick={onClick}
      aria-label={saved ? `Remove ${name} from wishlist` : `Add ${name} to wishlist`}
      style={{ backgroundColor: "rgba(120,120,120,0.75)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}
      className={`absolute right-3 top-3 z-10 grid h-[36px] w-[36px] sm:h-[46px] sm:w-[46px] place-items-center rounded-full text-white transition-colors ${saved ? "text-accent" : "hover:text-accent"} ${justSaved ? "animate-[save-pulse_0.6s_ease-out]" : ""}`}
    >
      <Heart className={`size-4 sm:size-5 ${saved ? "fill-accent" : ""}`} />
    </button>
  );
}
const WishlistButton = memo(WishlistButtonImpl);

function QuickViewButtonImpl({ name, onOpen }: { name: string; onOpen: () => void }) {
  const onClick = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onOpen();
  }, [onOpen]);

  return (
    <button
      onClick={onClick}
      aria-label={`Quick view ${name}`}
      style={{ backgroundColor: "rgba(120,120,120,0.75)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}
      className="absolute bottom-3 right-3 z-10 grid h-[32px] w-[32px] sm:h-[42px] sm:w-[42px] place-items-center rounded-full text-white transition-colors hover:text-accent"
    >
      <Eye className="size-4 sm:size-[18px]" />
    </button>
  );
}
const QuickViewButton = memo(QuickViewButtonImpl);

function AddToCartButtonImpl({ product }: { product: Product }) {
  const qty = useCartQty(product.slug);
  const { add, setQty } = useCartActions();
  const [justAdded, setJustAdded] = useState(false);

  const onAdd = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    void add(product.slug);
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 800);
  }, [add, product.slug]);

  const gradient = "linear-gradient(135deg, #FFA52E 0%, #FF6A00 100%)";
  const glow = "0 2px 6px rgba(255,122,0,0.08)";

  if (!product.inStock) {
    return (
      <span data-product-text className="product-typography inline-flex h-[48px] sm:h-[54px] w-full items-center justify-center rounded-full border border-border bg-muted font-mono text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
        Sold Out
      </span>
    );
  }

  if (qty > 0 && !justAdded) {
    return (
      <div className="flex h-[48px] sm:h-[54px] w-full items-center justify-between rounded-full px-2" style={{ background: gradient, boxShadow: glow }}>
        <button onClick={(e) => { e.preventDefault(); void setQty(product.slug, qty - 1); }} aria-label="Decrease quantity" className="grid size-11 place-items-center rounded-full text-black active:scale-95 transition-transform">
          <Minus className="size-5" strokeWidth={2.5} />
        </button>
        <span data-product-text className="product-typography min-w-7 text-center text-lg font-bold tabular-nums text-black">{qty}</span>
        <button onClick={(e) => { e.preventDefault(); void setQty(product.slug, qty + 1); }} aria-label="Increase quantity" className="grid size-11 place-items-center rounded-full text-black active:scale-95 transition-transform">
          <Plus className="size-5" strokeWidth={2.5} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={onAdd}
      aria-label={`Add ${product.name} to cart`}
      style={justAdded ? undefined : { background: gradient, boxShadow: glow }}
      className={`product-typography inline-flex h-[40px] sm:h-[54px] w-full items-center justify-center gap-2 rounded-full text-[14px] sm:text-[18px] font-bold transition-[filter,transform] duration-150 hover:brightness-105 active:scale-[0.97] ${justAdded ? "bg-emerald-500 text-black" : "text-black"}`}
    >
      {justAdded ? <><Check className="size-5 sm:size-6" /> Added</> : <><Plus className="size-5 sm:size-6" strokeWidth={2.75} /> Add to Cart</>}
    </button>
  );
}
const AddToCartButton = memo(AddToCartButtonImpl, (a, b) => a.product.slug === b.product.slug && a.product.inStock === b.product.inStock && a.product.name === b.product.name);

function ProductCardImpl({ product, context = "default", forceBadge, priority = false }: ProductCardProps) {
  const { priceOf, compareOf, shippingFeeOf } = useRegion();
  const [quickOpen, setQuickOpen] = useState(false);
  const price = priceOf(product);
  const originalPrice = compareOf(product) ?? (product.discount ? price * (1 + product.discount / 100) : null);
  const discount = discountPercent(price, originalPrice);
  const shippingFee = shippingFeeOf(product);
  const freeShipping = shippingFee <= 0;
  const labels = useVisibleBadges(product, context, forceBadge);
  const assigned = useProductBadges(product.slug);
  const lowStock = product.inStock && product.stockQuantity > 0 && product.stockQuantity <= product.lowStockThreshold;
  const identity = productIdentity(product);

  const badges = useMemo<CardBadge[]>(() => {
    if (!forceBadge && assigned.length > 0) return assigned.map(toAssignedBadge);
    return labels.map((b) => ({
      id: b.key,
      label: b.label,
      emoji: b.emoji,
      className: b.className,
    }));
  }, [assigned, forceBadge, labels]);

  const openQuickView = useCallback(() => setQuickOpen(true), []);

  return (
    <article
      data-product-card
      data-product-id={identity}
      style={{ backgroundColor: "#111111", border: "1px solid rgba(255,138,0,0.35)", boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}
      className="product-card-shell relative flex h-full flex-col overflow-hidden rounded-[26px]"
    >
      <ProductCardAdminControlsGate product={product} />

      {/* Image IS the top section. White bg, 1:1, contain, 14px padding,
          rounded only on the top corners to blend into the card. */}
      <Link to="/products/$slug" params={{ slug: product.slug }} className="relative block" aria-label={product.name}>
        <div
          data-product-media
          className="relative aspect-square w-full overflow-hidden rounded-t-[26px] bg-white p-[0.5%]"
        >
          <ProductImage
            src={product.image}
            alt={`${product.name} — ${product.tagline || product.category}`}
            width={800}
            height={800}
            priority={priority}
            className="block h-full w-full object-cover object-center"
          />
          <ProductBadges badges={badges} />
          <WishlistButton slug={product.slug} name={product.name} />
          <QuickViewButton name={product.name} onOpen={openQuickView} />
        </div>
      </Link>

      {/* Details — flex column, 16px padding, 8px gap. */}
      <div data-product-copy className="product-copy flex flex-1 flex-col gap-0.5 p-2 sm:gap-2 sm:p-4">
        <Link to="/products/$slug" params={{ slug: product.slug }} className="block min-w-0">
          <h3 data-product-text className={TITLE_CLASS}>{product.name}</h3>
        </Link>

        {/* Rating */}
        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
          {product.reviews > 0 ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Star className="size-[14px] sm:size-[18px] shrink-0 fill-accent text-accent" />
              <span data-product-text className="product-typography product-rating-text text-[13px] sm:text-[17px] font-semibold tabular-nums text-white">{product.rating.toFixed(1)}</span>
              <span data-product-text className="product-typography product-rating-text truncate text-[11px] sm:text-[14px] text-muted-foreground">({product.reviews.toLocaleString()})</span>
            </span>
          ) : (
            <span data-product-text className="product-typography product-rating-text text-[11px] sm:text-[14px] font-medium text-accent">New Product</span>
          )}
          {product.soldCount > 0 && (
            <span data-product-text className="product-typography product-rating-text truncate text-[10px] sm:text-[12px] font-medium text-muted-foreground">🔥 {formatSold(product.soldCount)} sold</span>
          )}
        </div>

        {/* Price — current price on top, compare price + discount below. */}
        <div className="flex min-w-0 flex-col gap-0.5 overflow-hidden">
          <Price value={price} className="shrink-0 font-display text-[20px] font-extrabold leading-none tabular-nums text-white sm:text-[34px]" />
          {originalPrice && discount ? (
            <div className="flex min-w-0 items-baseline gap-2 overflow-hidden">
              <Price value={originalPrice} className="shrink-0 text-[12px] tabular-nums text-muted-foreground line-through sm:text-[15px]" />
              <span data-product-text className="product-typography product-price-text truncate text-[12px] font-bold leading-none text-accent sm:text-[15px]">{discount}% OFF</span>
            </div>
          ) : null}
        </div>

        {/* Shipping row — one line, never wraps. */}
        <div className="flex min-w-0 items-center justify-between gap-2 overflow-hidden">
          {freeShipping ? (
            <span data-product-text className="product-typography inline-flex min-w-0 items-center gap-1 sm:gap-1.5 truncate text-[11px] sm:text-[14px] font-medium text-emerald-400">
              <Check className="size-3 sm:size-4 shrink-0" strokeWidth={2.5} /> <span className="truncate">Free Shipping</span>
            </span>
          ) : product.returnEligible ? (
            <span data-product-text className="product-typography inline-flex min-w-0 items-center gap-1 sm:gap-1.5 truncate text-[11px] sm:text-[14px] font-medium text-emerald-400">
              <Check className="size-3 sm:size-4 shrink-0" strokeWidth={2.5} /> <span className="truncate">Easy Returns</span>
            </span>
          ) : (
            <span aria-hidden data-product-text className="product-typography text-[11px] sm:text-[14px]">&nbsp;</span>
          )}
          {lowStock ? (
            <span data-product-text className="product-typography shrink-0 truncate text-[11px] sm:text-[14px] font-semibold text-orange-300">Only {product.stockQuantity} left</span>
          ) : product.inStock ? (
            <span data-product-text className="product-typography shrink-0 text-[11px] sm:text-[14px] font-medium text-muted-foreground">In Stock</span>
          ) : (
            <span data-product-text className="product-typography shrink-0 text-[11px] sm:text-[14px] font-medium text-muted-foreground">Out of Stock</span>
          )}
        </div>

        {/* Button — sits directly below content, no filler gap. */}
        <div className="pt-1.5 sm:pt-4">
          <AddToCartButton product={product} />
        </div>
      </div>

      {quickOpen && <QuickViewDialog product={product} open={quickOpen} onOpenChange={setQuickOpen} />}
    </article>
  );
}

export const ProductCard = memo(ProductCardImpl, (a, b) => {
  return (
    productIdentity(a.product) === productIdentity(b.product) &&
    a.product === b.product &&
    a.context === b.context &&
    a.forceBadge === b.forceBadge &&
    a.compact === b.compact &&
    a.priority === b.priority
  );
});
