import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Clock, ShoppingBag, Sparkles, Search } from "lucide-react";
import { motion } from "framer-motion";
import { useProducts } from "@/lib/use-products";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { ProductCard } from "@/components/site/ProductCard";
import { ProductSkeletonGrid } from "@/components/site/ProductSkeleton";
import type { Product } from "@/lib/products";

export const Route = createFileRoute("/recently-viewed")({
  head: () => ({
    meta: [
      { title: "Recently Viewed — FoundOurMarket™" },
      { name: "description", content: "Pick up where you left off. Your recently viewed products, all in one place." },
      { property: "og:title", content: "Recently Viewed — FoundOurMarket™" },
      { property: "og:description", content: "Pick up where you left off. Your recently viewed products, all in one place." },
    ],
  }),
  component: RecentlyViewedPage,
});

function RecentlyViewedPage() {
  const { products, loading } = useProducts();
  const { slugs, clear } = useRecentlyViewed();

  const items = useMemo(() => {
    const map = new Map(products.map((p) => [p.slug, p]));
    return slugs.map((s) => map.get(s)).filter(Boolean) as Product[];
  }, [products, slugs]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16 mobile-page-clearance md:pb-16">
        <div className="h-8 w-56 rounded bg-white/[0.05] animate-pulse mb-8" />
        <ProductSkeletonGrid count={8} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16 mobile-page-clearance md:pb-16">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3 flex items-center gap-2">
          <Clock className="size-3" />
          Recently Viewed · {items.length} {items.length === 1 ? "Item" : "Items"}
        </p>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl md:text-5xl font-display font-semibold">Recently Viewed</h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">
              Products you have browsed recently. Tap any item to continue exploring.
            </p>
          </div>
          {items.length > 0 && (
            <button
              onClick={clear}
              className="shrink-0 inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-[11px] uppercase tracking-widest font-bold hover:border-accent/40 hover:text-accent active:scale-95 transition-all"
            >
              <Clock className="size-3.5" /> Clear History
            </button>
          )}
        </div>
      </motion.div>

      {/* Empty state */}
      {items.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="card-premium rounded-2xl p-12 text-center"
        >
          <div className="size-16 mx-auto mb-5 grid place-items-center rounded-full bg-accent/15 border border-accent/30 text-accent animate-[float-soft_3s_ease-in-out_infinite]">
            <Clock className="size-6" />
          </div>
          <h2 className="text-xl font-display font-semibold mb-1.5">No Recent Views Yet</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
            Start browsing products and they will appear here automatically.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <Link
              to="/"
              className="inline-flex items-center gap-2 bg-accent text-accent-foreground rounded-full px-6 py-3 text-[11px] uppercase tracking-widest font-bold hover:brightness-110 transition-all shadow-[var(--shadow-ember)]"
            >
              <ShoppingBag className="size-3.5" /> Browse Products
            </Link>
            <Link
              to="/products/trending"
              className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-3 text-[11px] uppercase tracking-widest font-bold hover:border-accent/40 transition-colors"
            >
              <Sparkles className="size-3.5" /> Trending
            </Link>
            <Link
              to="/search"
              className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-3 text-[11px] uppercase tracking-widest font-bold hover:border-accent/40 transition-colors"
            >
              <Search className="size-3.5" /> Search
            </Link>
          </div>
        </motion.div>
      ) : (
        /* Product grid */
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5"
        >
          {items.map((product, i) => (
            <motion.div
              key={product.slug}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              data-product-card-frame
            >
              <ProductCard product={product} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
