import { Link } from "@tanstack/react-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { Heart, Check, Star, Eye, ShoppingCart, Loader2, Minus, Plus } from "lucide-react";
import { type Product, discountPercent } from "@/lib/products";
import { type BadgeKey } from "@/lib/badges";
import { useVisibleBadges, useBadgeEngine, type BadgeContext } from "@/lib/badge-visibility";
import { useProductBadges, type RenderBadge } from "@/lib/use-product-badges";
import { useRegion } from "@/lib/region";
import { useCartActions, useCartQty } from "@/lib/cart";
import { toast } from "sonner";
import { useWishlistActions, useWishlistSaved } from "@/lib/wishlist";
import { ProductCardAdminControlsGate } from "@/components/admin/ProductCardAdminControlsGate";
import { Price } from "@/components/site/Price";
import { DiscountBadge } from "@/components/site/DiscountBadge";
import { AdaptiveProductMedia } from "@/components/site/AdaptiveProductMedia";
import { QuickViewDialog } from "@/components/site/QuickViewDialog";
import { VariantSwatchStrip, type SwatchPreview } from "@/components/site/VariantSwatchStrip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { resizedStorageImage } from "@/lib/storage-image";
import { formatSold } from "@/lib/format-sold";


type ProductCardProps = {
  product: Product;
  compact?: boolean;
  context?: BadgeContext;
  forceBadge?: BadgeKey | null;
  priority?: boolean;
  /** When set, occurrences of this term in the title are highlighted. */
  highlight?: string;
  /**
   * Suppress all top-left marketing badges (Trending, Premium, Flash Deal,
   * Bestseller, New, …). Used on personal surfaces like Continue Shopping where
   * the card communicates the user's own activity, not promotional context.
   */
  hideBadges?: boolean;
  /**
   * Optional plain-language browse badges from the Browse Presentation Adapter
   * ("Recommended", "Best Value", "Popular Choice", "Ready to Ship"). Folded
   * into the single-badge priority ladder — never rendered as extras.
   */
  browseBadges?: readonly string[];
  /**
   * Plain-language explanation of why this product surfaced ("Recommended
   * because …"). When provided AND no `forceBadge`, the marketing badge
   * becomes the interactive trigger that reveals this sentence in a popover.
   * Section-forced surfaces (Flash Deals, Best Sellers, …) pass no reason,
   * so the badge stays presentation-only.
   */
  badgeReason?: string;
};


/**
 * Unified card marketing-badge priority. The card renders exactly ONE badge —
 * whichever candidate (admin-assigned, engine-computed, or browse presentation)
 * ranks highest here. Labels outside this ladder never render on the image.
 * "Ready to Ship" is intentionally NOT here — it renders under the price as
 * an operational cue, not a marketing pill.
 */
const CARD_BADGE_PRIORITY: string[] = [
  "FLASH DEAL",
  "FLASH SALE",
  "HOT DEAL",
  "BEST SELLER",
  "BESTSELLER",
  "TRENDING",
  "NEW",
  "NEW ARRIVAL",
  "RECOMMENDED",
  "BEST VALUE",
   "POPULAR",
   "POPULAR CHOICE",

];
const READY_TO_SHIP_LABEL = "READY TO SHIP";
const normalizeBadgeLabel = (s: string) => s.trim().toUpperCase();
function pickWinningBadge(candidates: CardBadge[]): CardBadge | null {
  for (const key of CARD_BADGE_PRIORITY) {
    const hit = candidates.find((c) => normalizeBadgeLabel(c.label) === key);
    if (hit) return hit;
  }
  return null;
}

/** Highlight matched search terms within a piece of text. */
function HighlightText({ text, query }: { text: string; query?: string }) {
  const terms = (query ?? "")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (terms.length === 0) return <>{text}</>;
  const parts = text.split(new RegExp(`(${terms.join("|")})`, "gi"));
  const lower = terms.map((t) => t.toLowerCase());
  return (
    <>
      {parts.map((part, i) =>
        lower.includes(part.toLowerCase()) ? (
          <mark key={i} className="bg-accent/25 text-accent rounded-[3px] px-0.5">{part}</mark>
        ) : (
          part
        ),
      )}
    </>
  );
}


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
  "product-typography product-title-text block h-[2.6em] overflow-hidden break-words text-[14px] font-bold leading-[1.3] text-white sm:text-[16px]";

