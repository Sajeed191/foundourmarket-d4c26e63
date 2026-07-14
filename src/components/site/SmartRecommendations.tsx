import { useMemo } from "react";
import { Sparkles, Eye, History, TrendingUp, MapPin, Star } from "lucide-react";
import type { ReactNode } from "react";
import { useRecommendationRail, useRecommendationSignals } from "@/lib/recommendations";
import type { StrategyKey } from "@/lib/recommendations";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useProducts } from "@/lib/use-products";
import { ProductCard } from "@/components/site/ProductCard";
import { ProductRail } from "@/components/site/ProductRail";
import { LazyMount } from "@/components/site/LazyMount";
import type { Product } from "@/lib/products";

/**
 * Smart, self-ordering homepage personalization block. Every rail is powered by
 * the centralized recommendation engine and reuses the shared premium
 * ProductCard. Rails hide themselves when empty, so guests / cold-start users
 * simply see fewer sections (trending / popular) while returning users get the
 * full personalized stack. Order adapts to whether the shopper has history.
 */

function EngineRail({
  eyebrow,
  title,
  icon,
  strategy,
  seed,
  limit = 12,
  exclude,
}: {
  eyebrow: string;
  title: string;
  icon: ReactNode;
  strategy: StrategyKey;
  seed?: Product;
  limit?: number;
  exclude?: string[];
}) {
  const { products, loading } = useRecommendationRail({ strategy, seed, limit, exclude });
  if (loading || products.length < 4) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 motion-safe:animate-fade-in">
      <div className="flex items-end justify-between gap-4 mb-4 sm:mb-5 px-1">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-2 flex items-center gap-1.5">
            {icon} {eyebrow}
          </p>
          <h2 className="text-lg sm:text-2xl md:text-3xl font-display font-semibold tracking-tight">
            {title}
          </h2>
        </div>
      </div>
      <ProductRail products={products} compact />
      <div
        data-product-grid
        className="hidden sm:grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4"
      >
        {products.map((p) => (
          <ProductCard key={p.id ?? p.slug} product={p} compact />
        ))}
      </div>
    </section>
  );
}

export function SmartRecommendations() {
  const { personalized } = useRecommendationSignals();
  const { entries } = useRecentlyViewed();
  const { products } = useProducts();

  // Seed "Because You Viewed" from the most recently viewed in-catalog product.
  const seed = useMemo(() => {
    for (const e of entries) {
      const p = products.find((x) => x.slug === e.slug);
      if (p) return p;
    }
    return undefined;
  }, [entries, products]);

  return (
    <LazyMount minHeight={320}>
      <>
        {personalized ? (
          <>
            <EngineRail
              eyebrow="Picked for you"
              title="Recommended For You"
              icon={<Sparkles className="size-3" />}
              strategy="personalized"
            />
            {seed && (
              <EngineRail
                eyebrow="Because you viewed"
                title={`More like ${seed.name}`}
                icon={<Eye className="size-3" />}
                strategy="because_you_viewed"
                seed={seed}
              />
            )}
            <EngineRail
              eyebrow="Jump back in"
              title="Continue Shopping"
              icon={<History className="size-3" />}
              strategy="continue_shopping"
            />
            <EngineRail
              eyebrow="In your region"
              title="Popular Near You"
              icon={<MapPin className="size-3" />}
              strategy="popular_near_you"
            />
          </>
        ) : (
          <>
            <EngineRail
              eyebrow="In your region"
              title="Popular Near You"
              icon={<MapPin className="size-3" />}
              strategy="popular_near_you"
            />
          </>
        )}
      </>
    </LazyMount>
  );
}
