import { useMemo } from "react";
import { Sparkles, Heart, History } from "lucide-react";
import { useProducts } from "@/lib/use-products";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useRegion } from "@/lib/region";
import { ProductCard } from "@/components/site/ProductCard";
import { ProductRail } from "@/components/site/ProductRail";
import type { Product } from "@/lib/products";

/**
 * A single recommendation rail — reuses the shared premium ProductCard used
 * everywhere on the site. Mobile shows the shared snap ProductRail; sm+ shows
 * the shared responsive product grid. No bespoke card design remains.
 */
function Rail({
  eyebrow,
  title,
  icon,
  products,
}: {
  eyebrow: string;
  title: string;
  icon: React.ReactNode;
  products: Product[];
}) {
  if (products.length === 0) return null;

  return (
    <section className="mt-8 motion-safe:animate-fade-in">
      <div className="flex items-end justify-between gap-4 mb-4 sm:mb-5 px-1">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-2 flex items-center gap-1.5">
            {icon} {eyebrow}
          </p>
          <h2 className="text-lg sm:text-2xl md:text-3xl font-display font-semibold tracking-tight">{title}</h2>
        </div>
      </div>

      <ProductRail products={products} compact />
      <div data-product-grid className="hidden sm:grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
        {products.map((p) => <ProductCard key={p.id ?? p.slug} product={p} compact />)}
      </div>
    </section>
  );
}

/**
 * AI-style recommendation rails for the wishlist page.
 * Computes "Based On Wishlist", "You May Also Like" and "Recently Viewed"
 * from category affinity, price range and browsing history.
 * Each rail hides itself when it has no products.
 */
export function WishlistRecommendations({ wishlistSlugs }: { wishlistSlugs: string[] }) {
  const { products } = useProducts();
  const { priceOf } = useRegion();
  const { slugs: recentSlugs } = useRecentlyViewed();

  const saved = useMemo(
    () => products.filter((p) => wishlistSlugs.includes(p.slug)),
    [products, wishlistSlugs],
  );

  // Affinity model from wishlist behaviour: category weight + price band.
  const model = useMemo(() => {
    const catWeight: Record<string, number> = {};
    let priceSum = 0;
    for (const p of saved) {
      catWeight[p.category] = (catWeight[p.category] ?? 0) + 1;
      priceSum += priceOf(p);
    }
    const avgPrice = saved.length ? priceSum / saved.length : 0;
    return { catWeight, avgPrice };
  }, [saved, priceOf]);

  const exclude = useMemo(() => new Set(wishlistSlugs), [wishlistSlugs]);

  // Based on wishlist — same categories, closest price, in stock first.
  const basedOn = useMemo(() => {
    if (saved.length === 0) return [];
    return products
      .filter((p) => !exclude.has(p.slug) && model.catWeight[p.category])
      .map((p) => {
        const catScore = (model.catWeight[p.category] ?? 0) * 3;
        const priceGap = Math.abs(priceOf(p) - model.avgPrice);
        const priceScore = model.avgPrice ? Math.max(0, 5 - priceGap / model.avgPrice) : 0;
        const stockScore = p.inStock ? 1 : 0;
        return { p, score: catScore + priceScore + stockScore + p.rating * 0.4 };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((x) => x.p);
  }, [products, saved.length, model, exclude, priceOf]);

  // You may also like — top rated / popular outside wishlist & not already shown.
  const youMayLike = useMemo(() => {
    const shown = new Set([...exclude, ...basedOn.map((p) => p.slug)]);
    return products
      .filter((p) => !shown.has(p.slug) && p.inStock)
      .sort(
        (a, b) =>
          b.rating * 2 + (b.soldCount ?? 0) / 50 - (a.rating * 2 + (a.soldCount ?? 0) / 50),
      )
      .slice(0, 12);
  }, [products, exclude, basedOn]);

  const recentlyViewed = useMemo(() => {
    const map = new Map(products.map((p) => [p.slug, p]));
    return recentSlugs
      .filter((s) => !exclude.has(s))
      .map((s) => map.get(s))
      .filter(Boolean)
      .slice(0, 12) as Product[];
  }, [products, recentSlugs, exclude]);

  if (
    basedOn.length === 0 &&
    youMayLike.length === 0 &&
    recentlyViewed.length === 0
  )
    return null;

  return (
    <div className="mt-12 pt-6 border-t border-border/60">
      <Rail
        eyebrow="Picked for you"
        title="Based On Your Wishlist"
        icon={<Heart className="size-3" />}
        products={basedOn}
      />
      <Rail
        eyebrow="Discover"
        title="You May Also Like"
        icon={<Sparkles className="size-3" />}
        products={youMayLike}
      />
      <Rail
        eyebrow="Continue browsing"
        title="Recently Viewed"
        icon={<History className="size-3" />}
        products={recentlyViewed}
      />
    </div>
  );
}