import { ProductBadge, ProductBadgeAnchor, badgeStyle } from "@/components/ui/ProductBadge";

/** Detects whether an admin-assigned badge is a Flash Deal / Hot Deal promo. */
function assignedFlashKey(b: RenderBadge): "flash_deal" | "hot_deal" | null {
  const key = (b.badgeKey || "").toLowerCase();
  const label = (b.label || "").trim().toUpperCase();
  if (key.includes("flash") || label === "FLASH SALE" || label === "FLASH DEAL") return "flash_deal";
  if (key.includes("hot") || label === "HOT DEAL") return "hot_deal";
  return null;
}

function isAssignedFlashBadge(b: RenderBadge): boolean {
  return assignedFlashKey(b) !== null;
}

function toAssignedBadge(b: RenderBadge): CardBadge {
  return {
    id: b.assignmentId ?? b.id,
    label: b.label,
    className: "",
    style: badgeStyle(b.label),
  };
}


function ProductBadgesImpl({ badge, reason }: { badge: CardBadge | null; reason?: string }) {
  if (!badge) return null;
  // v4 Premium pill: elegant, compact, corner-anchored. Never dominates the
  // product image. Compact size on <400px viewports auto-applied via arbitrary
  // media-query variant. Colors/priority unchanged.
  const pillBase =
    "inline-flex h-[24px] max-[400px]:h-[22px] sm:h-[26px] min-w-[64px] max-w-[110px] max-[400px]:max-w-[95px] w-fit items-center justify-center whitespace-nowrap rounded-full px-[10px] py-[4px] max-[400px]:px-[8px] max-[400px]:py-[3px] text-[11px] max-[400px]:text-[10px] font-semibold uppercase leading-none tracking-[0.4px] transition-[opacity,transform] animate-in fade-in slide-in-from-top-1 zoom-in-95 duration-150";

  const shortLabel = shortBadgeLabel(badge.label);

  // Section-forced / no-reason surfaces: badge is presentation only.
  if (!reason) {
    return (
      <div className="absolute left-[10px] top-[10px] z-10">
        <span
          data-product-badge
          className={`${pillBase} ${badge.className ?? ""}`}
          style={badge.style ?? badgeStyle(badge.label)}
        >
          <span className="truncate">{shortLabel}</span>
        </span>
      </div>
    );
  }

  // Intelligence-driven surfaces: badge is the trigger for "Why you're
  // seeing this". Reuses the existing Popover component — no new dialog.
  return (
    <div className="absolute left-[10px] top-[10px] z-10">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-product-badge
            aria-label="Why this product is recommended"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className={`${pillBase} ${badge.className ?? ""} cursor-pointer transition-transform duration-150 active:scale-95`}
            style={badge.style ?? badgeStyle(badge.label)}
          >
            <span className="truncate">{shortLabel}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="start"
          className="w-64 text-xs leading-relaxed"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="font-mono text-[10px] uppercase tracking-widest text-accent mb-1.5">
            Why you're seeing this
          </p>
          <p className="text-foreground/90">{reason}</p>
        </PopoverContent>
      </Popover>
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
      style={{ backgroundColor: "rgba(20,20,20,0.55)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 2px 10px rgba(0,0,0,0.30)" }}
      className={`absolute right-3 top-3 z-10 grid h-[40px] w-[40px] place-items-center rounded-full text-white transition-colors ${saved ? "text-accent" : "hover:text-accent"} ${justSaved ? "animate-[save-pulse_0.6s_ease-out]" : ""}`}
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
      style={{ backgroundColor: "rgba(20,20,20,0.55)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 2px 10px rgba(0,0,0,0.30)" }}
      className="absolute right-3 top-[52px] z-10 grid h-[40px] w-[40px] place-items-center rounded-full text-white transition-colors hover:text-accent"
    >
      <Eye className="size-[18px]" />
    </button>
  );
}
const QuickViewButton = memo(QuickViewButtonImpl);

const BTN_BASE =
  "product-typography inline-flex h-[56px] sm:h-[60px] w-full items-center justify-center rounded-[20px] text-[15px] sm:text-[16px] font-bold";

