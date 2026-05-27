import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { fetchProductsBySlugs, type Product } from "@/lib/products";
import { ProductCard } from "./ProductCard";
import { ProductRail } from "./ProductRail";

type Props = {
  title: string;
  slugs: string[];
  icon?: React.ReactNode;
  subtitle?: string;
};

export function RecommendationStrip({ title, slugs, icon, subtitle }: Props) {
  const [products, setProducts] = useState<Product[] | null>(null);

  useEffect(() => {
    if (!slugs.length) { setProducts([]); return; }
    fetchProductsBySlugs(slugs).then(setProducts);
  }, [slugs.join(",")]);

  if (products && products.length === 0) return null;

  return (
    <section className="py-8 sm:py-10 scroll-mt-24">
      <div className="flex items-end justify-between mb-4 sm:mb-5 px-1">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-2">
            {icon ?? <Sparkles className="size-3" />}
            <span>For you</span>
          </div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-display font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="text-xs sm:text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
      </div>
      {!products ? (
        <>
          <div className="sm:hidden -mx-4 flex gap-3 overflow-hidden px-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="shrink-0 w-[68%] aspect-[4/5] rounded-2xl bg-card animate-pulse" />
            ))}
          </div>
          <div className="hidden sm:grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-[4/5] rounded-2xl bg-card animate-pulse" />
            ))}
          </div>
        </>
      ) : (
        <>
          <ProductRail products={products} />
          <div className="hidden sm:grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {products.map((p) => <ProductCard key={p.slug} product={p} />)}
          </div>
        </>
      )}
    </section>
  );
}
