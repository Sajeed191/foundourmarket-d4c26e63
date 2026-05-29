import { useRef, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
};

export function RelatedProducts({
  product,
  excludeSlugs = [],
  title = "You may also like",
  eyebrow = "Discover",
  limit = 8,
}: Props) {
  const { products, loading } = useProducts();
  const scrollerRef = useRef<HTMLDivElement>(null);

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

  function scroll(dir: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.85;
    el.scrollBy({ left: amount * dir, behavior: "smooth" });
  }

  if (loading || items.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      <div className="flex items-end justify-between gap-4 mb-5 sm:mb-7">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-2">{eyebrow}</p>
          <h2 className="text-xl sm:text-3xl md:text-4xl font-display tracking-tight">{title}</h2>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <button
            onClick={() => scroll(-1)}
            aria-label="Scroll left"
            className="size-10 grid place-items-center rounded-full border border-border hover:border-accent/40 hover:text-accent transition-colors"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            onClick={() => scroll(1)}
            aria-label="Scroll right"
            className="size-10 grid place-items-center rounded-full border border-border hover:border-accent/40 hover:text-accent transition-colors"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="flex gap-2.5 sm:gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-4 sm:mx-0 px-4 sm:px-0 pb-2"
        style={{ scrollbarWidth: "none" }}
      >
        {items.map((p) => (
          <div
            key={p.slug}
            className="snap-start shrink-0 w-[42%] xs:w-[38%] sm:w-[30%] md:w-[22%] lg:w-[18%]"
          >
            <ProductCard product={p} compact />
          </div>
        ))}
      </div>
    </section>
  );
}

  );
}