function BuyNowButtonImpl({ product }: { product: Product }) {
  const { add, setQty } = useCartActions();
  const qty = useCartQty(product.slug);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const busy = useRef(false);

  const onAddToCart = useCallback(async (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy.current) return; // prevent duplicate requests
    busy.current = true;
    setAdding(true);
    try {
      await add(product.slug, 1);
      setAdded(true);
      setTimeout(() => setAdded(false), 1700);
    } catch (err) {
      toast.error("Could not add to cart", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setAdding(false);
      busy.current = false;
    }
  }, [add, product.slug, product.name]);

  const changeQty = useCallback((next: number) => (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    void setQty(product.slug, next);
  }, [setQty, product.slug]);

  const gradient = "linear-gradient(135deg, #FFA52E 0%, #FF6A00 100%)";
  const glow = "0 6px 18px -4px rgba(255,122,0,0.45)";
  const greenGlow = "0 6px 18px -4px rgba(16,166,74,0.45)";

  if (!product.inStock) {
    return (
      <span data-product-text className={`${BTN_BASE} border border-border bg-muted font-mono text-[12px] uppercase tracking-wider text-muted-foreground`}>
        Sold Out
      </span>
    );
  }

  // Quantity stepper — shown ONLY after the standalone "Adding…" and "✓ Added"
  // confirmation states have finished. The cart qty updates optimistically
  // during "Adding…", so we must also exclude adding/added here or the
  // confirmation step would be skipped.
  if (qty > 0 && !added && !adding) {

    return (
      <div
        data-product-text
        className={`${BTN_BASE} justify-between gap-1 px-1.5 text-white motion-safe:animate-scale-in`}
        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,138,0,0.35)", boxShadow: "0 4px 14px -6px rgba(0,0,0,0.4)" }}
      >
        <button
          onClick={changeQty(qty - 1)}
          aria-label={`Decrease ${product.name} quantity`}
          className="grid h-[48px] w-[48px] place-items-center rounded-[16px] text-white transition-[background,transform] duration-150 hover:bg-white/10 active:scale-90"
        >
          <Minus className="size-5" strokeWidth={2.75} />
        </button>
        <span aria-live="polite" className="min-w-8 text-center text-[17px] font-bold tabular-nums">{qty}</span>
        <button
          onClick={changeQty(qty + 1)}
          aria-label={`Increase ${product.name} quantity`}
          style={{ background: gradient }}
          className="grid h-[48px] w-[48px] place-items-center rounded-[16px] text-black transition-[filter,transform] duration-150 hover:brightness-105 active:scale-90"
        >
          <Plus className="size-5" strokeWidth={2.75} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={onAddToCart}
      disabled={adding}
      aria-label={`Add ${product.name} to cart`}
      aria-busy={adding}
      style={added ? { background: "linear-gradient(135deg,#34E07A 0%,#10A64A 100%)", boxShadow: greenGlow } : { background: gradient, boxShadow: glow }}
      className={`${BTN_BASE} gap-2 text-black transition-[background,box-shadow,filter,transform] duration-300 hover:brightness-105 hover:-translate-y-0.5 active:scale-[0.98] disabled:hover:translate-y-0 ${added ? "animate-success-pop" : ""}`}
    >
      {adding ? (
        <><Loader2 className="size-5 sm:size-6 animate-spin" strokeWidth={2.75} /> Adding…</>
      ) : added ? (
        <span className="inline-flex items-center gap-2 text-white"><Check className="size-5 sm:size-6 motion-safe:animate-in motion-safe:zoom-in" strokeWidth={2.75} /> Added</span>
      ) : (
        <><ShoppingCart className="size-5 sm:size-6" strokeWidth={2.75} /> Add to Cart</>
      )}
    </button>
  );
}
const BuyNowButton = memo(BuyNowButtonImpl, (a, b) => a.product.slug === b.product.slug && a.product.inStock === b.product.inStock && a.product.name === b.product.name);


