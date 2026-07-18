import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Heart,
  ShoppingBag,
  Sparkles,
  Flame,
  Search,
  FilterX,
  History,
  ArrowRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useWishlist } from "@/lib/wishlist";
import { useProducts } from "@/lib/use-products";
import { useRegion } from "@/lib/region";
import { useRecommendations } from "@/lib/use-recommendations";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { type Product, discountPercent } from "@/lib/products";
import { ProductCard } from "@/components/site/ProductCard";
import { ProductSkeletonGrid } from "@/components/site/ProductSkeleton";
import { FilterSortBar, useFilterSort } from "@/components/site/FilterSortBar";
import { isProductVisible, useProductAvailability } from "@/lib/product-availability";

export const Route = createFileRoute("/wishlist")({
  head: () => ({
    meta: [
      { title: "Your Wishlist — FoundOurMarket™" },
      { name: "description", content: "Your saved products, curated. Track price drops, availability and value across everything you love on FoundOurMarket." },
    ],
  }),
  component: WishlistPage,
});

// ---------------------------------------------------------------------------
// Filters & sorts — compact pill controls that match the Browse page language.
// ---------------------------------------------------------------------------
type FilterKey = "all" | "in-stock" | "price-drops" | "free-shipping" | "low-stock" | "out-of-stock";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All items" },
  { key: "in-stock", label: "In stock" },
  { key: "price-drops", label: "Price drops" },
  { key: "free-shipping", label: "Free shipping" },
  { key: "low-stock", label: "Low stock" },
  { key: "out-of-stock", label: "Out of stock" },
];

type SortKey =
  | "recently-added"
  | "lowest-price"
  | "highest-price"
  | "highest-discount"
  | "best-rated"
  | "most-viewed";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "recently-added", label: "Recently added" },
  { key: "lowest-price", label: "Price: Low → High" },
  { key: "highest-price", label: "Price: High → Low" },
  { key: "highest-discount", label: "Biggest discount" },
  { key: "best-rated", label: "Best rated" },
  { key: "most-viewed", label: "Most viewed" },
];

// ---- Client-side price snapshot so we can detect drops after a save ----
const SNAP_KEY = "wishlist_price_snapshot";
type SnapStore = Record<string, Record<string, number>>;
function readSnap(): SnapStore {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(SNAP_KEY) || "{}");
  } catch {
    return {};
  }
}
function writeSnap(s: SnapStore) {
  try {
    localStorage.setItem(SNAP_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

const GRID = "grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5";

/** Mounts children only once they scroll near the viewport (below-the-fold lazy). */
function LazyMount({ children, minHeight = 320 }: { children: ReactNode; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || show) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [show]);
  return <div ref={ref} style={show ? undefined : { minHeight }}>{show ? children : null}</div>;
}

// Preserves horizontal scroll position per-carousel across remounts / navigation.
const carouselScroll = new Map<string, number>();

function ProductCarousel({ id, products }: { id: string; products: Product[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const saved = carouselScroll.get(id);
    if (saved) el.scrollLeft = saved;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => carouselScroll.set(id, el.scrollLeft));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", onScroll);
    };
  }, [id]);

  return (
    <div className="-mx-4 sm:mx-0">
      <div
        ref={ref}
        data-product-grid
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 pb-3 pt-1 sm:gap-5 sm:px-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollPaddingLeft: "1rem", overscrollBehaviorX: "contain", WebkitOverflowScrolling: "touch" }}
      >
        {products.map((p) => (
          <div
            key={p.id ?? p.slug}
            data-product-card-frame
            className="w-[46%] shrink-0 snap-start min-[420px]:w-[42%] sm:w-[240px] lg:w-[260px]"
          >
            <ProductCard product={p} />
          </div>
        ))}
        <div aria-hidden className="w-1 shrink-0" />
      </div>
    </div>
  );
}

