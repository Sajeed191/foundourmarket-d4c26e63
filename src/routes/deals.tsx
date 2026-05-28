import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { motion } from "framer-motion";
import { Gift, Tag, Loader2, Percent, Zap, Clock } from "lucide-react";
import { useProducts } from "@/lib/use-products";
import { useRegion } from "@/lib/region";
import { ProductCard } from "@/components/site/ProductCard";

export const Route = createFileRoute("/deals")({
  head: () => ({
    meta: [
      { title: "Deals & Promos — FoundOurMarket™" },
      { name: "description", content: "Discover the best deals and promotions on FoundOurMarket™. Limited-time offers, flash sales, and exclusive discounts." },
      { property: "og:title", content: "Deals & Promos — FoundOurMarket™" },
      { property: "og:description", content: "Discover the best deals and promotions on FoundOurMarket™. Limited-time offers, flash sales, and exclusive discounts." },
    ],
  }),
  component: DealsPage,
});

const ease = [0.16, 1, 0.3, 1] as const;
const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease },
};

function DealsPage() {
  const { products, loading } = useProducts();
  const { format } = useRegion();

  const dealProducts = useMemo(
    () => products.filter((p) => (p.discount ?? 0) > 0).sort((a, b) => (b.discount ?? 0) - (a.discount ?? 0)),
    [products]
  );

  const topDiscount = dealProducts[0]?.discount ?? 0;

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of dealProducts) {
      map.set(p.category, (map.get(p.category) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [dealProducts]);

  if (loading) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      {/* Ambient glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[120%] h-[50vh] opacity-50" style={{ background: "var(--gradient-ember-soft)", filter: "blur(120px)" }} />
      </div>

      <div className="container-page py-6 sm:py-10 lg:py-14 space-y-8 sm:space-y-10">
        {/* Header */}
        <motion.header {...fadeUp} className="relative overflow-hidden rounded-[28px] sm:rounded-3xl glass-strong p-6 sm:p-8 lg:p-10">
          <div aria-hidden className="absolute inset-0 -z-10">
            <div className="absolute -top-32 -right-20 size-[420px] rounded-full opacity-60" style={{ background: "var(--gradient-ember)", filter: "blur(80px)" }} />
            <div className="absolute -bottom-32 -left-24 size-[360px] rounded-full opacity-50" style={{ background: "var(--gradient-violet)", filter: "blur(90px)" }} />
          </div>
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-2 flex items-center gap-1.5">
                <Tag className="size-3" /> Limited Time
              </p>
              <h1 className="text-fluid-2xl font-display font-semibold leading-tight">
                Deals & <span className="text-gradient-ember">Promos</span>
              </h1>
              <p className="text-sm text-muted-foreground mt-2 max-w-md">
                Exclusive discounts and flash sales curated for you. Grab them before they’re gone.
              </p>
            </div>
            {topDiscount > 0 && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, ease, duration: 0.5 }}
                className="shrink-0 flex items-center gap-3 rounded-2xl glass-strong p-4 sm:p-5"
              >
                <span className="size-12 sm:size-14 rounded-2xl bg-accent/15 text-accent grid place-items-center shadow-[0_0_24px_-6px_var(--color-accent)]">
                  <Percent className="size-5 sm:size-6" />
                </span>
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Best deal</p>
                  <p className="text-2xl sm:text-3xl font-display font-bold text-gradient-ember">Up to {topDiscount}% off</p>
                </div>
              </motion.div>
            )}
          </div>

          {/* Category chips */}
          {categories.length > 0 && (
            <div className="relative flex flex-wrap gap-2 mt-6">
              {categories.map(([cat, count]) => (
                <Link
                  key={cat}
                  to="/search"
                  search={{ cat }}
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-medium bg-white/[0.05] border border-white/10 hover:border-accent/40 hover:text-accent hover:bg-accent/10 transition-all"
                >
                  {cat}
                  <span className="text-[9px] text-muted-foreground">{count}</span>
                </Link>
              ))}
            </div>
          )}
        </motion.header>

        {/* Deal count bar */}
        {dealProducts.length > 0 && (
          <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.05 }} className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              <span className="text-foreground font-semibold">{dealProducts.length}</span> active deal{dealProducts.length === 1 ? "" : "s"}
            </p>
            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              <Zap className="size-3 text-accent" />
              Prices updated live
            </div>
          </motion.div>
        )}

        {/* Products grid */}
        {dealProducts.length > 0 ? (
          <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.08 }}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {dealProducts.map((p, i) => (
                <motion.div
                  key={p.slug}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.4, ease, delay: Math.min(i * 0.04, 0.3) }}
                >
                  <ProductCard product={p} />
                </motion.div>
              ))}
            </div>
          </motion.section>
        ) : (
          <EmptyDeals />
        )}
      </div>
    </div>
  );
}

function EmptyDeals() {
  return (
    <motion.div {...fadeUp} className="card-premium rounded-2xl border-dashed p-10 sm:p-14 flex flex-col items-center text-center relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 size-40 rounded-full blur-3xl opacity-40" style={{ background: "var(--gradient-ember)" }} />
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        className="relative size-14 rounded-2xl bg-accent/10 text-accent grid place-items-center mb-4 ring-1 ring-accent/30 shadow-[0_0_20px_-6px_var(--color-accent)]"
      >
        <Gift className="size-6" />
      </motion.div>
      <p className="relative text-lg font-display font-semibold">No active deals</p>
      <p className="relative text-sm text-muted-foreground mt-2 max-w-sm">
        We’re working on fresh promotions. Check back soon for exclusive discounts and flash sales.
      </p>
      <Link
        to="/search"
        className="relative mt-6 inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground px-5 py-2.5 text-[11px] uppercase tracking-widest font-bold hover:brightness-110 transition-all"
      >
        <Clock className="size-3.5" /> Browse all products
      </Link>
    </motion.div>
  );
}