function ProductCardImpl({ product, context = "default", forceBadge, priority = false, highlight, hideBadges = false, browseBadges, badgeReason }: ProductCardProps) {
  const { priceOf, compareOf, shippingFeeOf } = useRegion();
  const [quickOpen, setQuickOpen] = useState(false);
  const [preview, setPreview] = useState<SwatchPreview | null>(null);
  const [hasSwatches, setHasSwatches] = useState(false);
  const price = priceOf(product);
  const originalPrice = compareOf(product) ?? (product.discount ? price * (1 + product.discount / 100) : null);
  const discount = discountPercent(price, originalPrice);
  const shippingFee = shippingFeeOf(product);
  const freeShipping = shippingFee <= 0;
  const labels = useVisibleBadges(product, context, forceBadge);
  const assigned = useProductBadges(product.slug);
  const engine = useBadgeEngine();
  const lowStock = product.inStock && product.stockQuantity > 0 && product.stockQuantity <= product.lowStockThreshold;
  const identity = productIdentity(product);

  // Ready to Ship is intentionally NOT rendered on cards (v4). The
  // READY_TO_SHIP_LABEL constant still gates it out of the badge pool below so
  // the operational signal never leaks onto the image or copy area.


  // Collect ALL badge candidates from every source, then pick the single
  // highest-priority winner. Any label outside CARD_BADGE_PRIORITY (Premium,
  // Featured, Editor's Choice, Staff Pick, Gift Idea, Fast Selling, Limited
  // Stock, …) is intentionally dropped from the card image.
  const winningBadge = useMemo<CardBadge | null>(() => {
    if (hideBadges) return null;

    const computed: CardBadge[] = labels.map((b) => ({
      id: b.key,
      label: b.label,
      emoji: b.emoji,
      className: b.className,
    }));

    if (forceBadge) {
      return pickWinningBadge(computed) ?? computed[0] ?? null;
    }

    // Flash/Hot promotional badges are exclusive to the currently-selected
    // Flash Deal rotation — hide them for non-selected products.
    const flashActive = engine.activeFlashSlugs.has(product.slug);
    const chosenFlash = engine.flashBadgeBySlug.get(product.slug) ?? null;
    const gatedAssigned = assigned.filter((b) => {
      if (!isAssignedFlashBadge(b)) return true;
      if (!flashActive || !chosenFlash) return false;
      return assignedFlashKey(b) === chosenFlash;
    });

    const browsePool: CardBadge[] = (browseBadges ?? [])
      .filter((label) => normalizeBadgeLabel(label) !== READY_TO_SHIP_LABEL)
      .map((label) => ({ id: `browse:${label}`, label }));

    const candidates: CardBadge[] = [
      ...gatedAssigned.map(toAssignedBadge),
      ...computed,
      ...browsePool,
    ];
    return pickWinningBadge(candidates);
  }, [hideBadges, labels, forceBadge, engine, product.slug, assigned, browseBadges]);




  const openQuickView = useCallback(() => setQuickOpen(true), []);

  const previewSrc = useMemo(() => {
    const cover = preview?.option.cover;
    if (!cover) return null;
    return resizedStorageImage(cover, 640) || cover;
  }, [preview]);

  // Starting price for the previewed colour (additive adjustment only; absolute
  // overrides are skipped to avoid cross-region currency mismatches).
  const previewPrice = useMemo(() => {
    if (!preview) return null;
    const adj = preview.option.adjustment;
    if (!adj) return null;
    const p = price + adj;
    return p !== price ? p : null;
  }, [preview, price]);

  const previewStock = preview?.option.stock ?? null;


  return (
    <article
      key={identity}
      data-product-card
      data-product-id={identity}
      data-render-token={identity}
      style={{ backgroundColor: "#111111", border: "1px solid rgba(255,255,255,0.06)" }}
      className="product-card-shell group relative flex h-full flex-col overflow-hidden rounded-[22px] shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-white/15 hover:shadow-[0_14px_36px_-8px_rgba(0,0,0,0.55)]"
    >
      <ProductCardAdminControlsGate product={product} />

      {/* Image IS the top section. Adaptive premium background generated from
          the product's own dominant colors, soft color glow, contain fit. */}
      <Link to="/products/$slug" params={{ slug: product.slug }} className="relative block" aria-label={product.name}>
        <AdaptiveProductMedia
          key={`${identity}:media:${product.image}`}
          src={product.image}
          alt={`${product.name} — ${product.tagline || product.category}`}
          priority={priority}
        >
          <ProductBadges badge={winningBadge} reason={forceBadge ? undefined : badgeReason} />
          <WishlistButton slug={product.slug} name={product.name} />
          {/* Variant colour preview — fades a colour's cover image over the
              base image. Overlaid (never swaps the base src) so palette,
              layout and aspect ratio never shift. */}
          <img
            aria-hidden
            src={previewSrc ?? undefined}
            alt=""
            decoding="async"
            className={`pointer-events-none absolute inset-0 z-[1] size-full object-contain p-[8%] transition-opacity duration-200 ${previewSrc ? "opacity-100" : "opacity-0"}`}
          />
        </AdaptiveProductMedia>

      </Link>

      {/* Details — flex column, 16px padding, 8px gap. */}
      <div data-product-copy className="product-copy flex flex-1 flex-col gap-1 p-3 sm:gap-2 sm:p-4">
        <Link to="/products/$slug" params={{ slug: product.slug }} className="block min-w-0">
          <h3 data-product-text className={TITLE_CLASS}><HighlightText text={product.name} query={highlight} /></h3>
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
            <span data-product-text className="product-typography product-rating-text truncate text-[10px] sm:text-[12px] font-medium text-muted-foreground">{formatSold(product.soldCount)} sold</span>
          )}
        </div>

        {/* Price — current price on top, compare price + discount below. */}
        <div className="flex min-w-0 flex-col gap-0.5 overflow-hidden">
          <Price value={price} className="shrink-0 font-display text-[22px] leading-none sm:text-[30px]" />
          {originalPrice && discount ? (
            <div className="flex min-w-0 items-center gap-2 overflow-hidden">
              <Price value={originalPrice} variant="compare" className="shrink-0 text-[12px] sm:text-[15px]" />
            </div>
          ) : null}
        </div>

        {/* Ready to Ship intentionally not rendered on cards (v4 spec).
            Backend eligibility & browse presentation flag preserved. */}

        {/* Shipping row — one line, never wraps. Extra top margin gives the
            price block breathing room now that Ready to Ship is removed. */}
        <div className="mt-0.5 sm:mt-1 flex min-w-0 items-center justify-between gap-2 overflow-hidden">
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

        {/* Colour swatches + live preview availability. Only reserves space
            when the product actually has previewable colour swatches. */}
        {hasSwatches && (
          <div className="flex min-h-[26px] items-center justify-between gap-2 overflow-hidden">
            <VariantSwatchStrip product={product} onPreview={setPreview} onAvailability={setHasSwatches} />
            {preview ? (
              <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 truncate text-[11px] sm:text-[13px] font-semibold">
                <span
                  className={
                    previewStock === "out"
                      ? "text-muted-foreground"
                      : previewStock === "low"
                        ? "text-orange-300"
                        : "text-emerald-400"
                  }
                >
                  {previewStock === "out"
                    ? "Out of Stock"
                    : previewStock === "low"
                      ? "Low Stock"
                      : "In Stock"}
                </span>
                {previewPrice != null && previewStock !== "out" ? (
                  <span className="inline-flex items-center gap-1 text-white">
                    <span className="text-muted-foreground">from</span>
                    <Price value={previewPrice} className="text-[11px] sm:text-[13px] font-bold" />
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
        )}
        {/* Hidden probe: mounts the strip to detect swatch availability without
            reserving layout space until swatches are confirmed. */}
        {!hasSwatches && (
          <VariantSwatchStrip product={product} onPreview={setPreview} onAvailability={setHasSwatches} />
        )}

        {/* Button — sits directly below content, no filler gap. */}
        <div className="pt-2.5 sm:pt-5">
          <BuyNowButton product={product} />
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
    a.priority === b.priority &&
    a.highlight === b.highlight &&
    a.hideBadges === b.hideBadges &&
    a.badgeReason === b.badgeReason &&

    // Shallow compare browseBadges array (small, stable ordering upstream).
    (a.browseBadges === b.browseBadges ||
      (Array.isArray(a.browseBadges) && Array.isArray(b.browseBadges) &&
        a.browseBadges.length === b.browseBadges.length &&
        a.browseBadges.every((v, i) => v === b.browseBadges![i])))
  );
});
