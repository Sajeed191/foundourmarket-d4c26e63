import { useRef, useMemo } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useProducts } from "@/lib/use-products";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { ProductCard } from "@/components/site/ProductCard";

type Props = {
  /** Optional slug to exclude (e.g. current product on product page). */
  excludeSlug?: string;
  /** Heading text. */
  title?: string;
  /** Eyebrow label above heading. */
  eyebrow?: string;
  /** Target number of items shown. */
  limit?: number;
};

export function RecentlyViewed({
  excludeSlug,
  title = "Recently Viewed",
  eyebrow = "Continue Browsing",
  limit = 8,
}: Props) {
  const { products, loading } = useProducts();
  const { slugs, clear } = useRecentlyViewed();
  const scrollerRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const active = excludeSlug ? slugs.filter((s) => s !== excludeSlug) : slugs;
    const map = new Map(products.map((p) => [p.slug, p]));
    return active.map((s) => map.get(s)).filter(Boolean).slice(0, limit);
  }, [products, slugs, excludeSlug, limit]);

  function scroll(dir: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.85;
    el.scrollBy({ left: amount * dir, behavior: "smooth" });
  }

  if (loading || items.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="flex items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">{eyebrow}</p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-display tracking-tight">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clear}
            aria-label="Clear history"
            className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors"
          >
            <X className="size-3" /> Clear
          </button>
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
        className="flex gap-3 sm:gap-5 overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-4 sm:mx-0 px-4 sm:px-0 pb-2 scroll-smooth"
        style={{ scrollbarWidth: "none", scrollPaddingLeft: "1rem", scrollPaddingRight: "1rem" }}
      >
        {items.map((p) => (
          <div
            key={p!.slug}
            className="snap-start shrink-0 w-[58%] xs:w-[48%] sm:w-[38%] md:w-[28%] lg:w-[21%] last:mr-4 sm:last:mr-0"
          >
            <ProductCard product={p!} />
          </div>
        ))}

      </div>
    </section>
  );
}
