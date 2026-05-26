import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Eye, Trash2, ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useProducts } from "@/lib/use-products";
import { ProductCard } from "@/components/site/ProductCard";

export const Route = createFileRoute("/account/recently-viewed")({
  head: () => ({ meta: [{ title: "Recently viewed — FoundOurMarket™" }] }),
  component: RecentlyViewedPage,
});

function RecentlyViewedPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const { slugs, clear } = useRecentlyViewed();
  const { products, loading: pLoading } = useProducts();

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  const items = useMemo(
    () => slugs.map((s) => products.find((p) => p.slug === s)).filter(Boolean) as typeof products,
    [slugs, products],
  );

  if (loading || !user) {
    return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="container-page py-10 sm:py-14 max-w-6xl">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Account</p>
        <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
          <div>
            <h1 className="text-fluid-2xl font-display font-semibold">Recently viewed</h1>
            <p className="text-sm text-muted-foreground mt-2">Pick up where you left off — the last products you browsed.</p>
          </div>
          <div className="flex gap-3">
            {items.length > 0 && (
              <button onClick={clear} className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground hover:text-destructive">
                <Trash2 className="size-3.5" /> Clear
              </button>
            )}
            <Link to="/account" className="text-xs uppercase tracking-widest text-muted-foreground hover:text-accent">← Back</Link>
          </div>
        </div>
      </motion.div>

      {pLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] rounded-2xl bg-card border border-border animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card border border-border rounded-2xl p-12 sm:p-16 text-center">
          <div className="size-14 mx-auto mb-5 grid place-items-center rounded-full border border-border">
            <Eye className="size-5 text-muted-foreground" />
          </div>
          <p className="text-base font-medium">Nothing viewed yet</p>
          <p className="text-sm text-muted-foreground mt-1">Products you browse will appear here.</p>
          <Link to="/" className="mt-5 inline-flex items-center gap-1.5 bg-accent text-accent-foreground px-5 py-2.5 rounded-full text-xs uppercase tracking-widest font-bold">
            Explore <ArrowRight className="size-3" />
          </Link>
        </motion.div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((p, i) => (
            <motion.div key={p.slug} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03, duration: 0.3 }}>
              <ProductCard product={p} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
