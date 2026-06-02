import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Heart, ShoppingCart, Check, Star } from "lucide-react";
import { type Product, discountPercent } from "@/lib/products";
import { useRegion } from "@/lib/region";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";
import { ProductCardAdminControls } from "@/components/admin/ProductCardAdminControls";
import { useBadgeSettings } from "@/lib/use-badge-settings";
import { computeBadges } from "@/lib/badges";
import { useProductBadges, trackBadgeClick, trackBadgeImpression, badgeAnimationClass } from "@/lib/use-product-badges";
import { Price } from "@/components/site/Price";

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

// Admin-facing badge priority. Lower index = higher priority = shown first.
const BADGE_PRIORITY = [
  "hot deal",
  "flash sale",
  "fast selling",
  "trending",
  "best seller",
  "new",
  "premium",
  "recommended",
];
function badgePriority(key?: string, label?: string): number {
  const hay = `${key ?? ""} ${label ?? ""}`.toLowerCase();
  const idx = BADGE_PRIORITY.findIndex((p) => hay.includes(p));
  return idx === -1 ? BADGE_PRIORITY.length : idx;
}

export function ProductCard({ product, compact }: { product: Product; compact?: boolean }) {
  const { priceOf, compareOf, shippingFeeOf } = useRegion();
  const { add, items } = useCart();
  const { has, toggle } = useWishlist();
  const saved = has(product.slug);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const cartQty = items.find((i) => i.slug === product.slug)?.qty ?? 0;
  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    add(product.slug);
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 700);
  };
  const price = priceOf(product);
  const originalPrice = compareOf(product) ?? (product.discount ? price * (1 + product.discount / 100) : null);
  const discount = discountPercent(price, originalPrice);
  const shippingFee = shippingFeeOf(product);

  const badgeSettings = useBadgeSettings();
  const assigned = useProductBadges(product.slug);
  // Record a single impression per card for the admin-assigned badges shown.
  const imprDone = useRef(false);
  useEffect(() => {
    if (imprDone.current || assigned.length === 0) return;
    imprDone.current = true;
    assigned.slice(0, 2).forEach((b) => b.id && trackBadgeImpression(b.id, product.slug));
  }, [assigned, product.slug]);
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
  const sortedBadges = [...badges].sort(
    (a, b) => badgePriority(a.key, a.label) - badgePriority(b.key, b.label),
  );
  const showOnlyLeft =
    product.stockQuantity > 0 &&
    product.stockQuantity <= (product.lowStockThreshold || 10);



  return (
    <div className="group product-card-glass overflow-hidden relative flex flex-col h-full p-1.5">
      <ProductCardAdminControls product={product} />

      {/* IMAGE — compact marketplace ratio */}
      <Link to="/products/$slug" params={{ slug: product.slug }} className="block relative">
        <div className="relative aspect-square rounded-xl overflow-hidden bg-black/40">
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
            height={1000}
            onLoad={() => setImgLoaded(true)}
            className={`relative w-full h-full object-cover [transition:opacity_500ms_ease,transform_700ms_cubic-bezier(0.16,1,0.3,1)] sm:group-hover:scale-[1.06] ${imgLoaded ? "opacity-100" : "opacity-0"}`}
          />

          {/* Discount badge — top-left, bold orange pill for strong visibility */}
          {discount ? (
            <span className="absolute top-2 left-2 inline-flex items-center rounded-full bg-gradient-to-br from-accent to-[oklch(0.66_0.19_38)] text-black font-extrabold font-mono text-[11px] px-2.5 py-1 shadow-[var(--shadow-ember)] ring-1 ring-black/10">
              -{discount}%
            </span>
          ) : null}

          {/* Admin / auto badges — stacked below the discount pill */}
          <div className={`absolute left-2 flex flex-col items-start gap-1 ${discount ? "top-9" : "top-2"}`}>
            {sortedBadges.slice(0, 2).map((b) => {
              const bg = b.backgroundColor || b.color;
              const styled = !b.className;
              const shadow = b.shadowStrength
                ? `0 ${Math.round(b.shadowStrength / 12)}px ${Math.round(b.shadowStrength / 4)}px -2px ${b.glowColor || bg || "rgba(0,0,0,0.4)"}`
                : undefined;
              return (
                <span
                  key={b.key}
                  onClick={b.id ? () => trackBadgeClick(b.id!, product.slug) : undefined}
                  className={`inline-flex items-center gap-1 text-[9px] font-bold font-mono px-1.5 min-h-[18px] leading-none rounded-md tracking-wider whitespace-nowrap shadow-sm ${b.className ?? ""} ${badgeAnimationClass(b.animation)}`}
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
          </div>

          {/* Wishlist — top-right circular glass button */}
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
            className={`absolute top-2 right-2 grid place-items-center size-8 rounded-full backdrop-blur-xl border shadow-lg shadow-black/40 transition-all duration-300 active:scale-90 ${
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

      {/* INFO */}
      <Link to="/products/$slug" params={{ slug: product.slug }} className="relative flex flex-1 flex-col px-1 pt-1.5">
        {/* Name */}
        <h4 className="text-[12px] font-bold text-white leading-tight line-clamp-2 min-h-[2.1em] group-hover:text-accent transition-colors">
          {product.name}
        </h4>

        {/* Rating row — ⭐ 4.8 (984) */}
        <div className="flex items-center gap-1 mt-1 min-h-[15px]">
          {product.reviews > 0 ? (
            <>
              <Star className="size-3 fill-accent text-accent" />
              <span className="text-[11px] font-bold text-white tabular-nums">{product.rating.toFixed(1)}</span>
              <span className="text-[10px] font-mono text-muted-foreground/75">({product.reviews.toLocaleString()})</span>
            </>
          ) : (
            <span className="text-[9px] font-mono uppercase tracking-wider text-emerald-400/90">New Product</span>
          )}
          {showOnlyLeft && (
            <span className="font-mono uppercase tracking-wider text-accent/90 text-[8px] ml-auto">
              {product.stockQuantity} left
            </span>
          )}
          {shippingFee <= 0 && !showOnlyLeft && (
            <span className="font-mono uppercase tracking-wider text-emerald-400/90 text-[8px] ml-auto">Free Ship</span>
          )}
        </div>

        {/* Price hierarchy + compact add-to-cart */}
        <div className="mt-auto pt-2 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <Price value={price} className="font-display font-extrabold text-white tabular-nums leading-none block text-[18px]" />
              {originalPrice && discount ? (
                <Price value={originalPrice} className="font-mono text-muted-foreground/55 line-through tabular-nums block text-[10px]" />
              ) : null}
            </div>
            {originalPrice && discount ? (
              <span className="mt-0.5 inline-flex items-center gap-0.5 text-[9px] font-bold font-mono uppercase tracking-wide text-emerald-400">
                Save <Price value={originalPrice - price} className="tabular-nums" />
              </span>
            ) : null}
          </div>

          {product.inStock ? (
            <button
              onClick={handleAdd}
              aria-label={`Add ${product.name} to cart`}
              className={`relative shrink-0 grid place-items-center size-10 rounded-xl bg-gradient-to-br from-accent to-[oklch(0.66_0.19_38)] text-black border border-white/25 shadow-[var(--shadow-ember)] transition-all duration-300 hover:brightness-110 hover:scale-105 active:scale-90 ${justAdded ? "animate-cart-pulse" : ""}`}
            >
              {justAdded ? <Check className="size-[18px]" /> : <ShoppingCart className="size-[18px]" />}
              {cartQty > 0 && (
                <span className="absolute -top-1.5 -right-1.5 grid place-items-center min-w-[16px] h-4 px-1 rounded-full bg-black text-white text-[9px] font-bold tabular-nums border border-white/20">
                  {cartQty}
                </span>
              )}
            </button>
          ) : (
            <span
              onClick={(e) => e.preventDefault()}
              className="shrink-0 inline-flex items-center rounded-full bg-muted/40 border border-white/10 text-muted-foreground font-bold font-mono uppercase tracking-wider px-2 py-1 text-[9px]"
            >
              Sold Out
            </span>
          )}
        </div>
      </Link>
    </div>
  );
}
