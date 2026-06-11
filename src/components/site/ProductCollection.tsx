import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useProducts } from "@/lib/use-products";
import { useRotationSeed, seededShuffle } from "@/lib/rotation";
import { ProductCard } from "@/components/site/ProductCard";
import type { Product } from "@/lib/products";
import type { BadgeKey } from "@/lib/badges";

export type CollectionSort = "trending" | "newest" | "best_sellers";

const SORTERS: Record<CollectionSort, (a: Product, b: Product) => number> = {
  trending: (a, b) => (b.viewsCount ?? 0) - (a.viewsCount ?? 0),
  newest: (a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
  best_sellers: (a, b) => (b.soldCount ?? 0) - (a.soldCount ?? 0),
};

/**
 * Full collection page for a homepage rail's "View All" destination.
 * Loads the whole catalogue (only here, not on the homepage preview) and
 * renders every product sorted by the rail's ranking.
 */
export function ProductCollection({
  eyebrow,
  title,
  description,
  icon: Icon,
  sort,
  filterFlag,
  forceBadge,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  sort: CollectionSort;
  /**
   * When set, only products with this merchandising badge enabled appear in
   * the collection. Products without the badge NEVER show here.
   */
  filterFlag?: "trending" | "bestseller" | "flashDeal" | "featured";
  /**
   * When set, each card shows ONLY this section's badge (e.g. Trending page →
   * Trending badge only), hiding any other badges the product qualifies for.
   */
  forceBadge?: BadgeKey | null;
}) {
  const { products, loading } = useProducts();
  const rotationSeed = useRotationSeed();

  const items = useMemo(() => {
    const base = filterFlag ? products.filter((p) => Boolean(p[filterFlag])) : products;
    // Reshuffle the order every 12:00 AM / PM rotation window so the lineup
    // feels fresh, while staying perfectly stable between boundaries.
    return seededShuffle([...base], rotationSeed);
  }, [products, filterFlag, rotationSeed]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 mobile-page-clearance md:pb-16">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground mb-5"
      >
        <ArrowLeft className="size-3.5" /> Back to home
      </Link>

      {/* Banner */}
      <header className="relative mb-8 overflow-hidden rounded-3xl product-card-glass p-6 sm:p-10">
        <div
          aria-hidden
          className="absolute -right-16 -top-16 size-64 rounded-full blur-3xl opacity-40"
          style={{ background: "var(--gradient-ember)" }}
        />
        <div className="relative">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-2 flex items-center gap-2">
            <Icon className="size-3" /> {eyebrow}
          </p>
          <h1 className="text-3xl sm:text-5xl font-display font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-2 text-sm max-w-lg">{description}</p>
        </div>
      </header>

      {loading ? (
        <div className="py-24 grid place-items-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-border rounded-2xl">
          <p className="text-muted-foreground">No products available yet. Check back soon.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
          {items.map((p) => (
            <ProductCard key={p.slug} product={p} compact forceBadge={forceBadge} />
          ))}
        </div>
      )}
    </div>
  );
}
