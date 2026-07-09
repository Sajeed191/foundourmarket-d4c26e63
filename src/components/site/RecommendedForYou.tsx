import { Sparkles } from "lucide-react";
import { useRecommendations } from "@/lib/use-recommendations";
import { ProductCard } from "@/components/site/ProductCard";
import { ProductRail } from "@/components/site/ProductRail";

type Props = {
  /** Slug to exclude (e.g. the current product on the PDP). */
  excludeSlug?: string;
  title?: string;
  eyebrow?: string;
  subtitle?: string;
  /** Target number of items shown. */
  limit?: number;
};

/**
 * Recommended For You — an intelligent, behaviour-driven rail that reuses the
 * exact premium ProductCard used across the whole site. Never shows random
 * products: ordering comes from the shared recommendation engine and only
 * refreshes on meaningful signal changes. Mobile uses the shared snap rail;
 * sm+ uses the shared responsive grid. Renders nothing until it has results.
 */
export function RecommendedForYou({
  excludeSlug,
  title = "Recommended For You",
  eyebrow = "Picked For You",
  subtitle = "Curated from what you browse, save, and shop",
  limit = 12,
}: Props) {
  const { products, loading } = useRecommendations({ limit, excludeSlug });

  if (loading) {
    return (
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="mb-5 h-7 w-52 rounded-lg bg-white/[0.05] animate-pulse" />
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

  if (products.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10 motion-safe:animate-fade-in">
      <div className="flex items-end justify-between gap-4 mb-4 sm:mb-5 px-1">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-2 flex items-center gap-1.5">
            <Sparkles className="size-3" /> {eyebrow}
          </p>
          <h2 className="text-lg sm:text-2xl md:text-3xl font-display font-semibold tracking-tight">{title}</h2>
          <p className="text-[11px] sm:text-sm text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
      </div>

      <ProductRail products={products} compact />
      <div data-product-grid className="hidden sm:grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
        {products.map((p) => <ProductCard key={p.id ?? p.slug} product={p} compact />)}
      </div>
    </section>
  );
}
