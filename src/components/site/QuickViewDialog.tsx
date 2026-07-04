import { Link } from "@tanstack/react-router";
import { Heart, Star, ArrowRight, Zap } from "lucide-react";
import { useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { type Product, discountPercent } from "@/lib/products";
import { useRegion } from "@/lib/region";
import { useWishlistActions, useWishlistSaved } from "@/lib/wishlist";
import { useBuyNow } from "@/lib/use-buy-now";
import { Price } from "@/components/site/Price";
import { ProductImage } from "@/components/site/ProductImage";
import { formatSold } from "@/lib/format-sold";

export function QuickViewDialog({
  product,
  open,
  onOpenChange,
}: {
  product: Product;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { priceOf, compareOf } = useRegion();
  const { toggle } = useWishlistActions();
  const saved = useWishlistSaved(product.slug);
  const buyNow = useBuyNow();

  // Delegates to the single centralized Buy Now handler (see useBuyNow).
  const onBuyNow = useCallback(() => {
    onOpenChange(false);
    buyNow(product);
  }, [buyNow, onOpenChange, product]);

  const price = priceOf(product);
  const originalPrice =
    compareOf(product) ?? (product.discount ? price * (1 + product.discount / 100) : null);
  const discount = discountPercent(price, originalPrice);
  const lowStock = product.inStock && product.stockQuantity > 0 && product.stockQuantity <= product.lowStockThreshold;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden rounded-[24px] border-white/10 bg-card/80 p-0 backdrop-blur-2xl">
        <div className="relative aspect-[4/3] overflow-hidden bg-black/40">
          <ProductImage src={product.image} alt={product.name} className="h-full w-full object-cover" />
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          {discount ? (
            <span className="absolute left-3 top-3 rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-black shadow-[var(--shadow-ember)]">
              {discount}% OFF
            </span>
          ) : null}
        </div>

        <div className="p-5">
          {product.tagline && (
            <p className="mb-1 text-[10px] font-mono uppercase tracking-[0.25em] text-accent/90">{product.tagline}</p>
          )}
          <h3 className="text-lg font-semibold leading-tight tracking-[-0.01em]">{product.name}</h3>

          <div className="mt-2 flex items-center gap-2">
            {product.reviews > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Star className="size-3.5 fill-accent text-accent" />
                <span className="text-sm font-semibold tabular-nums">{product.rating.toFixed(1)}</span>
                <span className="text-xs text-muted-foreground/70">({product.reviews.toLocaleString()})</span>
              </span>
            ) : (
              <span className="text-xs font-medium text-accent">New Product</span>
            )}
            {product.soldCount > 0 && (
              <span className="text-xs font-medium text-muted-foreground">🔥 {formatSold(product.soldCount)} sold</span>
            )}
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            <Price value={price} className="font-display text-2xl font-bold tabular-nums tracking-[-0.02em]" />
            {originalPrice && discount ? (
              <Price value={originalPrice} className="text-sm font-mono text-muted-foreground/55 line-through tabular-nums" />
            ) : null}
          </div>

          {product.description && (
            <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{product.description}</p>
          )}

          {lowStock && (
            <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2.5 py-1 text-xs font-medium text-orange-300">
              ⚠ Only {product.stockQuantity} left
            </p>
          )}

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={onBuyNow}
              disabled={!product.inStock}
              aria-label={`Buy ${product.name} now`}
              className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-full bg-[linear-gradient(135deg,oklch(0.80_0.18_58),oklch(0.68_0.20_42))] text-sm font-semibold text-black shadow-[var(--shadow-ember)] transition-transform active:scale-[0.97] disabled:opacity-50"
            >
              {product.inStock ? <><Zap className="size-4" strokeWidth={2.5} /> Buy Now</> : "Sold Out"}
            </button>

            <button
              onClick={() => toggle(product.slug)}
              aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
              className={`grid size-12 shrink-0 place-items-center rounded-full border transition-all active:scale-90 ${saved ? "border-accent bg-accent/20 text-accent" : "border-white/15 bg-white/5 text-white hover:border-accent hover:text-accent"}`}
            >
              <Heart className={`size-5 ${saved ? "fill-accent" : ""}`} />
            </button>
          </div>

          <Link
            to="/products/$slug"
            params={{ slug: product.slug }}
            onClick={() => onOpenChange(false)}
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground transition-colors hover:text-accent"
          >
            View full details <ArrowRight className="size-3" />
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
