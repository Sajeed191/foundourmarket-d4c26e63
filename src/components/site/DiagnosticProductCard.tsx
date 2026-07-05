// ─────────────────────────────────────────────────────────────────────────────
// TEMPORARY FORENSIC DIAGNOSTIC COMPONENT — used ONLY by /home-lite.
//
// This is NOT the production ProductCard. It is a faithful visual clone of
// src/components/site/ProductCard.tsx whose individual paint-heavy features can
// be toggled OFF one at a time via a single `disable` prop. The goal is to find
// which specific ProductCard feature triggers the Chrome 149 Android GPU-raster
// tile corruption that appears in the normal two-column grid (home-lite stage 8).
//
// Production ProductCard.tsx is UNTOUCHED. Delete this file + /home-lite to
// remove the whole experiment.
//
// Only ONE feature should be disabled at a time. `disable = "none"` renders the
// full clone and MUST reproduce the corruption to validate the clone.
// ─────────────────────────────────────────────────────────────────────────────
import { Link } from "@tanstack/react-router";
import { memo, useState } from "react";
import type { CSSProperties } from "react";
import { Heart, Check, Star, Eye, Zap } from "lucide-react";
import { type Product, discountPercent } from "@/lib/products";
import { useRegion } from "@/lib/region";
import { Price } from "@/components/site/Price";
import { ProductImage } from "@/components/site/ProductImage";

/** Which single feature is being isolated (disabled) for this render. */
export type DiagFeature =
  | "none" // full clone — must reproduce corruption
  | "image" // product image
  | "rounding" // rounded-corner clipping (overflow:hidden + border-radius)
  | "imageFade" // image fade / opacity transition
  | "discountBadge" // discount badge
  | "wishlist" // wishlist button
  | "price" // price section
  | "buyButton" // buy button
  | "gradients" // all gradients (→ solid colors)
  | "shadows" // all box-shadows
  | "filters"; // all backdrop-filter / filter effects

export const DIAG_FEATURE_LABELS: Record<DiagFeature, string> = {
  none: "Full clone (baseline — must corrupt)",
  image: "Product image OFF",
  rounding: "Rounded-corner clipping (overflow:hidden) OFF",
  imageFade: "Image fade/opacity transition OFF",
  discountBadge: "Discount badge OFF",
  wishlist: "Wishlist button OFF",
  price: "Price section OFF",
  buyButton: "Buy button OFF",
  gradients: "All gradients OFF (solid colors)",
  shadows: "All shadows OFF",
  filters: "All backdrop/filter effects OFF",
};

type Props = {
  product: Product;
  disable: DiagFeature;
};

