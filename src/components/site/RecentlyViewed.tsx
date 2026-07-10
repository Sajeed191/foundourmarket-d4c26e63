import { useMemo } from "react";
import { X } from "lucide-react";
import { useProducts } from "@/lib/use-products";
import { useProductAvailability } from "@/lib/product-availability";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { ProductCard } from "@/components/site/ProductCard";
import { ProductRail } from "@/components/site/ProductRail";

type Props = {
  /** Optional slug to exclude (e.g. current product on product page). */
  excludeSlug?: string;
  /** Heading text. */
  title?: string;
  /** Eyebrow label above heading. */
  eyebrow?: string;
  /** Subtitle beneath the heading. */
  subtitle?: string;
  /** Target number of items shown. */
  limit?: number;
};

/**
 * Recently Viewed rail — uses the exact same premium ProductCard used across
 * Home, Flash Deals, Trending, Search and Recommendations. Mobile shows the
 * shared snap ProductRail; sm+ shows the shared responsive product grid. No
 * bespoke card design remains.
 */
export function RecentlyViewed({
  excludeSlug,
  title = "Recently Viewed",
  eyebrow = "Continue Browsing",
  subtitle = "Continue where you left off",
  limit = 10,
}: Props) {
  const { loading } = useProducts();
  const { slugs, clear } = useRecentlyViewed();
  const { resolveVisible } = useProductAvailability();

  const items = useMemo(() => {
    const active = excludeSlug ? slugs.filter((s) => s !== excludeSlug) : slugs;
    // Skip deleted / deactivated products automatically; the next eligible
    // active products fill the rail up to `limit`.
    return resolveVisible(active).slice(0, limit);
  }, [resolveVisible, slugs, excludeSlug, limit]);

  if (loading) {
    return (
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="mb-5 h-7 w-44 rounded-lg bg-white/[0.05] animate-pulse" />
        <div className="sm:hidden -mx-4 flex gap-2.5 overflow-hidden px-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="shrink-0 w-[54%] aspect-[4/5] rounded-2xl bg-card animate-pulse" />
          ))}
        </div>
        <div className="hidden sm:grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="aspect-[4/5] rounded-2xl bg-card animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10 motion-safe:animate-fade-in">
      <div className="flex items-end justify-between gap-4 mb-4 sm:mb-5 px-1">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-2">{eyebrow}</p>
          <h2 className="text-lg sm:text-2xl md:text-3xl font-display font-semibold tracking-tight">{title}</h2>
          <p className="text-[11px] sm:text-sm text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <button
          onClick={clear}
          aria-label="Clear history"
          className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors shrink-0"
        >
          <X className="size-3" /> Clear
        </button>
      </div>

      <ProductRail products={items} compact />
      <div data-product-grid className="hidden sm:grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
        {items.map((p) => <ProductCard key={p.id ?? p.slug} product={p} compact />)}
      </div>
    </section>
  );
}
