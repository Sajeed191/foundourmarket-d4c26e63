import { Link, useNavigate } from "@tanstack/react-router";
import { Check, Star, ArrowRight } from "lucide-react";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";

import { useProducts } from "@/lib/use-products";
import { resolveImage, discountPercent, type Product } from "@/lib/products";
import { useRegion } from "@/lib/region";
import { useCompare } from "@/hooks/use-compare";
import { Price } from "@/components/site/Price";

/**
 * PDP — Compare Alternatives v5.1 (Native).
 *
 * A premium recommendation carousel with a lightweight comparison affordance.
 * Header → carousel → small outlined CTA. No pills, no scaling, no glow.
 * Reuses existing compare storage and `/compare` page unchanged.
 */

export function PDPCompareSection({ currentProduct }: { currentProduct: Product }) {
  const { products } = useProducts();
  const { priceOf } = useRegion();
  const { slugs, toggle, has, isFull, max, remove } = useCompare();
  const navigate = useNavigate();

  const currentSlug = currentProduct.slug;

  const suggestions = useMemo<Product[]>(() => {
    if (!products.length) return [];
    const cur = currentProduct;
    const curCats = new Set([cur.category, ...(cur.categories ?? [])].filter(Boolean));
    const curPrice = priceOf(cur) || 0;

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
        if (curPrice > 0) {
          const diff = Math.abs((priceOf(p) || 0) - curPrice) / curPrice;
          if (diff <= 0.25) score += 1;
        }
        return { p, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.p);
  }, [products, currentProduct, priceOf]);

  useEffect(() => {
    if (!has(currentSlug)) toggle(currentSlug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlug]);

  useEffect(() => {
    if (!products.length || slugs.length === 0) return;
    slugs.forEach((s) => {
      if (s === currentSlug) return;
      const p = products.find((x) => x.slug === s);
      if (!p || p.status === "archived" || p.inStock === false) remove(s);
    });
  }, [products, slugs, remove, currentSlug]);

  const selectedCount = slugs.filter((s) => s !== currentSlug).length + 1; // + current
  const canCompare = selectedCount >= 2;

  const handleToggle = (slug: string) => {
    if (slug === currentSlug) return;
    if (!has(slug) && isFull) {
      toast.message(`Maximum ${max} products`);
      return;
    }
    toggle(slug);
  };

  if (suggestions.length === 0) return null;

  return (
    <section
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-20"
      data-pdp-compare
    >
      <div className="mb-5">
        <h2 className="text-[19px] sm:text-[21px] font-semibold tracking-tight text-foreground leading-tight">
          Compare Alternatives
        </h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground/75 leading-relaxed">
          See how this product compares with similar options.
        </p>
      </div>

      <div className="relative -mx-4 sm:mx-0">
        <ul
          className="flex overflow-x-auto gap-3 px-4 sm:px-1 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{
            overscrollBehaviorX: "contain",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <li className="shrink-0 w-[43%] min-[420px]:w-[36%] sm:w-[188px]">
            <CompareCard product={currentProduct} price={priceOf(currentProduct)} pinned />
          </li>
          {suggestions.map((p) => {
            const active = has(p.slug);
            const disabled = !active && isFull;
            return (
              <li
                key={p.slug}
                className="shrink-0 w-[43%] min-[420px]:w-[36%] sm:w-[188px]"
              >
                <CompareCard
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
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent"
        />
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 px-1">
        <p className="text-[12px] text-white/60 tabular-nums">
          <span className="font-medium text-white/85">{selectedCount}</span> selected
        </p>
        <button
          type="button"
          disabled={!canCompare}
          onClick={() => canCompare && navigate({ to: "/compare" })}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-medium tracking-wide transition-[color,border-color,background-color] duration-150 ease-out ${
            canCompare
              ? "border-accent text-accent hover:bg-accent/[0.08]"
              : "border-white/10 text-white/35 cursor-not-allowed"
          }`}
        >
          Compare
          <ArrowRight className="size-3.5" aria-hidden />
        </button>
      </div>
    </section>
  );
}

function CompareCard({
  product,
  price,
  active,
  disabled,
  pinned,
  onToggle,
}: {
  product: Product;
  price: number;
  active?: boolean;
  disabled?: boolean;
  pinned?: boolean;
  onToggle?: () => void;
}) {
  const { compareOf } = useRegion();
  const comparePrice = compareOf(product);
  const discount = discountPercent(price, comparePrice) ?? 0;
  const isSelected = !!(pinned || active);

  return (
    <div className="flex h-full flex-col">
      {pinned ? (
        <span className="mb-1.5 px-0.5 text-[10px] font-medium uppercase tracking-widest text-white/40">
          Current Product
        </span>
      ) : (
        <span aria-hidden className="mb-1.5 h-[14px]" />
      )}

      <div
        className={`flex flex-1 flex-col rounded-[14px] border overflow-hidden bg-transparent transition-[border-color] duration-150 ease-out ${
          isSelected ? "border-accent" : "border-white/[0.07] hover:border-white/15"
        }`}
      >
        <Link
          to="/products/$slug"
          params={{ slug: product.slug }}
          className="relative block bg-black/25 overflow-hidden"
          style={{ aspectRatio: "1 / 1" }}
        >
          {product.image && (
            <img
              src={resolveImage(product.image)}
              alt={product.name}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
            />
          )}
        </Link>

        <div className="flex flex-1 flex-col p-3">
          <Link
            to="/products/$slug"
            params={{ slug: product.slug }}
            className="block text-[12.5px] font-medium text-white/95 line-clamp-2 leading-snug min-h-[2.4em] hover:text-accent transition-colors"
          >
            {product.name}
          </Link>

          <div className="mt-2 flex items-center gap-1 text-[10.5px] text-white/55 tabular-nums">
            <Star className="size-2.5 fill-amber-400 text-amber-400" aria-hidden />
            <span className="font-medium text-white/85">{Number(product.rating || 0).toFixed(1)}</span>
            <span className="text-white/40">({Number(product.reviews || 0)})</span>
          </div>

          <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
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
              disabled={pinned || disabled}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-white/75 disabled:cursor-not-allowed disabled:opacity-70"
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
