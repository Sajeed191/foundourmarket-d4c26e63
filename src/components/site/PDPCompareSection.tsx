import { Link } from "@tanstack/react-router";
import { Scale, Star, Check, ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import { useProducts } from "@/lib/use-products";
import { resolveImage, type Product } from "@/lib/products";
import { useRegion } from "@/lib/region";
import { useCompare } from "@/hooks/use-compare";
import { PdpSectionHeading } from "@/components/site/PdpSectionHeading";

/**
 * PDP — Product Comparison section.
 *
 * Standalone content section (mirrors Reviews / Q&A rhythm). Lets a shopper
 * pick 2–4 similar products and jump into the existing `/compare` experience.
 * UI-only entry point: reuses `useCompare()` storage, the floating tray, and
 * the compare page. No backend or routing changes.
 */
export function PDPCompareSection({ currentProduct }: { currentProduct: Product }) {
  const { products } = useProducts();
  const { format, priceOf } = useRegion();
  const { slugs, toggle, has, isFull, max } = useCompare();

  const suggestions = useMemo<Product[]>(() => {
    if (!products.length) return [];
    const currentCat = currentProduct.category;
    const pool = products.filter(
      (p) => p.slug !== currentProduct.slug && p.status !== "archived" && p.inStock !== false,
    );
    const sameCat = pool.filter((p) => p.category === currentCat);
    const rest = pool.filter((p) => p.category !== currentCat);
    return [...sameCat, ...rest].slice(0, 6);
  }, [products, currentProduct.slug, currentProduct.category]);

  if (suggestions.length === 0) return null;

  const selectedCount = slugs.length;
  const canCompare = selectedCount >= 2;

  const handleToggle = (slug: string) => {
    const active = has(slug);
    if (!active && isFull) {
      toast.message(`Maximum ${max} products`);
      return;
    }
    toggle(slug);
  };

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-20" data-pdp-compare>
      <PdpSectionHeading
        title={
          <span className="inline-flex items-center gap-2">
            <Scale className="size-[18px] text-accent" aria-hidden />
            Product Comparison
          </span>
        }
        subtitle="Compare this product with similar products to make a better buying decision."
      />

      <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {suggestions.map((p) => {
          const active = has(p.slug);
          const price = priceOf(p);
          return (
            <li
              key={p.slug}
              className={`group relative flex items-center gap-3 rounded-2xl border p-3 transition-all ${
                active
                  ? "border-accent/60 bg-accent/[0.06]"
                  : "border-white/[0.08] bg-white/[0.02] hover:border-white/20"
              }`}
            >
              <Link
                to="/products/$slug"
                params={{ slug: p.slug }}
                className="shrink-0 size-16 rounded-xl overflow-hidden bg-black/30 border border-white/[0.06]"
              >
                {p.image && (
                  <img
                    src={resolveImage(p.image)}
                    alt={p.name}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                )}
              </Link>

              <div className="min-w-0 flex-1">
                <Link
                  to="/products/$slug"
                  params={{ slug: p.slug }}
                  className="block text-[13px] font-medium text-white/95 line-clamp-2 leading-snug hover:text-accent transition-colors"
                >
                  {p.name}
                </Link>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-white/60">
                  <span className="inline-flex items-center gap-0.5">
                    <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden />
                    <span className="font-medium text-white/80">{Number(p.rating || 0).toFixed(1)}</span>
                  </span>
                  <span className="text-white/25">•</span>
                  <span className="font-semibold text-white/90">{format(price)}</span>
                </div>

                <button
                  onClick={() => handleToggle(p.slug)}
                  aria-pressed={active}
                  className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-all active:scale-95 ${
                    active
                      ? "bg-accent text-accent-foreground"
                      : "bg-white/[0.06] text-white/85 hover:bg-white/[0.12]"
                  }`}
                >
                  {active ? (
                    <>
                      <Check className="size-3.5" aria-hidden /> Added
                    </>
                  ) : (
                    <>
                      <Scale className="size-3.5" aria-hidden /> Compare
                    </>
                  )}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-[11px] text-white/50">
          Select up to {max} products to compare side by side.
        </p>
        {canCompare ? (
          <Link
            to="/compare"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-accent text-accent-foreground px-5 py-3 text-[12px] font-bold uppercase tracking-widest hover:brightness-110 transition-all"
          >
            Compare Selected Products ({selectedCount})
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white/[0.06] text-white/40 px-5 py-3 text-[12px] font-bold uppercase tracking-widest cursor-not-allowed"
          >
            Compare Selected Products {selectedCount > 0 ? `(${selectedCount})` : ""}
          </button>
        )}
      </div>
    </section>
  );
}