function DiagnosticProductCardImpl({ product, disable }: Props) {
  const { priceOf, compareOf, shippingFeeOf } = useRegion();
  const [justSaved, setJustSaved] = useState(false);

  const price = priceOf(product);
  const originalPrice =
    compareOf(product) ?? (product.discount ? price * (1 + product.discount / 100) : null);
  const discount = discountPercent(price, originalPrice);
  const shippingFee = shippingFeeOf(product);
  const freeShipping = shippingFee <= 0;

  const off = (f: DiagFeature) => disable === f;

  // ── Shell: bg, border, rounding, shadow ──
  const shellShadow = off("shadows")
    ? "none"
    : "0 8px 24px rgba(0,0,0,0.35)";
  const shellRadius = off("rounding") ? "0px" : "22px";
  const shellClip = off("rounding") ? "visible" : "hidden";

  // ── Media: rounding, image, fade ──
  const mediaRadius = off("rounding") ? "0px" : undefined;

  // ── Badge: gradient vs solid ──
  const discountBadgeStyle: CSSProperties = off("gradients")
    ? { background: "#E11D1D", color: "#FFFFFF" }
    : { background: "linear-gradient(135deg,#FF5A52 0%,#E11D1D 100%)", color: "#FFFFFF" };

  // ── Buy button: gradient + glow shadow ──
  const buyGradient = off("gradients")
    ? "#FF6A00"
    : "linear-gradient(135deg, #FFA52E 0%, #FF6A00 100%)";
  const buyGlow = off("shadows") ? "none" : "0 6px 18px -4px rgba(255,122,0,0.45)";

  return (
    <article
      data-product-card
      data-diagnostic-card
      style={{
        backgroundColor: "#111111",
        border: "1px solid rgba(255,138,0,0.18)",
        borderRadius: shellRadius,
        overflow: shellClip,
        boxShadow: shellShadow,
      }}
      className="group relative flex h-full flex-col"
    >
      {/* ── MEDIA ── */}
      <Link
        to="/products/$slug"
        params={{ slug: product.slug }}
        className="relative block"
        aria-label={product.name}
      >
        <div
          data-product-media
          className="relative aspect-square w-full p-[1.5%]"
          style={{
            background: "#ffffff",
            overflow: off("rounding") ? "visible" : "hidden",
            borderTopLeftRadius: mediaRadius,
            borderTopRightRadius: mediaRadius,
          }}
        >
          {!off("image") && (
            <ProductImage
              src={product.image}
              alt={`${product.name} — ${product.tagline || product.category}`}
              width={800}
              height={800}
              className="relative z-[1] block h-full w-full object-contain object-center"
              style={{
                borderRadius: off("rounding") ? "0px" : "14px",
                // imageFade OFF → no opacity transition, always fully opaque.
                transition: off("imageFade") ? "none" : "opacity 300ms ease-out",
                opacity: 1,
              }}
            />
          )}

          {/* Discount badge */}
          {!off("discountBadge") && discount ? (
            <div className="absolute left-2.5 top-2.5 z-10 flex w-[42%] max-w-[calc(100%-3.5rem)] flex-col items-start gap-1.5">
              <span
                data-product-badge
                className="inline-flex h-[22px] sm:h-[28px] w-full max-w-full items-center gap-1 whitespace-nowrap rounded-full px-2 sm:px-3 py-1 text-[10px] sm:text-[11px] font-bold uppercase leading-none tracking-[0.4px]"
                style={{
                  ...discountBadgeStyle,
                  boxShadow: off("shadows") ? "none" : "0 2px 8px rgba(0,0,0,0.3)",
                }}
              >
                <span className="truncate">{discount}% OFF</span>
              </span>
            </div>
          ) : null}

          {/* Wishlist button */}
          {!off("wishlist") && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setJustSaved((v) => !v);
              }}
              aria-label={`Add ${product.name} to wishlist`}
              style={{
                backgroundColor: "rgba(70,70,70,0.92)",
                border: "1px solid rgba(255,255,255,0.12)",
                boxShadow: off("shadows") ? "none" : "0 2px 8px rgba(0,0,0,0.25)",
              }}
              className={`absolute right-3 top-3 z-10 grid h-[36px] w-[36px] sm:h-[46px] sm:w-[46px] place-items-center rounded-full text-white ${justSaved ? "text-accent" : ""}`}
            >
              <Heart className={`size-4 sm:size-5 ${justSaved ? "fill-accent" : ""}`} />
            </button>
          )}

          {/* Quick-view button — carries the backdrop-filter blur effect. */}
          {!off("filters") && (
            <span
              aria-hidden
              style={{
                backgroundColor: "rgba(120,120,120,0.75)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                border: "1px solid rgba(255,255,255,0.12)",
                boxShadow: off("shadows") ? "none" : "0 2px 8px rgba(0,0,0,0.25)",
              }}
              className="absolute right-3 top-[52px] sm:top-[64px] z-10 grid h-[36px] w-[36px] sm:h-[46px] sm:w-[46px] place-items-center rounded-full text-white"
            >
              <Eye className="size-4 sm:size-[18px]" />
            </span>
          )}
        </div>
      </Link>

      {/* ── DETAILS ── */}
      <div className="flex flex-1 flex-col gap-1 p-3 sm:gap-2 sm:p-4">
        <Link to="/products/$slug" params={{ slug: product.slug }} className="block min-w-0">
          <h3 className="block h-[2.6em] overflow-hidden break-words text-[14px] font-bold leading-[1.3] text-white sm:text-[16px]">
            {product.name}
          </h3>
        </Link>

        {/* Rating */}
        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
          <Star className="size-[14px] sm:size-[18px] shrink-0 fill-accent text-accent" />
          <span className="text-[13px] sm:text-[17px] font-semibold tabular-nums text-white">
            {product.rating.toFixed(1)}
          </span>
          <span className="truncate text-[11px] sm:text-[14px] text-muted-foreground">
            ({product.reviews.toLocaleString()})
          </span>
        </div>

        {/* Price section */}
        {!off("price") && (
          <div className="flex min-w-0 flex-col gap-0.5 overflow-hidden">
            <Price
              value={price}
              className="shrink-0 font-display text-[22px] font-extrabold leading-none tabular-nums text-white sm:text-[30px]"
            />
            {originalPrice && discount ? (
              <div className="flex min-w-0 items-baseline gap-2 overflow-hidden">
                <Price
                  value={originalPrice}
                  className="shrink-0 text-[12px] tabular-nums text-muted-foreground line-through sm:text-[15px]"
                />
                <span className="truncate text-[12px] font-bold leading-none text-accent sm:text-[15px]">
                  {discount}% OFF
                </span>
              </div>
            ) : null}
          </div>
        )}

        {/* Shipping row */}
        <div className="flex min-w-0 items-center justify-between gap-2 overflow-hidden">
          {freeShipping ? (
            <span className="inline-flex min-w-0 items-center gap-1 sm:gap-1.5 truncate text-[11px] sm:text-[14px] font-medium text-emerald-400">
              <Check className="size-3 sm:size-4 shrink-0" strokeWidth={2.5} />{" "}
              <span className="truncate">Free Shipping</span>
            </span>
          ) : (
            <span aria-hidden className="text-[11px] sm:text-[14px]">
              &nbsp;
            </span>
          )}
          {product.inStock ? (
            <span className="shrink-0 text-[11px] sm:text-[14px] font-medium text-muted-foreground">
              In Stock
            </span>
          ) : (
            <span className="shrink-0 text-[11px] sm:text-[14px] font-medium text-muted-foreground">
              Out of Stock
            </span>
          )}
        </div>

        {/* Buy button */}
        {!off("buyButton") && (
          <div className="pt-1.5 sm:pt-4">
            <span
              style={{ background: buyGradient, boxShadow: buyGlow }}
              className="inline-flex h-[46px] sm:h-[52px] w-full items-center justify-center gap-2 rounded-full text-[14px] sm:text-[16px] font-bold text-black"
            >
              <Zap className="size-5 sm:size-6" strokeWidth={2.75} /> Buy Now
            </span>
          </div>
        )}
      </div>
    </article>
  );
}

export const DiagnosticProductCard = memo(DiagnosticProductCardImpl);
