import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Clock,
  ShoppingBag,
  Sparkles,
  Search,
  X,
  SlidersHorizontal,
  ArrowUpDown,
  Check,
} from "lucide-react";
import { motion } from "framer-motion";
import { useProducts } from "@/lib/use-products";
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

/** "Viewed just now", "2 hours ago", "Yesterday", "3 days ago". */
function viewedLabel(at: number): string {
  const diff = Date.now() - at;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Viewed just now";
  if (min < 60) return `Viewed ${min} min${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `Viewed ${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "Viewed yesterday";
  if (day < 7) return `Viewed ${day} days ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `Viewed ${wk} week${wk === 1 ? "" : "s"} ago`;
  return "Viewed a while ago";
}

type FilterKey = "all" | "in-stock" | "on-sale" | "out-of-stock";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All items" },
  { key: "in-stock", label: "In stock" },
  { key: "on-sale", label: "On sale" },
  { key: "out-of-stock", label: "Out of stock" },
];

type SortKey = "recent" | "lowest-price" | "highest-price" | "best-rated" | "highest-discount";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Recently viewed" },
  { key: "lowest-price", label: "Price: Low → High" },
  { key: "highest-price", label: "Price: High → Low" },
  { key: "best-rated", label: "Best rated" },
  { key: "highest-discount", label: "Biggest discount" },
];

function RecentlyViewedPage() {
  const { products, loading } = useProducts();
  const { entries, clear, remove } = useRecentlyViewed();
  const { priceOf, compareOf } = useRegion();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("recent");

  // Preserve view order + timestamps by joining entries with the catalog.
  const items = useMemo(() => {
    const map = new Map(products.map((p) => [p.slug, p]));
    return entries
      .map((e) => {
        const p = map.get(e.slug);
        return p ? { product: p, at: e.at } : null;
      })
      .filter(Boolean) as { product: Product; at: number }[];
  }, [products, entries]);

  const discOf = (p: Product) => discountPercent(priceOf(p), compareOf(p)) ?? 0;

  const filtered = useMemo(() => {
    let list = items;
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        ({ product: p }) => p.name.toLowerCase().includes(q) || (p.tagline ?? "").toLowerCase().includes(q),
      );
    }
    switch (filter) {
      case "in-stock": list = list.filter(({ product: p }) => p.inStock); break;
      case "out-of-stock": list = list.filter(({ product: p }) => !p.inStock); break;
      case "on-sale": list = list.filter(({ product: p }) => discOf(p) > 0); break;
    }
    const sorted = [...list];
    switch (sort) {
      case "lowest-price": sorted.sort((a, b) => priceOf(a.product) - priceOf(b.product)); break;
      case "highest-price": sorted.sort((a, b) => priceOf(b.product) - priceOf(a.product)); break;
      case "best-rated": sorted.sort((a, b) => b.product.rating - a.product.rating); break;
      case "highest-discount": sorted.sort((a, b) => discOf(b.product) - discOf(a.product)); break;
      case "recent": default: sorted.sort((a, b) => b.at - a.at); break;
    }
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, query, filter, sort]);

  const activeFilter = FILTERS.find((f) => f.key === filter)!;
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
        <Clock className="size-3" />
        Recently Viewed · {items.length} {items.length === 1 ? "Item" : "Items"}
      </p>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
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
          <h2 className="text-xl font-display font-semibold mb-1.5">No recently viewed products yet</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
            Start browsing products and they will appear here automatically.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <Link
              to="/"
              className="inline-flex items-center gap-2 bg-accent text-accent-foreground rounded-full px-6 py-3 text-[11px] uppercase tracking-widest font-bold hover:brightness-110 transition-all shadow-[var(--shadow-ember)]"
            >
              <ShoppingBag className="size-3.5" /> Continue Shopping
            </Link>
            <Link
              to="/recommended"
              className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-3 text-[11px] uppercase tracking-widest font-bold hover:border-accent/40 transition-colors"
            >
              <Sparkles className="size-3.5" /> Recommended
            </Link>
          </div>
        </motion.div>
      ) : (
        <>
          {/* Controls — Search · Filter · Sort */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-6">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your history…"
                className="w-full rounded-full border border-border bg-card py-2.5 pl-11 pr-4 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-accent/50 focus:ring-2 focus:ring-accent/30"
              />
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest transition-colors hover:border-accent/40 data-[state=open]:border-accent/50">
                  <SlidersHorizontal className="size-3.5" /> {activeFilter.label}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-44">
                  {FILTERS.map((f) => (
                    <DropdownMenuItem key={f.key} onSelect={() => setFilter(f.key)} className="justify-between text-xs">
                      {f.label} {filter === f.key && <Check className="size-3.5 text-accent" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
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
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
              No items match your search or filter.
            </div>
          ) : (
            <div
              data-product-grid
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5"
            >
              {filtered.map(({ product, at }, i) => (
                <motion.div
                  key={product.id ?? product.slug}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: Math.min(i * 0.03, 0.3) }}
                  data-product-card-frame
                  className="group/rv relative"
                >
                  <button
                    onClick={() => remove(product.slug)}
                    aria-label={`Remove ${product.name} from history`}
                    className="absolute right-2 top-2 z-20 grid size-7 place-items-center rounded-full border border-border bg-background/80 text-muted-foreground opacity-0 backdrop-blur transition-all hover:border-accent/50 hover:text-accent active:scale-90 group-hover/rv:opacity-100 focus:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                  <ProductCard product={product} />
                  <p className="mt-1.5 px-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {viewedLabel(at)}
                  </p>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
