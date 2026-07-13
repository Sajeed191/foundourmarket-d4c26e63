import { Link } from "@tanstack/react-router";
import { Heart, Star, ArrowRight, Zap, ShoppingBag, Check, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  type Product,
  type ProductVariant,
  discountPercent,
  fetchProduct,
  fetchProductVariants,
} from "@/lib/products";
import { useRegion } from "@/lib/region";
import { useWishlistActions, useWishlistSaved } from "@/lib/wishlist";
import { useBuyNow } from "@/lib/use-buy-now";
import { useCart } from "@/lib/cart";
import { Price } from "@/components/site/Price";
import { ProductImage } from "@/components/site/ProductImage";
import { VariantSelector } from "@/components/site/VariantSelector";
import { getCachedVariantSummary } from "@/lib/variant-swatch-cache";
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
  const { add, items: cartItems } = useCart();

  // Grid/card products use the lean CARD projection which omits `description`.
  // Fetch it on demand when the dialog opens so the quick view keeps its blurb.
  const [description, setDescription] = useState(product.description ?? "");
  useEffect(() => {
    if (!open) return;
    import("@/lib/recommendations/performance").then((m) => m.attributeStage("quick_view")).catch(() => {});
    if (product.description) { setDescription(product.description); return; }
    let active = true;
    fetchProduct(product.slug).then((full) => {
      if (active && full?.description) setDescription(full.description);
    });
    return () => { active = false; };
  }, [open, product.slug, product.description]);

  // ── Variants ──────────────────────────────────────────────────────────────
  // Reuse the already-loaded swatch summary to know whether this product has
  // variants at all; only fetch the full variant objects (needed for ids +
  // cart) when the dialog opens for a product that actually has variants — so
  // variant-less products issue ZERO extra requests.
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [variantId, setVariantId] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const summary = getCachedVariantSummary(product.slug);
    const mayHaveVariants =
      summary == null // unknown → allow one probe fetch
        ? true
        : (summary.colors.length > 0 || summary.sizes.length > 0 || summary.rows.length > 0);
    if (!mayHaveVariants) { setVariants([]); return; }
    let active = true;
    fetchProductVariants(product.slug).then((vs) => {
      if (!active) return;
      setVariants(vs);
      // Honour the admin's default colour, then the first in-stock variant.
      const preferred =
        vs.find((v) => v.color && product.defaultVariantColor && v.color.trim().toLowerCase() === product.defaultVariantColor.trim().toLowerCase() && v.stockQuantity > 0) ??
        vs.find((v) => v.stockQuantity > 0) ??
        vs[0] ?? null;
      setVariantId(preferred?.id ?? null);
    });
    return () => { active = false; };
  }, [open, product.slug, product.defaultVariantColor]);

  // Reset transient state whenever the dialog closes.
  useEffect(() => {
    if (!open) { setVariants([]); setVariantId(null); setAddState("idle"); }
  }, [open]);

  const selectedVariant = useMemo(
    () => variants.find((v) => v.id === variantId) ?? null,
    [variants, variantId],
  );
  const requiresVariant = variants.length > 0;
  const missingVariant = requiresVariant && !variantId;

  const basePrice = priceOf(product);
  const price = selectedVariant?.priceOverride ?? basePrice;
  const originalPrice =
    selectedVariant?.comparePrice ??
    compareOf(product) ??
    (product.discount ? price * (1 + product.discount / 100) : null);
  const discount = discountPercent(price, originalPrice);

  const effectiveStock = selectedVariant ? selectedVariant.stockQuantity : product.stockQuantity;
  const effectiveInStock = requiresVariant ? effectiveStock > 0 : product.inStock;
  const lowStock = effectiveInStock && effectiveStock > 0 && effectiveStock <= product.lowStockThreshold;
  const previewImage = selectedVariant?.imageUrl || product.image;

  const [addState, setAddState] = useState<"idle" | "loading" | "success">("idle");
  const addTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { addTimers.current.forEach(clearTimeout); }, []);

  const inCartQty = cartItems.find(
    (i) => i.slug === product.slug && (i.variantId ?? null) === (variantId ?? null) && !i.savedForLater,
  )?.qty ?? 0;

  const handleAdd = useCallback(() => {
    if (addState !== "idle" || !effectiveInStock) return;
    if (missingVariant) return;
    void add(product.slug, 1, variantId);
    setAddState("loading");
    addTimers.current.push(
      setTimeout(() => setAddState("success"), 350),
      setTimeout(() => setAddState("idle"), 1500),
    );
  }, [add, addState, effectiveInStock, missingVariant, product.slug, variantId]);

  // Delegates to the single centralized Buy Now handler (see useBuyNow).
  const onBuyNow = useCallback(() => {
    if (missingVariant) return;
    onOpenChange(false);
    buyNow(product, { variantId, disabled: !effectiveInStock });
  }, [buyNow, effectiveInStock, missingVariant, onOpenChange, product, variantId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden rounded-[24px] border-white/10 bg-card/80 p-0 backdrop-blur-2xl">
        <div className="relative aspect-[4/3] overflow-hidden bg-black/40">
          <ProductImage
            key={previewImage}
            src={previewImage}
            alt={selectedVariant ? `${product.name} — ${selectedVariant.color ?? selectedVariant.name}` : product.name}
            className="h-full w-full object-cover animate-in fade-in duration-200"
          />
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          {discount ? (
            <span className="absolute left-3 top-3 rounded-full bg-[linear-gradient(135deg,oklch(0.80_0.18_58),oklch(0.68_0.20_42))] px-2.5 py-1 text-[11px] font-bold text-black shadow-[var(--shadow-ember)]">
              -{discount}%
            </span>
          ) : null}
        </div>

        <div className="max-h-[62vh] overflow-y-auto p-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
              <Price value={originalPrice} variant="compare" className="text-sm" />
            ) : null}
          </div>

          {/* Live stock status — variant-aware. */}
          <div className="mt-2">
            {!effectiveInStock ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-medium text-destructive">
                Out of Stock
              </span>
            ) : lowStock ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2.5 py-1 text-xs font-medium text-orange-300">
                ⚠ Only {effectiveStock} left
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
                <Check className="size-3" /> In Stock
              </span>
            )}
          </div>

          {/* Variant colours + sizes, reusing the product page selector. */}
          {variants.length > 0 && (
            <div className="mt-4">
              <VariantSelector variants={variants} selectedId={variantId} onSelect={setVariantId} />
            </div>
          )}

          {description && (
            <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
          )}

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={handleAdd}
              disabled={!effectiveInStock || missingVariant || addState !== "idle"}
              aria-label={`Add ${product.name} to cart`}
              className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-full border border-white/15 bg-white/5 text-sm font-semibold text-foreground transition-all active:scale-[0.97] hover:border-accent/50 disabled:opacity-50"
            >
              {addState === "loading" ? (
                <><Loader2 className="size-4 animate-spin" /> Adding…</>
              ) : addState === "success" ? (
                <><Check className="size-4 text-emerald-400" /> Added</>
              ) : (
                <><ShoppingBag className="size-4" /> {inCartQty > 0 ? `In Cart · ${inCartQty}` : "Add to Cart"}</>
              )}
            </button>

            <button
              onClick={() => toggle(product.slug)}
              aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
              className={`grid size-12 shrink-0 place-items-center rounded-full border transition-all active:scale-90 ${saved ? "border-accent bg-accent/20 text-accent" : "border-white/15 bg-white/5 text-white hover:border-accent hover:text-accent"}`}
            >
              <Heart className={`size-5 ${saved ? "fill-accent" : ""}`} />
            </button>
          </div>

          <button
            onClick={onBuyNow}
            disabled={!effectiveInStock || missingVariant}
            aria-label={`Buy ${product.name} now`}
            className="mt-2 inline-flex h-12 w-full items-center justify-center gap-1.5 rounded-full bg-[linear-gradient(135deg,oklch(0.80_0.18_58),oklch(0.68_0.20_42))] text-sm font-semibold text-black shadow-[var(--shadow-ember)] transition-transform active:scale-[0.97] disabled:opacity-50"
          >
            {effectiveInStock ? <><Zap className="size-4" strokeWidth={2.5} /> Buy Now</> : "Sold Out"}
          </button>

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
