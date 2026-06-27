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
  "product-typography product-title-text block h-[2.5em] overflow-hidden break-words text-[18px] font-bold leading-[1.25] text-foreground";

/**
 * Reference-exact badge colors keyed by normalized label. Solid pills, white
 * text (black on the light Bestseller pill). No gradients, transparency, glow.
 */
const BADGE_COLORS: Record<string, { bg: string; fg: string }> = {
  TRENDING: { bg: "#FF8A00", fg: "#FFFFFF" },
  "FLASH SALE": { bg: "#FF3B30", fg: "#FFFFFF" },
  "HOT DEAL": { bg: "#FF5A1F", fg: "#FFFFFF" },
  "FAST SELLING": { bg: "#C93CFF", fg: "#FFFFFF" },
  PREMIUM: { bg: "#143CFF", fg: "#FFFFFF" },
  "LIMITED STOCK": { bg: "#F4B400", fg: "#000000" },
  NEW: { bg: "#1ED760", fg: "#FFFFFF" },
  BESTSELLER: { bg: "#FFD54F", fg: "#000000" },
  "BEST SELLER": { bg: "#FFD54F", fg: "#000000" },
};

function badgeStyle(label: string, fallback?: CSSProperties): CSSProperties {
  const c = BADGE_COLORS[label.trim().toUpperCase()];
  if (c) return { backgroundColor: c.bg, color: c.fg, border: "none" };
  return fallback ?? {};
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
      backgroundColor: b.backgroundColor || b.color,
      color: b.textColor,
      border: b.borderColor ? `1px solid ${b.borderColor}` : undefined,
    }),
  };
}

