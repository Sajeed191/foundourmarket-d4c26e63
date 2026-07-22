import { Link, useNavigate } from "@tanstack/react-router";
import { Check, Star, ArrowRight, ImageOff } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useProducts } from "@/lib/use-products";
import { resolveImage, discountPercent, type Product } from "@/lib/products";
import { useRegion } from "@/lib/region";
import { useCompare } from "@/hooks/use-compare";
import { Price } from "@/components/site/Price";

/**
 * PDP — Similar Products v6.0
 *
 * Native shopping-recommendation carousel (Amazon / Flipkart / Apple in feel):
 * a clean horizontal rail of similar items with an optional compare checkbox
 * on each card. No insights, chips, banners, reminders, sheets or floating
 * bars — the PDP is for discovery; the dedicated /compare page performs the
 * actual comparison.
 *
 * Reuses the existing similarity ranking, compare store and /compare route.
 * Zero new state, zero new queries, zero backend changes.
 */

const VISIBLE_LIMIT = 12;

export function PDPCompareSection({ currentProduct }: { currentProduct: Product }) {
  const { products } = useProducts();
  const { priceOf } = useRegion();
  const { slugs, toggle, has, isFull, max } = useCompare();
  const navigate = useNavigate();

  const currentSlug = currentProduct.slug;
  const currentPrice = priceOf(currentProduct) || 0;

  const suggestions = useMemo(() => {
    if (!products.length) return [] as Product[];
    const cur = currentProduct;
    const curCats = new Set([cur.category, ...(cur.categories ?? [])].filter(Boolean));

    return products
      .filter(
        (p) =>
          p.slug !== cur.slug &&
          p.status !== "archived" &&
          p.inStock !== false,
      )
      .map((p) => {
        let score = 0;
        if (cur.brand && p.brand && p.brand === cur.brand) score += 4;
        if (cur.productType && p.productType && p.productType === cur.productType) score += 3;
        const pCats = [p.category, ...(p.categories ?? [])].filter(Boolean);
        if (pCats.some((c) => curCats.has(c))) score += 2;
        if (currentPrice > 0) {
          const diff = Math.abs((priceOf(p) || 0) - currentPrice) / currentPrice;
          if (diff <= 0.25) score += 1;
        }
        return { p, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, VISIBLE_LIMIT)
      .map((x) => x.p);
  }, [products, currentProduct, currentPrice, priceOf]);

  // Ensure current product is always part of the compare set.
  useEffect(() => {
    if (!has(currentSlug)) toggle(currentSlug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlug]);

  const selectedNonCurrent = slugs.filter((s) => s !== currentSlug).length;
  const selectedCount = selectedNonCurrent + 1; // + current
  const canCompare = selectedCount >= 2;

  const handleToggle = (slug: string) => {
    if (slug === currentSlug) return;
    if (!has(slug) && isFull) {
      toast.message(`Maximum ${max} products`);
      return;
    }
    toggle(slug);
  };

  if (products.length === 0 || suggestions.length === 0) return null;

  return (
    <section
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-20"
      data-pdp-compare
    >
      <div className="mb-5">
        <h2 className="text-[19px] sm:text-[21px] font-semibold tracking-tight text-foreground leading-tight">
          Similar Products
        </h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground/75 leading-relaxed">
          Explore products similar to this item.
        </p>
      </div>

      <div className="-mx-4 sm:mx-0">
        <ul
          className="flex overflow-x-auto gap-3 px-4 sm:px-1 pb-1 snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{
            overscrollBehaviorX: "contain",
            WebkitOverflowScrolling: "touch",
            scrollPaddingLeft: "1rem",
          }}
        >
          <li className="snap-start shrink-0 w-[42%] min-[420px]:w-[38%] sm:w-[188px]">
            <SimilarCard product={currentProduct} price={currentPrice} pinned />
          </li>
          {suggestions.map((p) => {
            const active = has(p.slug);
            const disabled = !active && isFull;
            return (
              <li
                key={p.slug}
                className="snap-start shrink-0 w-[42%] min-[420px]:w-[38%] sm:w-[188px]"
              >
                <SimilarCard
                  product={p}
                  price={priceOf(p)}
                  active={active}
                  disabled={disabled}
                  onToggle={() => handleToggle(p.slug)}
                />
              </li>
            );
          })}
          <div aria-hidden className="shrink-0 w-1" />
        </ul>
      </div>

      <div className="mt-4 px-1">
        <Link
          to="/category/$slug"
          params={{ slug: currentProduct.category || "all" }}
          className="inline-flex items-center gap-1 text-[12.5px] font-medium text-white/75 hover:text-accent transition-colors duration-150"
        >
          See More Similar Products
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>

      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {selectedNonCurrent === 0
          ? "No alternatives selected for comparison."
          : `${selectedCount} products selected for comparison.`}
      </div>

      <div className="mt-4 px-1">
        <button
          type="button"
          disabled={!canCompare}
          onClick={() => canCompare && navigate({ to: "/compare" })}
          aria-label={
            canCompare
              ? `Compare ${selectedCount} selected products`
              : "Select at least one more product to compare"
          }
          className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[12.5px] font-medium tracking-wide transition-[color,border-color,background-color] duration-150 ease-out min-h-[44px] sm:min-h-0 ${
            canCompare
              ? "border-accent text-accent hover:bg-accent/[0.08]"
              : "border-white/10 text-white/35 cursor-not-allowed"
          }`}
        >
          Compare Selected ({selectedCount})
        </button>
      </div>
    </section>
  );
}

type SimilarCardProps = {
  product: Product;
  price: number;
  active?: boolean;
  disabled?: boolean;
  pinned?: boolean;
  onToggle?: () => void;
};

function SimilarCardImpl({
  product,
  price,
  active,
  disabled,
  pinned,
  onToggle,
}: SimilarCardProps) {
  const { compareOf } = useRegion();
  const [imgFailed, setImgFailed] = useState(false);
  const comparePrice = compareOf(product);
  const discount = discountPercent(price, comparePrice) ?? 0;
  const isSelected = !!(pinned || active);
  const resolvedImg = product.image ? resolveImage(product.image) : null;

  return (
    <div className="flex h-full flex-col">
      {/* Reserved label slot so all cards align regardless of "Current" tag */}
      <div className="mb-1.5 h-[14px] px-0.5 flex items-center">
        {pinned && (
          <span className="text-[10px] font-medium uppercase tracking-widest text-white/40">
            Current
          </span>
        )}
      </div>

      <div
        className={`relative flex flex-1 flex-col rounded-[14px] border overflow-hidden bg-transparent transition-[border-color] duration-150 ease-out ${
          isSelected ? "border-accent" : "border-white/[0.08] hover:border-white/20"
        }`}
      >
        <Link
          to="/products/$slug"
          params={{ slug: product.slug }}
          aria-label={`View ${product.name}`}
          className="relative block bg-white/[0.03] overflow-hidden"
          style={{ aspectRatio: "1 / 1" }}
        >
          {resolvedImg && !imgFailed ? (
            <img
              src={resolvedImg}
              alt={product.name}
              loading="lazy"
              decoding="async"
              width={400}
              height={400}
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              aria-hidden
              className="w-full h-full grid place-items-center text-white/25"
            >
              <ImageOff className="size-6" />
            </div>
          )}
        </Link>

        <div className="flex flex-1 flex-col p-3">
          <Link
            to="/products/$slug"
            params={{ slug: product.slug }}
            className="block text-[12.5px] font-medium text-white/95 line-clamp-2 leading-snug h-[2.6em] hover:text-accent transition-colors"
          >
            {product.name}
          </Link>

          <div className="mt-2 h-[14px] flex items-center gap-1 text-[10.5px] text-white/55 tabular-nums">
            <Star className="size-2.5 fill-amber-400 text-amber-400 shrink-0" aria-hidden />
            <span className="font-medium text-white/85">
              {Number(product.rating || 0).toFixed(1)}
            </span>
            <span className="text-white/40 truncate">
              ({Number(product.reviews || 0)})
            </span>
          </div>

          <div className="mt-1 h-[20px] flex items-baseline gap-1.5 overflow-hidden">
            <Price value={price} variant="current" className="text-[13px]" />
            {comparePrice != null && comparePrice > price && (
              <>
                <Price
                  value={comparePrice}
                  variant="compare"
                  className="text-[10.5px] text-white/40 line-through"
                />
                {discount > 0 && (
                  <span className="text-[10.5px] font-semibold text-emerald-400 tabular-nums">
                    -{discount}%
                  </span>
                )}
              </>
            )}
          </div>

          <div className="mt-auto pt-3">
            <button
              type="button"
              onClick={onToggle}
              aria-pressed={isSelected}
              aria-label={
                pinned
                  ? `${product.name} is the current product`
                  : isSelected
                    ? `Remove ${product.name} from comparison`
                    : `Add ${product.name} to comparison`
              }
              disabled={pinned || disabled}
              className="inline-flex items-center gap-1.5 py-1.5 pr-2 -ml-0.5 pl-0.5 text-[11px] font-medium text-white/75 disabled:cursor-not-allowed disabled:opacity-70 min-h-[44px] sm:min-h-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded-md"
            >
              <span
                aria-hidden
                className={`grid place-items-center size-3.5 rounded-[3.5px] border transition-colors duration-150 ${
                  isSelected
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-white/25 bg-transparent"
                }`}
              >
                {isSelected && <Check className="size-2.5" strokeWidth={3} />}
              </span>
              Compare
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const SimilarCard = memo(SimilarCardImpl);
