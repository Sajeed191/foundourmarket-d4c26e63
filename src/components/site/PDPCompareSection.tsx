import { Link, useNavigate } from "@tanstack/react-router";
import { Check, Star, Package, ArrowRight } from "lucide-react";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";

import { useProducts } from "@/lib/use-products";
import { resolveImage, discountPercent, type Product } from "@/lib/products";
import { useRegion } from "@/lib/region";
import { useCompare } from "@/hooks/use-compare";
import { Price } from "@/components/site/Price";

/**
 * PDP — Compare Similar Products v4.2 (Final Premium Polish).
 *
 * UI-only refinement. Reuses existing compare store and `/compare` page.
 * Feels like a product-discovery recommendation section, not a utility.
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

  const selectedCount = slugs.filter((s) => s !== currentSlug).length;
  const totalCount = selectedCount + 1;
  const canCompare = totalCount >= 2;

  const handleToggle = (slug: string) => {
    if (slug === currentSlug) return;
    if (!has(slug) && isFull) {
      toast.message(`Maximum ${max} products`);
      return;
    }
    toggle(slug);
  };

  if (suggestions.length === 0) {
    return (
      <section
        className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-20"
        data-pdp-compare
      >
        <SectionHeader />
        <div className="mt-5 rounded-[18px] border border-white/[0.05] bg-white/[0.015] px-6 py-10 flex flex-col items-center text-center">
          <div className="size-10 rounded-full bg-white/[0.04] border border-white/[0.06] grid place-items-center mb-3">
            <Package className="size-4 text-white/45" aria-hidden />
          </div>
          <p className="text-[13px] text-white/70 leading-relaxed">
            No similar products available.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-20"
      data-pdp-compare
    >
      <SectionHeader />

      {/* Carousel — 2.2 cards visible on mobile, edge fades */}
      <div className="mt-5 relative -mx-4 sm:mx-0">
        <ul
          className="flex overflow-x-auto snap-x snap-mandatory gap-2.5 px-4 sm:px-1 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{
            scrollPaddingLeft: "1rem",
            overscrollBehaviorX: "contain",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <li className="snap-start shrink-0 w-[44%] min-[420px]:w-[38%] sm:w-[188px]">
            <CompareCard
              product={currentProduct}
              price={priceOf(currentProduct)}
              active
              disabled
              pinned
              onToggle={() => {}}
            />
          </li>
          {suggestions.map((p) => {
            const active = has(p.slug);
            const disabled = !active && isFull;
            return (
              <li
                key={p.slug}
                className="snap-start shrink-0 w-[44%] min-[420px]:w-[38%] sm:w-[188px]"
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

      {/* Compact summary row */}
      <div className="mt-6 flex items-center gap-3 px-1">
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-medium text-white/90">
            {canCompare
              ? `${totalCount} products selected`
              : "Select products to compare"}
          </p>
          <p className="mt-0.5 text-[11px] text-white/45 leading-snug truncate">
            Price · Rating · Reviews · Specifications
          </p>
        </div>
        <button
          type="button"
          disabled={!canCompare}
          onClick={() => canCompare && navigate({ to: "/compare" })}
          className={`shrink-0 inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-semibold tracking-wide transition-[background-color,color,border-color,transform] duration-200 ease-out active:scale-[0.98] ${
            canCompare
              ? "bg-accent text-accent-foreground hover:brightness-110"
              : "bg-white/[0.06] text-white/45 cursor-not-allowed"
          }`}
        >
          {canCompare ? (
            <>
              Compare Products
              <ArrowRight className="size-3.5" aria-hidden />
            </>
          ) : (
            "Select 2 or more products"
          )}
        </button>
      </div>
    </section>
  );
}

function SectionHeader() {
  return (
    <div>
      <h2 className="text-[19px] sm:text-[21px] font-semibold tracking-tight text-foreground leading-tight">
        Compare Similar Products
      </h2>
      <p className="mt-1 text-[12.5px] text-muted-foreground/80 leading-relaxed">
        Not sure? Compare this product with similar options before you buy.
      </p>
    </div>
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
  active: boolean;
  disabled: boolean;
  pinned?: boolean;
  onToggle: () => void;
}) {
  const { compareOf } = useRegion();
  const comparePrice = compareOf(product);
  const discount = discountPercent(price, comparePrice) ?? 0;

  return (
    <div
      className={`group relative rounded-[16px] border overflow-hidden bg-white/[0.02] transition-[border-color] duration-200 ease-out h-full ${
        pinned
          ? "border-amber-500/35"
          : active
            ? "border-accent"
            : "border-white/[0.06] hover:border-white/15"
      }`}
    >
      <Link
        to="/products/$slug"
        params={{ slug: product.slug }}
        className="relative block bg-black/30 overflow-hidden"
        style={{ aspectRatio: "1 / 0.9" }}
      >
        {product.image && (
          <img
            src={resolveImage(product.image)}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover transition-transform duration-200 ease-out active:scale-[1.02]"
          />
        )}
        {discount > 0 && (
          <span className="absolute top-1.5 left-1.5 inline-flex items-center rounded-md bg-emerald-500/90 px-1.5 py-[1px] text-[10px] font-bold tabular-nums text-white">
            -{discount}%
          </span>
        )}
        {pinned && (
          <span className="absolute top-1.5 right-1.5 inline-flex items-center rounded-full border border-amber-500/50 bg-black/50 backdrop-blur px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-widest text-amber-300/90">
            Current
          </span>
        )}
      </Link>
      <div className="p-2.5">
        <Link
          to="/products/$slug"
          params={{ slug: product.slug }}
          className="block text-[12.5px] font-medium text-white/95 line-clamp-2 leading-snug min-h-[2.4em] hover:text-accent transition-colors"
        >
          {product.name}
        </Link>
        <div className="mt-1.5 flex items-center gap-1 text-[10.5px] text-white/60 tabular-nums">
          <Star className="size-2.5 fill-amber-400 text-amber-400" aria-hidden />
          <span className="font-medium text-white/85">{Number(product.rating || 0).toFixed(1)}</span>
          <span className="text-white/40">({Number(product.reviews || 0)})</span>
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <Price value={price} variant="current" className="text-[13px]" />
          {comparePrice != null && comparePrice > price && (
            <Price
              value={comparePrice}
              variant="compare"
              className="text-[10.5px] text-white/40 line-through"
            />
          )}
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={active}
          disabled={disabled}
          className={`mt-2.5 w-full inline-flex items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-medium tracking-wide transition-[color,border-color,background-color,transform] duration-200 ease-out active:scale-[0.97] disabled:cursor-not-allowed ${
            pinned
              ? "border border-amber-500/25 text-amber-300/70 bg-transparent cursor-default"
              : active
                ? "border border-accent text-accent bg-accent/[0.06]"
                : "border border-white/[0.1] text-white/80 bg-transparent hover:border-white/25 disabled:opacity-40"
          }`}
        >
          <span
            aria-hidden
            className={`grid place-items-center size-3.5 rounded-[4px] border transition-colors duration-200 ${
              active
                ? pinned
                  ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
                  : "border-accent bg-accent text-accent-foreground"
                : "border-white/25 bg-transparent"
            }`}
          >
            {active && <Check className="size-2.5" strokeWidth={3} />}
          </span>
          {active ? "Selected" : "Compare"}
        </button>
      </div>
    </div>
  );
}
