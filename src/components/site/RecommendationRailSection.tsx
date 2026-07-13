import { useEffect, useRef } from "react";
import { ProductCard } from "./ProductCard";
import { ProductRail } from "./ProductRail";
import { LazyMount } from "./LazyMount";
import type { RecommendationItem, RecommendationSource } from "@/lib/recommendations/types";
import { recordImpression, markRecommendationClick } from "@/lib/recommendations/performance";

type Props = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  icon?: React.ReactNode;
  items: RecommendationItem[];
  source: RecommendationSource;
};

/**
 * One PDP recommendation rail. Reuses the premium ProductCard everywhere,
 * records an impression when it mounts and a click when a card is tapped, so
 * the self-improving performance tracker can down-rank strategies that under-
 * perform. Reason + confidence metadata is kept internal (data-* attributes for
 * debugging only, never surfaced to shoppers).
 */
export function RecommendationRailSection({
  title,
  subtitle,
  eyebrow = "Recommended",
  items,
  source,
}: Props) {
  const impressed = useRef(false);
  useEffect(() => {
    if (impressed.current || items.length === 0) return;
    impressed.current = true;
    recordImpression(source);
  }, [items.length, source]);

  if (items.length === 0) return null;
  const products = items.map((it) => it.product);

  return (
    <LazyMount minHeight={160} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <section
        className="py-6 sm:py-9"
        data-rec-source={source}
        onClickCapture={(e) => {
          const slug = (e.target as HTMLElement).closest<HTMLElement>("[data-product-slug]")
            ?.dataset.productSlug;
          markRecommendationClick(source, slug);
        }}
      >
        <div className="mb-3 sm:mb-5">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-1.5">
            {eyebrow}
          </p>
          <h2 className="text-lg sm:text-2xl md:text-3xl font-display font-semibold tracking-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[11px] sm:text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>

        <ProductRail products={products} compact />
        <div
          data-product-grid
          className="hidden sm:grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4 items-stretch"
        >
          {items.map((it) => (
            <div
              key={it.product.id ?? it.product.slug}
              data-product-card-frame
              data-rec-reason={it.reason}
              data-rec-confidence={it.confidence.toFixed(2)}
              className="h-full rounded-2xl glow-border"
            >
              <ProductCard product={it.product} compact />
            </div>
          ))}
        </div>
      </section>
    </LazyMount>
  );
}
