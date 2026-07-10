import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  ShoppingBag,
  Search,
  ArrowUpDown,
  Check,
  Clock,
  Wand2,
} from "lucide-react";
import { motion } from "framer-motion";
import { useRecommendations } from "@/lib/use-recommendations";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useRegion } from "@/lib/region";
import { ProductCard } from "@/components/site/ProductCard";
import { ProductSkeletonGrid } from "@/components/site/ProductSkeleton";
import { discountPercent, type Product } from "@/lib/products";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/recommended")({
  head: () => ({
    meta: [
      { title: "Recommended For You — FoundOurMarket™" },
      { name: "description", content: "Personalized product recommendations curated from your browsing, wishlist, cart and favourite categories." },
      { property: "og:title", content: "Recommended For You — FoundOurMarket™" },
      { property: "og:description", content: "Personalized product recommendations curated just for you on FoundOurMarket." },
    ],
  }),
  component: RecommendedPage,
});

type SortKey = "recommended" | "lowest-price" | "highest-price" | "best-rated" | "highest-discount";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "recommended", label: "Best match" },
  { key: "lowest-price", label: "Price: Low → High" },
  { key: "highest-price", label: "Price: High → Low" },
  { key: "best-rated", label: "Best rated" },
  { key: "highest-discount", label: "Biggest discount" },
];

const PAGE = 16;

function RecommendedPage() {
  const { products: recommended, loading } = useRecommendations({ limit: 60 });
  const { slugs: recentSlugs } = useRecentlyViewed();
  const { priceOf, compareOf } = useRegion();

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recommended");
  const [visible, setVisible] = useState(PAGE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const discOf = (p: Product) => discountPercent(priceOf(p), compareOf(p)) ?? 0;

  // Never duplicate products already surfaced in Recently Viewed.
  const base = useMemo(() => {
    const recent = new Set(recentSlugs);
    return recommended.filter((p) => !recent.has(p.slug));
  }, [recommended, recentSlugs]);

  const filtered = useMemo(() => {
    let list = base;
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.tagline ?? "").toLowerCase().includes(q));
    }
    if (sort === "recommended") return list; // preserve engine ordering
    const sorted = [...list];
    switch (sort) {
      case "lowest-price": sorted.sort((a, b) => priceOf(a) - priceOf(b)); break;
      case "highest-price": sorted.sort((a, b) => priceOf(b) - priceOf(a)); break;
      case "best-rated": sorted.sort((a, b) => b.rating - a.rating); break;
      case "highest-discount": sorted.sort((a, b) => discOf(b) - discOf(a)); break;
    }
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, query, sort]);

  // Reset paging when the result set changes.
  useEffect(() => setVisible(PAGE), [query, sort]);

  // Infinite scroll — reveal more cards as the sentinel nears the viewport.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible((v) => Math.min(v + PAGE, filtered.length));
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length]);

  const shown = filtered.slice(0, visible);
  const activeSort = SORTS.find((s) => s.key === sort)!;

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16 mobile-page-clearance md:pb-16">
        <div className="h-8 w-56 rounded bg-white/[0.05] animate-pulse mb-8" />
        <ProductSkeletonGrid count={8} />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16 mobile-page-clearance md:pb-16"
    >
      {/* Header */}
      <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3 flex items-center gap-2">
        <Sparkles className="size-3" />
        Recommended · {base.length} {base.length === 1 ? "Pick" : "Picks"}
      </p>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl md:text-5xl font-display font-semibold">Recommended For You</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-md">
            Curated from your browsing, wishlist, cart and favourite categories — updated as you shop.
          </p>
        </div>
      </div>

      {base.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="card-premium rounded-2xl p-12 text-center"
        >
          <div className="size-16 mx-auto mb-5 grid place-items-center rounded-full bg-accent/15 border border-accent/30 text-accent animate-[float-soft_3s_ease-in-out_infinite]">
            <Wand2 className="size-6" />
          </div>
          <h2 className="text-xl font-display font-semibold mb-1.5">No recommendations yet</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
            Browse products, save favourites and add items to your cart — we'll tailor picks just for you.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <Link
              to="/"
              className="inline-flex items-center gap-2 bg-accent text-accent-foreground rounded-full px-6 py-3 text-[11px] uppercase tracking-widest font-bold hover:brightness-110 transition-all shadow-[var(--shadow-ember)]"
            >
              <ShoppingBag className="size-3.5" /> Continue Shopping
            </Link>
            <Link
              to="/recently-viewed"
              className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-3 text-[11px] uppercase tracking-widest font-bold hover:border-accent/40 transition-colors"
            >
              <Clock className="size-3.5" /> Recently Viewed
            </Link>
          </div>
        </motion.div>
      ) : (
        <>
          {/* Controls — Search · Sort */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-6">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search recommendations…"
                className="w-full rounded-full border border-border bg-card py-2.5 pl-11 pr-4 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-accent/50 focus:ring-2 focus:ring-accent/30"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest transition-colors hover:border-accent/40 data-[state=open]:border-accent/50">
                <ArrowUpDown className="size-3.5" /> {activeSort.label}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                {SORTS.map((s) => (
                  <DropdownMenuItem key={s.key} onSelect={() => setSort(s.key)} className="justify-between text-xs">
                    {s.label} {sort === s.key && <Check className="size-3.5 text-accent" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
              No recommendations match your search.
            </div>
          ) : (
            <>
              <div
                data-product-grid
                className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5"
              >
                {shown.map((product, i) => (
                  <motion.div
                    key={product.id ?? product.slug}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: Math.min((i % PAGE) * 0.03, 0.3) }}
                    data-product-card-frame
                  >
                    <ProductCard product={product} />
                  </motion.div>
                ))}
              </div>
              {visible < filtered.length && <div ref={sentinelRef} aria-hidden className="h-10" />}
            </>
          )}
        </>
      )}
    </motion.div>
  );
}
