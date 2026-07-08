import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useProducts } from "@/lib/use-products";
import { ProductCard } from "@/components/site/ProductCard";
import type { Product } from "@/lib/products";

type Props = {
  /** Optional product to be related to (same category, excluded from results). */
  product?: Product;
  /** Optional list of slugs to exclude (e.g. items already in cart). */
  excludeSlugs?: string[];
  /** Heading text. */
  title?: string;
  /** Eyebrow label above the heading. */
  eyebrow?: string;
  /** Target number of items shown. */
  limit?: number;
  /** Number of items shown before "View all". */
  initial?: number;
};

export function RelatedProducts({
  product,
  excludeSlugs = [],
  title = "You may also like",
  eyebrow = "Discover",
  limit = 8,
  initial = 4,
}: Props) {
  const { products, loading } = useProducts();
  const [showAll, setShowAll] = useState(false);

  const items = useMemo(() => {
    const exclude = new Set<string>(excludeSlugs);
    if (product) exclude.add(product.slug);

    const sameCat = product
      ? products.filter((p) => p.category === product.category && !exclude.has(p.slug))
      : [];
    const others = products.filter(
      (p) => !exclude.has(p.slug) && (!product || p.category !== product.category),
    );

    // Featured first within "others" to surface curated picks as filler
    others.sort((a, b) => Number(b.featured) - Number(a.featured) + (b.rating - a.rating) * 0.1);

    return [...sameCat, ...others].slice(0, limit);
  }, [products, product, excludeSlugs, limit]);

  if (loading || items.length === 0) return null;

  const visible = showAll ? items : items.slice(0, initial);
  const hasMore = items.length > initial;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="mb-4 sm:mb-6">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-1.5">{eyebrow}</p>
        <h2 className="text-xl sm:text-3xl md:text-4xl font-display tracking-tight">{title}</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 sm:gap-4 items-stretch">
        {visible.map((p) => (
          <div
            key={p.id ?? p.slug}
            data-product-card-frame
            className="h-full rounded-2xl glow-border"
          >
            <ProductCard product={p} compact />
          </div>
        ))}
      </div>

      {hasMore && !showAll && (
        <div className="mt-5 grid place-items-center">
          <button
            onClick={() => setShowAll(true)}
            className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/[0.08] px-6 py-3 text-[11px] font-mono uppercase tracking-widest text-accent transition-all hover:border-accent/50 hover:bg-accent/[0.12]"
          >
            View all related products ({items.length}) <ChevronDown className="size-3.5" />
          </button>
        </div>
      )}
    </section>
  );
}


