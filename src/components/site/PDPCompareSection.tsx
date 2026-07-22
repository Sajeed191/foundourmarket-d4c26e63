import { Link, useNavigate } from "@tanstack/react-router";
import { Check, Plus, Star, Package, ArrowRight } from "lucide-react";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";

import { useProducts } from "@/lib/use-products";
import { resolveImage, type Product } from "@/lib/products";
import { useRegion } from "@/lib/region";
import { useCompare } from "@/hooks/use-compare";
import { Price } from "@/components/site/Price";

/**
 * PDP — Product Comparison v4.0 (Premium Minimal).
 *
 * Simple, mobile-first natural shopping section:
 *   1. Section header (title + subtitle)
 *   2. Horizontal carousel of 4–8 similar products (image / name / rating / price / select)
 *   3. Compact summary: "Current + N Selected" and a single "Compare Products (N) →" CTA
 *
 * No inline table, no floating bar, no chip lists, no preview modal.
 * Reuses the existing compare store and `/compare` page unchanged.
 */

export function PDPCompareSection({ currentProduct }: { currentProduct: Product }) {
  const { products } = useProducts();
  const { priceOf } = useRegion();
  const { slugs, toggle, has, isFull, max, remove } = useCompare();
  const navigate = useNavigate();

  const currentSlug = currentProduct.slug;

  // Similarity: brand → productType → category → price proximity.
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

  // Keep the current PDP product in the compare store.
  useEffect(() => {
    if (!has(currentSlug)) toggle(currentSlug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlug]);

  // Auto-prune unavailable selections (except current).
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
        <div className="mt-6 rounded-[18px] border border-white/[0.06] bg-white/[0.015] px-6 py-12 flex flex-col items-center text-center">
          <div className="size-11 rounded-full bg-white/[0.04] border border-white/[0.06] grid place-items-center mb-4">
            <Package className="size-5 text-white/50" aria-hidden />
          </div>
          <p className="text-[13.5px] text-white/80 max-w-sm leading-relaxed">
            No similar products available yet.
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

      {/* Carousel */}
      <div className="mt-6 -mx-4 sm:mx-0">
        <ul
          className="flex overflow-x-auto snap-x snap-mandatory gap-3 px-4 sm:px-0 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{
            scrollPaddingLeft: "1rem",
            overscrollBehaviorX: "contain",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {suggestions.map((p) => {
            const active = has(p.slug);
            const disabled = !active && isFull;
            return (
              <li
                key={p.slug}
                className="snap-start shrink-0 w-[58%] min-[420px]:w-[44%] sm:w-[220px]"
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
      </div>

      {/* Compact summary */}
      <div className="mt-8 rounded-[18px] border border-white/[0.06] bg-white/[0.02] px-5 py-5 sm:px-6 sm:py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium text-white/95">
            Current Product{selectedCount > 0 ? ` + ${selectedCount} Selected` : ""}
          </p>
          <p className="mt-1 text-[12.5px] text-white/55 leading-relaxed">
            {canCompare
              ? `Ready to compare ${totalCount} product${totalCount === 1 ? "" : "s"}.`
              : "Select at least one similar product to compare."}
          </p>
        </div>
        <button
          type="button"
          disabled={!canCompare}
          onClick={() => canCompare && navigate({ to: "/compare" })}
          className={`shrink-0 inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[12.5px] font-semibold tracking-wide transition-all duration-200 ease-out active:scale-[0.98] ${
            canCompare
              ? "bg-accent text-accent-foreground hover:brightness-110 shadow-[0_6px_20px_-8px_oklch(0.74_0.19_49/0.55)]"
              : "bg-white/[0.04] text-white/40 border border-white/[0.06] cursor-not-allowed"
          }`}
        >
          Compare Products{canCompare ? ` (${totalCount})` : ""}
          {canCompare && <ArrowRight className="size-3.5" aria-hidden />}
        </button>
      </div>
    </section>
  );
}

function SectionHeader() {
  return (
    <div>
      <h2 className="text-[20px] sm:text-[22px] font-semibold tracking-tight text-foreground leading-tight">
        Product Comparison
      </h2>
      <p className="mt-1.5 text-[13px] text-muted-foreground/80 leading-relaxed">
        Compare with similar products.
      </p>
    </div>
  );
}

function CompareCard({
  product,
  price,
  active,
  disabled,
  onToggle,
}: {
  product: Product;
  price: number;
  active: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`group relative rounded-[18px] border overflow-hidden bg-white/[0.02] transition-all duration-200 ease-out h-full ${
        active
          ? "border-accent ring-1 ring-accent/40"
          : "border-white/[0.06] hover:border-white/15"
      }`}
    >
      <Link
        to="/products/$slug"
        params={{ slug: product.slug }}
        className="relative block aspect-square bg-black/30 overflow-hidden"
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
        {active && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-accent text-accent-foreground px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-widest shadow-md">
            <Check className="size-2.5" aria-hidden /> Selected
          </span>
        )}
      </Link>
      <div className="p-3">
        <Link
          to="/products/$slug"
          params={{ slug: product.slug }}
          className="block text-[13px] font-medium text-white/95 line-clamp-2 leading-snug min-h-[2.5em] hover:text-accent transition-colors"
        >
          {product.name}
        </Link>
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-white/65 tabular-nums">
          <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden />
          <span className="font-medium text-white/90">{Number(product.rating || 0).toFixed(1)}</span>
          <span className="text-white/45">({Number(product.reviews || 0)})</span>
        </div>
        <div className="mt-1.5">
          <Price value={price} variant="current" className="text-[14px]" />
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={active}
          disabled={disabled}
          className={`mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-semibold tracking-wide transition-all duration-200 ease-out active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
            active
              ? "bg-white/[0.06] text-white/90 border border-white/[0.1] hover:bg-white/[0.1]"
              : "bg-white/[0.04] text-white/85 border border-white/[0.08] hover:bg-white/[0.08] hover:border-white/20"
          }`}
        >
          {active ? (
            <>
              <Check className="size-3.5" aria-hidden /> Selected
            </>
          ) : (
            <>
              <Plus className="size-3.5" aria-hidden /> Compare
            </>
          )}
        </button>
      </div>
    </div>
  );
}