function ProductBadgesImpl({ badges }: { badges: CardBadge[] }) {
  if (badges.length === 0) return null;
  const visible = badges.slice(0, 3);
  return (
    <div className="absolute left-2.5 top-2.5 z-10 flex max-w-[calc(100%-3.5rem)] flex-col items-start gap-1 overflow-hidden">
      {visible.map((b) => (
        <span
          key={b.id}
          data-product-badge
          className={`inline-flex h-[22px] min-w-0 max-w-full items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[10px] font-bold uppercase leading-none tracking-[0.3px] ${b.className ?? ""}`}
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
      style={{ backgroundColor: "rgba(70,70,70,0.65)", backdropFilter: "blur(10px)" }}
      className={`absolute right-2.5 top-2.5 z-10 grid h-9 w-9 place-items-center rounded-full text-white shadow-md transition-colors ${saved ? "text-accent" : "hover:text-accent"} ${justSaved ? "animate-[save-pulse_0.6s_ease-out]" : ""}`}
    >
      <Heart className={`size-[18px] ${saved ? "fill-accent" : ""}`} />
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
      style={{ backgroundColor: "rgba(70,70,70,0.65)", backdropFilter: "blur(10px)" }}
      className="absolute bottom-2.5 right-2.5 z-10 grid h-9 w-9 place-items-center rounded-full text-white transition-colors hover:text-accent"
    >
      <Eye className="size-[18px]" />
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

  const gradient = "linear-gradient(135deg, #FF8A00 0%, #FF6A00 100%)";

  if (!product.inStock) {
    return (
      <span data-product-text className="product-typography inline-flex h-[50px] w-full items-center justify-center rounded-full border border-border bg-muted font-mono text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
        Sold Out
      </span>
    );
  }

  if (qty > 0 && !justAdded) {
    return (
      <div className="flex h-[50px] w-full items-center justify-between rounded-full px-2" style={{ background: gradient }}>
        <button onClick={(e) => { e.preventDefault(); void setQty(product.slug, qty - 1); }} aria-label="Decrease quantity" className="grid size-10 place-items-center rounded-full text-black">
          <Minus className="size-5" strokeWidth={2.5} />
        </button>
        <span data-product-text className="product-typography min-w-7 text-center text-lg font-bold tabular-nums text-black">{qty}</span>
        <button onClick={(e) => { e.preventDefault(); void setQty(product.slug, qty + 1); }} aria-label="Increase quantity" className="grid size-10 place-items-center rounded-full text-black">
          <Plus className="size-5" strokeWidth={2.5} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={onAdd}
      aria-label={`Add ${product.name} to cart`}
      style={justAdded ? undefined : { background: gradient }}
      className={`product-typography inline-flex h-[50px] w-full items-center justify-center gap-1.5 rounded-full text-[18px] font-bold transition-[filter] hover:brightness-105 ${justAdded ? "bg-emerald-500 text-black" : "text-black"}`}
    >
      {justAdded ? <><Check className="size-5" /> Added</> : <><Plus className="size-5" strokeWidth={2.75} /> Add to Cart</>}
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
      style={{ backgroundColor: "#111214", border: "1px solid rgba(255,255,255,0.05)", boxShadow: "0 6px 18px rgba(0,0,0,0.25)" }}
      className="product-card-shell relative flex h-full flex-col overflow-hidden rounded-[22px]"
    >
      <ProductCardAdminControlsGate product={product} />

      {/* Image — sits directly inside the card top, no frame/box. 12px padding. */}
      <Link to="/products/$slug" params={{ slug: product.slug }} className="relative block p-3 pb-0" aria-label={product.name}>
        <div data-product-media className="relative h-[160px] w-full overflow-hidden sm:h-[210px] lg:h-[250px]">
          <ProductImage
            src={product.image}
            alt={`${product.name} — ${product.tagline || product.category}`}
            width={800}
            height={800}
            priority={priority}
            className="block h-full w-full object-contain"
          />
          <ProductBadges badges={badges} />
          <WishlistButton slug={product.slug} name={product.name} />
          <QuickViewButton name={product.name} onOpen={openQuickView} />
        </div>
      </Link>

      {/* Content — single continuous surface, no inner border. 12px padding. */}
      <div data-product-copy className="product-copy flex flex-1 flex-col px-3 pb-3 pt-2.5">
        <Link to="/products/$slug" params={{ slug: product.slug }} className="block min-w-0">
          <h3 data-product-text className={TITLE_CLASS}>{product.name}</h3>
        </Link>

        {/* Rating — 6px below title */}
        <div className="mt-1.5 flex min-w-0 items-center gap-1.5 overflow-hidden">
          {product.reviews > 0 ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Star className="size-4 shrink-0 fill-accent text-accent" />
              <span data-product-text className="product-typography product-rating-text text-[15px] font-semibold tabular-nums text-foreground">{product.rating.toFixed(1)}</span>
              <span data-product-text className="product-typography product-rating-text truncate text-[13px] text-muted-foreground">({product.reviews.toLocaleString()})</span>
            </span>
          ) : (
            <span data-product-text className="product-typography product-rating-text text-[13px] font-medium text-accent">New Product</span>
          )}
          {product.soldCount > 0 && (
            <span data-product-text className="product-typography product-rating-text truncate text-[11px] font-medium text-muted-foreground">🔥 {formatSold(product.soldCount)} sold</span>
          )}
        </div>

        {/* Price — 6px below rating */}
        <div className="mt-1.5 product-price-flow flex min-w-0 flex-col overflow-hidden">
          <Price value={price} className="block truncate font-display text-[34px] font-extrabold leading-none tabular-nums text-foreground" />
          {originalPrice && discount ? (
            <div className="mt-1 flex min-w-0 items-center gap-2 overflow-hidden">
              <Price value={originalPrice} className="block shrink-0 text-[13px] tabular-nums text-muted-foreground line-through" />
              <span data-product-text className="product-typography product-price-text truncate text-[13px] font-bold leading-none text-accent">{discount}% OFF</span>
            </div>
          ) : (
            <span aria-hidden data-product-text className="product-typography mt-1 block text-[13px] leading-none invisible">.</span>
          )}
        </div>

        {/* Shipping row — 8px below price block */}
        <div className="mt-2 flex min-w-0 items-center justify-between gap-2 overflow-hidden">
          {freeShipping ? (
            <span data-product-text className="product-typography inline-flex min-w-0 items-center gap-1.5 truncate text-[14px] font-medium text-emerald-400">
              <Check className="size-4 shrink-0" strokeWidth={2.5} /> <span className="truncate">Free Shipping</span>
            </span>
          ) : product.returnEligible ? (
            <span data-product-text className="product-typography inline-flex min-w-0 items-center gap-1.5 truncate text-[14px] font-medium text-emerald-400">
              <Check className="size-4 shrink-0" strokeWidth={2.5} /> <span className="truncate">Easy Returns</span>
            </span>
          ) : (
            <span aria-hidden data-product-text className="product-typography text-[14px]">&nbsp;</span>
          )}
          {lowStock ? (
            <span data-product-text className="product-typography shrink-0 truncate text-[14px] font-semibold text-orange-300">Only {product.stockQuantity} left</span>
          ) : product.inStock ? (
            <span data-product-text className="product-typography shrink-0 text-[14px] font-medium text-muted-foreground">In Stock</span>
          ) : (
            <span data-product-text className="product-typography shrink-0 text-[14px] font-medium text-muted-foreground">Out of Stock</span>
          )}
        </div>

        {/* Button — 12px above content, pinned to bottom to keep equal heights */}
        <div className="mt-auto pt-3">
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