function ProductSection({
  eyebrow,
  title,
  subtitle,
  icon,
  products,
  viewAllTo,
  carousel = false,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  icon: ReactNode;
  products: Product[];
  viewAllTo?: string;
  carousel?: boolean;
}) {
  if (products.length === 0) return null;
  return (
    <section className="mt-12 motion-safe:animate-fade-in">
      <div className="mb-4 flex items-end justify-between gap-4 px-1">
        <div>
          <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.3em] text-accent">
            {icon} {eyebrow}
          </p>
          <h2 className="text-lg font-display font-semibold tracking-tight sm:text-2xl">{title}</h2>
          {subtitle && <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{subtitle}</p>}
        </div>
        {viewAllTo && (
          <Link
            to={viewAllTo}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
          >
            View all <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>
      {carousel ? (
        <ProductCarousel id={title} products={products} />
      ) : (
        <div data-product-grid className={GRID}>
          {products.map((p) => (
            <ProductCard key={p.id ?? p.slug} product={p} />
          ))}
        </div>
      )}
    </section>
  );
}

function WishlistPage() {
  const { user, loading } = useAuth();
  const { slugs, loading: wlLoading } = useWishlist();
  const { products, loading: pLoading } = useProducts();
  const { format, priceOf, compareOf, shippingFeeOf, currency, currencyReady, market } = useRegion();
  const nav = useNavigate();

  const { filter, sort, setFilter, setSort } = useFilterSort<FilterKey, SortKey>({
    storageKey: "wishlist_filter_sort",
    defaultFilter: "all",
    defaultSort: "recently-added",
  });
  const [query, setQuery] = useState("");
  const [drops, setDrops] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  // Only active/visible saved products — deleted or admin-deactivated items
  // drop out automatically, so ghost products, counts and stats stay accurate.
  const items = useMemo(
    () => products.filter((p) => slugs.has(p.slug) && isProductVisible(p, market)),
    [products, slugs, market],
  );

  // Price-drop detection against a per-currency snapshot.
  useEffect(() => {
    if (!items.length) return;
    const snap = readSnap();
    const nextDrops: Record<string, number> = {};
    let changed = false;
    for (const p of items) {
      const cur = priceOf(p);
      snap[p.slug] = snap[p.slug] || {};
      const prev = snap[p.slug][currency];
      if (prev == null || cur > prev) {
        snap[p.slug][currency] = cur;
        changed = true;
      } else if (cur < prev) {
        nextDrops[p.slug] = prev - cur;
      }
    }
    if (changed) writeSnap(snap);
    setDrops(nextDrops);
  }, [items, priceOf, currency]);

  const lowStockOf = (p: Product) =>
    p.inStock && p.stockQuantity > 0 && p.stockQuantity <= (p.lowStockThreshold || 10);
  const discOf = (p: Product) => discountPercent(priceOf(p), compareOf(p)) ?? 0;

  // Header chip metrics.
  const stats = useMemo(() => {
    let total = 0;
    let savings = 0;
    for (const p of items) {
      total += priceOf(p);
      const cmp = compareOf(p);
      if (cmp && cmp > priceOf(p)) savings += cmp - priceOf(p);
    }
    return { total, savings, count: items.length };
  }, [items, priceOf, compareOf]);

  const filtered = useMemo(() => {
    let list = items;
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.tagline ?? "").toLowerCase().includes(q));
    switch (filter) {
      case "in-stock": list = list.filter((p) => p.inStock); break;
      case "out-of-stock": list = list.filter((p) => !p.inStock); break;
      case "low-stock": list = list.filter(lowStockOf); break;
      case "price-drops": list = list.filter((p) => (drops[p.slug] ?? 0) > 0); break;
      case "free-shipping": list = list.filter((p) => shippingFeeOf(p) <= 0); break;
    }
    const sorted = [...list];
    switch (sort) {
      case "lowest-price": sorted.sort((a, b) => priceOf(a) - priceOf(b)); break;
      case "highest-price": sorted.sort((a, b) => priceOf(b) - priceOf(a)); break;
      case "highest-discount": sorted.sort((a, b) => discOf(b) - discOf(a)); break;
      case "best-rated": sorted.sort((a, b) => b.rating - a.rating); break;
      case "most-viewed": sorted.sort((a, b) => (b.viewsCount ?? 0) - (a.viewsCount ?? 0)); break;
      case "recently-added": default: sorted.reverse(); break;
    }
    return sorted;
  }, [items, query, filter, sort, drops, priceOf, compareOf, shippingFeeOf]);

  const hasActiveFilter = filter !== "all" || query.trim().length > 0;
  const clearFilters = () => {
    setFilter("all");
    setQuery("");
  };

  if (loading || !user || wlLoading || pLoading || !currencyReady) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 mobile-page-clearance sm:px-6 md:pb-12">
        <div className="mb-8 h-8 w-48 animate-pulse rounded bg-white/[0.05]" />
        <ProductSkeletonGrid count={8} />
      </div>
    );
  }

  const chip = (label: string, value: string, tone: "default" | "accent" | "emerald" = "default") => (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-display font-semibold tabular-nums ${
        tone === "accent"
          ? "border-accent/40 bg-accent/10 text-accent"
          : tone === "emerald"
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            : "border-border bg-card text-foreground"
      }`}
    >
      {value}
      <span className="font-mono text-[10px] font-medium uppercase tracking-widest opacity-70">{label}</span>
    </span>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 pt-10 pb-4 sm:px-6 sm:py-14 sm:pb-14 md:pb-16">
      {/* Header */}
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-accent">
        Wishlist · {stats.count} {stats.count === 1 ? "Item" : "Items"}
      </p>
      <h1 className="text-3xl font-display font-semibold md:text-5xl">Your Wishlist</h1>
      {stats.count > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {chip("Saved", String(stats.count))}
          {chip("Value", format(stats.total), "accent")}
          {stats.savings > 0 && chip("Savings", format(stats.savings), "emerald")}
        </div>
      )}

      {items.length === 0 ? (
        <>
          <div className="mt-8 rounded-3xl border border-border bg-card p-12 text-center motion-safe:animate-[fade-up_0.5s_ease-out]">
            <div className="mx-auto mb-5 grid size-16 place-items-center rounded-full border border-accent/30 bg-accent/15 text-accent motion-safe:animate-[float-soft_3s_ease-in-out_infinite]">
              <Heart className="size-6 fill-accent/40" />
            </div>
            <h2 className="mb-1.5 text-xl font-display font-semibold">Your Wishlist Is Empty 🧡</h2>
            <p className="mx-auto mb-6 max-w-xs text-sm text-muted-foreground">
              Discover products you'll love and tap the heart to save them here.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-[11px] font-bold uppercase tracking-widest text-accent-foreground shadow-[var(--shadow-ember)] transition-all hover:brightness-110"
              >
                <ShoppingBag className="size-3.5" /> Browse Products
              </Link>
              <Link
                to="/search"
                className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-3 text-[11px] font-bold uppercase tracking-widest transition-colors hover:border-accent/40"
              >
                <Flame className="size-3.5" /> Trending
              </Link>
            </div>
          </div>
          <LazyMount>
            <RecentlyViewedSection excludeSlugs={slugs} />
          </LazyMount>
        </>
      ) : (
        <>
          {/* Controls — Search · Filter · Sort */}
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your wishlist…"
                className="w-full rounded-full border border-border bg-card py-2.5 pl-11 pr-4 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-accent/50 focus:ring-2 focus:ring-accent/30"
              />
            </div>
            <FilterSortBar
              filterOptions={FILTERS}
              sortOptions={SORTS}
              filter={filter}
              sort={sort}
              onFilterChange={setFilter}
              onSortChange={setSort}
              isFilterActive={filter !== "all"}
            />
          </div>


          {/* Saved products */}
          <div className="mt-6">
            {filtered.length === 0 ? (
              <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-10 text-center motion-safe:animate-[fade-up_0.4s_ease-out]">
                <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full border border-accent/30 bg-accent/10 text-accent">
                  <FilterX className="size-5" />
                </div>
                <h3 className="mb-1.5 text-base font-display font-semibold">No matching items</h3>
                <p className="mx-auto mb-5 max-w-xs text-sm text-muted-foreground">
                  {query.trim()
                    ? `No saved items match "${query.trim()}"${filter !== "all" ? ` with the "${FILTERS.find((f) => f.key === filter)?.label}" filter` : ""}.`
                    : `None of your saved items match the "${FILTERS.find((f) => f.key === filter)?.label}" filter right now.`}
                </p>
                {hasActiveFilter && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-6 text-[11px] font-bold uppercase tracking-widest text-accent-foreground shadow-[var(--shadow-ember)] transition-all hover:brightness-110 active:scale-[0.97]"
                  >
                    <FilterX className="size-3.5" /> Clear filters
                  </button>
                )}
              </div>
            ) : (
              <div data-product-grid className={GRID}>
                {filtered.map((p) => (
                  <ProductCard key={p.id ?? p.slug} product={p} />
                ))}
              </div>
            )}
          </div>

          {/* Smart sections — lazy, hide when empty */}
          <LazyMount>
            <RecentlyViewedSection excludeSlugs={slugs} />
          </LazyMount>
          <LazyMount>
            <RecommendedSection />
          </LazyMount>
        </>
      )}
    </div>
  );
}

/** Recently Viewed — shared ProductCard, excludes wishlist items, max 15. */
function RecentlyViewedSection({ excludeSlugs }: { excludeSlugs: Set<string> }) {
  const { resolveVisible } = useProductAvailability();
  const { slugs } = useRecentlyViewed();
  const list = useMemo(
    () => resolveVisible(slugs.filter((s) => !excludeSlugs.has(s))).slice(0, 15),
    [resolveVisible, slugs, excludeSlugs],
  );

  return (
    <ProductSection
      eyebrow="Continue browsing"
      title="Recently Viewed"
      subtitle="Pick up where you left off"
      icon={<History className="size-3" />}
      products={list}
      viewAllTo="/recently-viewed"
      carousel
    />
  );
}

/** Recommended For You — engine already excludes saved / cart / purchased, max 15. */
function RecommendedSection() {
  const { products } = useRecommendations({ limit: 15 });
  return (
    <ProductSection
      eyebrow="Picked for you"
      title="Recommended For You"
      subtitle="Curated from your saved items"
      icon={<Sparkles className="size-3" />}
      products={products}
      viewAllTo="/recommended"
      carousel
    />

  );
}
