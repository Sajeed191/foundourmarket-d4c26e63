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

const TITLE_CLASS =
  "product-typography product-title-text block h-[2.7em] overflow-hidden break-words text-[18px] font-bold leading-[1.35] text-foreground";

function toAssignedBadge(b: RenderBadge): CardBadge {
  return {
    id: b.assignmentId ?? b.id,
    label: b.label,
    emoji: b.emoji,
    // Product-listing badges are intentionally static: transform/keyframe badge
    // animations caused cross-browser paint invalidation while scrolling large
    // grids. Admin animation settings are preserved outside listing cards.
    className: "",
    style: {
      backgroundColor: b.backgroundColor || b.color,
      color: b.textColor,
      border: b.borderColor ? `1px solid ${b.borderColor}` : undefined,
    },
  };
}

function ProductBadgesImpl({ badges }: { badges: CardBadge[] }) {
  if (badges.length === 0) return null;
  const visible = badges.slice(0, 3);
  return (
    <div className="absolute left-2 top-2 flex max-w-[calc(100%-3.25rem)] flex-col items-start gap-1 overflow-hidden">
      {visible.map((b) => (
        <span
          key={b.id}
          data-product-badge
          className={`inline-flex h-[19px] min-w-0 max-w-full items-center gap-1 whitespace-nowrap rounded-full bg-accent/15 px-2 text-[10px] font-bold uppercase leading-none tracking-wide text-accent ${b.className ?? ""}`}
          style={b.style}
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
      className={`absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-full border bg-black/55 text-white transition-colors ${saved ? "border-accent text-accent" : "border-white/25 hover:border-accent hover:text-accent"} ${justSaved ? "animate-[save-pulse_0.6s_ease-out]" : ""}`}
    >
      <Heart className={`size-4 ${saved ? "fill-accent" : ""}`} />
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
      className="absolute bottom-2 right-2 grid h-10 w-10 place-items-center rounded-full border border-white/25 bg-black/60 text-white transition-colors hover:border-accent hover:text-accent"
    >
      <Eye className="size-4" />
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

  if (!product.inStock) {
    return (
      <span data-product-text className="product-typography inline-flex h-[56px] w-full items-center justify-center rounded-full border border-border bg-muted font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Sold Out
      </span>
    );
  }

  if (qty > 0 && !justAdded) {
    return (
      <div className="flex h-[56px] w-full items-center justify-between rounded-full border border-accent/40 bg-accent/10 px-2">
        <button onClick={(e) => { e.preventDefault(); void setQty(product.slug, qty - 1); }} aria-label="Decrease quantity" className="grid size-10 place-items-center rounded-full text-accent">
          <Minus className="size-4" strokeWidth={2.5} />
        </button>
        <span data-product-text className="product-typography min-w-7 text-center text-base font-bold tabular-nums text-foreground">{qty}</span>
        <button onClick={(e) => { e.preventDefault(); void setQty(product.slug, qty + 1); }} aria-label="Increase quantity" className="grid size-10 place-items-center rounded-full text-accent">
          <Plus className="size-4" strokeWidth={2.5} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={onAdd}
      aria-label={`Add ${product.name} to cart`}
      className={`product-typography inline-flex h-[56px] w-full items-center justify-center gap-1.5 rounded-full text-[15px] font-bold transition-colors ${justAdded ? "bg-emerald-500 text-black" : "bg-[linear-gradient(180deg,var(--accent),color-mix(in_oklab,var(--accent)_80%,black))] text-accent-foreground"}`}
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
      className="product-card-shell relative flex h-full min-h-[430px] flex-col overflow-hidden rounded-[24px] border border-border bg-card shadow-[0_4px_20px_-12px_oklch(0_0_0/0.7)]"
    >
      <ProductCardAdminControlsGate product={product} />

      <Link to="/products/$slug" params={{ slug: product.slug }} className="relative block p-3" aria-label={product.name}>
        <div data-product-media className="relative aspect-square w-full overflow-hidden rounded-[18px] bg-white">
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

      <div data-product-copy className="product-copy grid flex-1 grid-rows-[auto_16px_50px_16px_56px] gap-y-2 px-3.5 pb-3.5 pt-1">
        <Link to="/products/$slug" params={{ slug: product.slug }} className="block min-w-0">
          <h3 data-product-text className={TITLE_CLASS}>{product.name}</h3>
        </Link>

        <div className="product-meta-flow flex min-w-0 items-center gap-2 overflow-hidden">
          {product.reviews > 0 ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <Star className="size-3.5 shrink-0 fill-accent text-accent" />
              <span data-product-text className="product-typography product-rating-text text-[12px] font-semibold tabular-nums text-foreground">{product.rating.toFixed(1)}</span>
              <span data-product-text className="product-typography product-rating-text truncate font-mono text-[11px] text-muted-foreground">({product.reviews.toLocaleString()})</span>
            </span>
          ) : (
            <span data-product-text className="product-typography product-rating-text text-[11px] font-medium text-accent">New Product</span>
          )}
          {product.soldCount > 0 && (
            <span data-product-text className="product-typography product-rating-text truncate text-[10px] font-medium text-muted-foreground">🔥 {formatSold(product.soldCount)} sold</span>
          )}
        </div>

        <div className="product-price-flow flex min-w-0 flex-col justify-center overflow-hidden">
          <Price value={price} className="block truncate font-display text-[32px] font-bold leading-none tabular-nums text-foreground" />
          {originalPrice && discount ? (
            <div className="mt-1.5 flex min-w-0 items-center gap-2 overflow-hidden">
              <Price value={originalPrice} className="block shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground line-through" />
              <span data-product-text className="product-typography product-price-text truncate font-mono text-[12px] font-bold leading-none text-accent">{discount}% OFF</span>
            </div>
          ) : (
            <span aria-hidden data-product-text className="product-typography mt-1.5 block text-[12px] leading-none invisible">.</span>
          )}
        </div>

        <div className="flex min-w-0 items-center justify-between gap-2 overflow-hidden">
          {freeShipping ? (
            <span data-product-text className="product-typography inline-flex min-w-0 items-center gap-1 truncate text-[11px] font-medium text-emerald-300">
              <Check className="size-3 shrink-0" strokeWidth={2.5} /> <span className="truncate">Free Shipping</span>
            </span>
          ) : product.returnEligible ? (
            <span data-product-text className="product-typography inline-flex min-w-0 items-center gap-1 truncate text-[11px] font-medium text-emerald-300">
              <Check className="size-3 shrink-0" strokeWidth={2.5} /> <span className="truncate">Easy Returns</span>
            </span>
          ) : (
            <span aria-hidden data-product-text className="product-typography text-[11px]">&nbsp;</span>
          )}
          {lowStock ? (
            <span data-product-text className="product-typography shrink-0 truncate text-[11px] font-semibold text-orange-300">Only {product.stockQuantity} left</span>
          ) : product.inStock ? (
            <span data-product-text className="product-typography shrink-0 text-[11px] font-medium text-muted-foreground">In Stock</span>
          ) : (
            <span data-product-text className="product-typography shrink-0 text-[11px] font-medium text-muted-foreground">Out of Stock</span>
          )}
        </div>

        <AddToCartButton product={product} />
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