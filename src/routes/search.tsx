import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal, X, Star, ShieldCheck, RefreshCw, BadgeCheck, Globe, Check, ArrowUpDown, Sparkles, TrendingUp, Flame, Clock, ArrowDownWideNarrow, ArrowUpWideNarrow, Tag, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { rowToProduct, discountPercent, SELECT_COLS, type Product } from "@/lib/products";
import { useCategories, useAllCategories } from "@/lib/use-categories";
import { MobileFilterDrawer } from "@/components/site/MobileFilterDrawer";
import {
  type Filters as ClientFilters,
  applyFilters as applyClientFilters,
  brandFacets,
  countActive,
  basePriceOf,
} from "@/lib/search-filters";
import { useRegion } from "@/lib/region";
import { ProductCard } from "@/components/site/ProductCard";
import { VirtualizedProductGrid } from "@/components/site/VirtualizedProductGrid";
import { ProductSkeletonGrid } from "@/components/site/ProductSkeleton";

import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { Switch } from "@/components/ui/switch";

type SearchParams = {
  q?: string;
  cat?: string;
  sub?: string;
  brand?: string;
  sort?: string;
  min?: number;
  max?: number;
  stock?: string;
  rating?: number;
  free?: string;
  cod?: string;
  sale?: string;
  flash?: string;
  hot?: string;
  newx?: string;
  feat?: string;
  dmin?: number;
};

const PRICE_MAX = 1000;
const PAGE_SIZE = 60;

const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : undefined);
const num = (v: unknown) => (v != null && v !== "" ? Number(v) : undefined);

export const Route = createFileRoute("/search")({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    q: str(s.q),
    cat: str(s.cat),
    sub: str(s.sub),
    brand: str(s.brand),
    sort: str(s.sort),
    min: num(s.min),
    max: num(s.max),
    stock: str(s.stock),
    rating: num(s.rating),
    free: str(s.free),
    cod: str(s.cod),
    // Back-compat: legacy `disc=1` deep links map to the new `sale` flag.
    sale: str(s.sale) ?? str(s.disc),
    flash: str(s.flash),
    hot: str(s.hot),
    newx: str(s.newx),
    feat: str(s.feat),
    dmin: num(s.dmin),
  }),
  head: () => ({
    meta: [
      { title: "Search the Marketplace — FoundOurMarket™" },
      { name: "description", content: "Search thousands of curated electronics, home, and fitness products on FoundOurMarket. Filter by category, price, and availability." },
      { property: "og:title", content: "Search the Marketplace — FoundOurMarket™" },
      { property: "og:description", content: "Search and filter thousands of curated products on FoundOurMarket." },
      { property: "og:url", content: "https://foundourmarket.com/search" },
    ],
    links: [{ rel: "canonical", href: "https://foundourmarket.com/search" }],
  }),
  component: SearchPage,
});

const SORTS: { value: string; label: string; desc: string; icon: LucideIcon }[] = [
  { value: "relevance", label: "Relevance", desc: "Best match for your search", icon: Sparkles },
  { value: "trending", label: "Trending", desc: "Rising in views & sales", icon: TrendingUp },
  { value: "best_selling", label: "Best Selling", desc: "Most orders overall", icon: Flame },
  { value: "rating", label: "Highest Rated", desc: "Top review scores first", icon: Star },
  { value: "newest", label: "Newest", desc: "Latest arrivals", icon: Clock },
  { value: "price_asc", label: "Price: Low → High", desc: "Cheapest first", icon: ArrowDownWideNarrow },
  { value: "price_desc", label: "Price: High → Low", desc: "Premium first", icon: ArrowUpWideNarrow },
  { value: "discount", label: "Biggest Discount", desc: "Best deals first", icon: Tag },
];

// Rotation reshuffle cadence for the default browse feed (every 2 hours).
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
export function rotationSeed(): number {
  return Math.floor(Date.now() / TWO_HOURS_MS);
}

// Deterministic seeded shuffle (mulberry32). Same seed + same items => same
// order, so pagination/re-renders stay consistent within a rotation window.
function seededShuffle<T>(items: T[], seed: number): T[] {
  const arr = [...items];
  let s = seed >>> 0;
  const rand = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function applyClientSort(
  rows: Product[],
  sort: string | undefined,
  discountOf: (p: Product) => number,
  priceOf: (p: Product) => number,
): Product[] {
  switch (sort) {
    case "best_selling":
      return [...rows].sort((a, b) => b.soldCount - a.soldCount);
    case "best_selling_reviews":
      return [...rows].sort((a, b) => b.reviews - a.reviews);
    case "rating":
      return [...rows].sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
    case "newest":
      return [...rows].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    case "discount":
      return [...rows].sort((a, b) => discountOf(b) - discountOf(a));
    case "price_asc":
      return [...rows].sort((a, b) => priceOf(a) - priceOf(b));
    case "price_desc":
      return [...rows].sort((a, b) => priceOf(b) - priceOf(a));
    default:
      return rows;
  }
}

const RATINGS = [4, 3, 2];

type Filters = ClientFilters;


function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">
      {children}
    </h3>
  );
}

/** Premium dual-handle price slider: gradient track, live value bubbles above
 *  each handle, and snapping to fixed price bands. */
function PriceRangeSlider({
  max,
  value,
  onValueChange,
  fmt,
  snapPoints,
}: {
  max: number;
  value: [number, number];
  onValueChange: (v: number[]) => void;
  fmt: (usd: number) => string;
  /** Sorted list of USD values the handles snap to (band edges). */
  snapPoints: number[];
}) {
  const snap = (n: number) =>
    snapPoints.reduce((best, p) => (Math.abs(p - n) < Math.abs(best - n) ? p : best), snapPoints[0]);
  const handleChange = (v: number[]) => {
    let lo = snap(v[0]);
    let hi = snap(v[1]);
    if (lo > hi) [lo, hi] = [hi, lo];
    onValueChange([lo, hi]);
  };
  return (
    <div className="pt-9 pb-1 px-1">
      <SliderPrimitive.Root
        min={0}
        max={max}
        step={10}
        value={value}
        onValueChange={handleChange}
        className="relative flex w-full touch-none select-none items-center"
      >
        <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-white/10">
          <SliderPrimitive.Range className="absolute h-full rounded-full bg-gradient-to-r from-[#FFA52E] to-[#FF7A18]" />
        </SliderPrimitive.Track>
        {[0, 1].map((i) => (
          <SliderPrimitive.Thumb
            key={i}
            className="relative block size-5 rounded-full border-2 border-accent bg-background shadow-[0_2px_12px_-2px_var(--accent)] transition-transform active:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-accent px-2 py-1 text-[10px] font-bold tabular-nums text-accent-foreground shadow-lg">
              {fmt(value[i])}{i === 1 && value[1] >= max ? "+" : ""}
            </span>
          </SliderPrimitive.Thumb>
        ))}
      </SliderPrimitive.Root>
      {/* Band tick labels under the track */}
      <div className="mt-3 flex justify-between text-[10px] font-medium tabular-nums text-muted-foreground">
        {snapPoints.map((p, i) => (
          <span key={p}>{fmt(p)}{i === snapPoints.length - 1 ? "+" : ""}</span>
        ))}
      </div>
    </div>
  );
}

function FilterPanel({
  value,
  onChange,
  sort,
  onSortChange,
}: {
  value: Filters;
  onChange: (next: Filters) => void;
  /** When provided, an inline Sort section is rendered (mobile drawer). */
  sort?: string;
  onSortChange?: (sort: string) => void;
}) {
  const { categories } = useCategories();
  const { market, symbol } = useRegion();
  // The price filter operates on the base (USD) price column server-side; for
  // Indian shoppers we only translate the *displayed* numbers into ₹ so the UI
  // never leaks USD, while the slider value sent to the backend stays unchanged.
  const rate = market === "india" ? 83 : 1;
  const fmt = (usd: number) =>
    market === "india"
      ? `${symbol}${Math.round(usd * rate).toLocaleString("en-IN")}`
      : `${symbol}${usd}`;
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });
  const priceRange: [number, number] = [value.min ?? 0, value.max ?? PRICE_MAX];

  // Price band edges the slider handles snap to (in base USD). At the India
  // rate (~83) these map to ₹0 · ₹4k · ₹16k · ₹41k · ₹41k+.
  const PRICE_SNAP = [0, 50, 200, 500, PRICE_MAX];

  const toggles: { key: "free" | "sale"; on: string; label: string; desc: string }[] = [
    { key: "free", on: "1", label: "Free shipping", desc: "No delivery charges" },
    { key: "sale", on: "1", label: "On sale", desc: "Discounted products only" },
  ];

  return (
    <div className="space-y-8">
      {/* Category chips */}
      <div>
        <SectionLabel>Category</SectionLabel>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => set({ cat: undefined })}
            className={`rounded-full px-4 py-2 text-xs font-medium transition-all active:scale-95 ${!value.cat ? "bg-accent text-accent-foreground ring-1 ring-accent shadow-[0_4px_16px_-6px_var(--accent)]" : "bg-white/[0.05] text-muted-foreground ring-1 ring-white/10 hover:text-foreground hover:bg-white/[0.08]"}`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.slug}
              onClick={() => set({ cat: value.cat === c.slug ? undefined : c.slug })}
              className={`rounded-full px-4 py-2 text-xs font-medium transition-all active:scale-95 ${value.cat === c.slug ? "bg-accent text-accent-foreground ring-1 ring-accent shadow-[0_4px_16px_-6px_var(--accent)]" : "bg-white/[0.05] text-muted-foreground ring-1 ring-white/10 hover:text-foreground hover:bg-white/[0.08]"}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Price range slider */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>Price</SectionLabel>
          <span className="text-xs font-semibold tabular-nums text-accent">
            {fmt(priceRange[0])} – {fmt(priceRange[1])}{priceRange[1] >= PRICE_MAX ? "+" : ""}
          </span>
        </div>
        <PriceRangeSlider
          max={PRICE_MAX}
          value={priceRange}
          snapPoints={PRICE_SNAP}
          onValueChange={(v) => set({ min: v[0] > 0 ? v[0] : undefined, max: v[1] < PRICE_MAX ? v[1] : undefined })}
          fmt={fmt}
        />
      </div>

      {/* Rating filter — segmented cards */}
      <div>
        <SectionLabel>Rating</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          {RATINGS.map((r) => (
            <button
              key={r}
              onClick={() => set({ rating: value.rating === r ? undefined : r })}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl py-3 text-xs font-semibold transition-all active:scale-95 ${value.rating === r ? "bg-accent/15 text-accent ring-1 ring-accent/40" : "bg-white/[0.04] text-muted-foreground ring-1 ring-white/10 hover:text-foreground hover:bg-white/[0.07]"}`}
            >
              <span className="inline-flex items-center gap-0.5">
                <Star className="size-3.5 fill-current" /> {r}
              </span>
              <span className="text-[10px] font-medium opacity-80">& up</span>
            </button>
          ))}
        </div>
      </div>

      {/* Availability & offers — iOS toggles */}
      <div>
        <SectionLabel>Availability & Offers</SectionLabel>
        <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/10 divide-y divide-white/5">
          {toggles.map((t) => (
            <label key={t.key} className="flex items-center justify-between gap-3 px-4 py-3.5 cursor-pointer">
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{t.label}</span>
                <span className="block text-[11px] text-muted-foreground">{t.desc}</span>
              </span>
              <Switch
                checked={value[t.key] === t.on}
                onCheckedChange={(c) => set({ [t.key]: c ? t.on : undefined } as Partial<Filters>)}
              />
            </label>
          ))}
        </div>
      </div>

      {/* Optional inline Sort (mobile drawer) */}
      {sort != null && onSortChange && (
        <div>
          <SectionLabel>Sort by</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {SORTS.map((s) => {
              const active = sort === s.value;
              return (
                <button
                  key={s.value}
                  onClick={() => onSortChange(s.value)}
                  className={`flex items-center justify-between gap-1.5 rounded-xl px-3 py-2.5 text-xs font-medium text-left transition-all active:scale-95 ${active ? "bg-accent/15 text-accent ring-1 ring-accent/40" : "bg-white/[0.04] text-muted-foreground ring-1 ring-white/10 hover:text-foreground hover:bg-white/[0.07]"}`}
                >
                  <span className="truncate">{s.label}</span>
                  {active && <Check className="size-3.5 shrink-0" strokeWidth={2.5} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchPage() {
  const search = Route.useSearch();
  const nav = useNavigate({ from: "/search" });
  const { categories } = useCategories();
  const { categories: allCategories } = useAllCategories();
  const { priceOf, shippingFeeOf, compareOf, market, symbol } = useRegion();

  const rate = market === "india" ? 83 : 1;
  const fmt = useCallback(
    (usd: number) =>
      market === "india"
        ? `${symbol}${Math.round(usd * rate).toLocaleString("en-IN")}`
        : `${symbol}${usd}`,
    [market, symbol, rate],
  );

  const [query, setQuery] = useState(search.q ?? "");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [rawRows, setRawRows] = useState<Product[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // Rotation bucket drives the every-2-hours reshuffle of the browse order.
  const [rotBucket, setRotBucket] = useState<number>(() => rotationSeed());
  useEffect(() => {
    const id = setInterval(() => {
      const b = rotationSeed();
      setRotBucket((prev) => (prev === b ? prev : b));
    }, 60 * 1000);
    return () => clearInterval(id);
  }, []);
  const [loading, setLoading] = useState(true);
  const [scrolled, setScrolled] = useState(false);

  // Hide the mobile bottom nav while a drawer sheet is open.
  useEffect(() => {
    const open = drawerOpen || sortOpen;
    document.body.classList.toggle("hide-bottom-nav", open);
    return () => document.body.classList.remove("hide-bottom-nav");
  }, [drawerOpen, sortOpen]);

  // Reveal a compact sticky search bar once the user scrolls past the hero.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 280);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const currentFilters: Filters = useMemo(
    () => ({
      cat: search.cat,
      sub: search.sub,
      brand: search.brand,
      min: search.min,
      max: search.max,
      rating: search.rating,
      stock: search.stock,
      free: search.free,
      cod: search.cod,
      sale: search.sale,
      flash: search.flash,
      hot: search.hot,
      newx: search.newx,
      feat: search.feat,
      dmin: search.dmin,
    }),
    [search.cat, search.sub, search.brand, search.min, search.max, search.rating, search.stock, search.free, search.cod, search.sale, search.flash, search.hot, search.newx, search.feat, search.dmin],
  );

  // Local draft for the mobile drawer (applied on "Show N Products").
  const [draft, setDraft] = useState<Filters>(currentFilters);
  const [draftSort, setDraftSort] = useState<string>(search.sort ?? "relevance");
  useEffect(() => {
    if (drawerOpen) {
      setDraft(currentFilters);
      setDraftSort(search.sort ?? "relevance");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerOpen]);

  useEffect(() => {
    const q = (search.q ?? "").trim();
    if (q) {
      try {
        const raw = localStorage.getItem("fom_search_history");
        const arr: { q: string; ts: number }[] = raw ? JSON.parse(raw) : [];
        const next = [{ q, ts: Date.now() }, ...arr.filter((x) => x.q !== q)].slice(0, 20);
        localStorage.setItem("fom_search_history", JSON.stringify(next));
      } catch { /* ignore */ }
    }
  }, [search.q]);

  const sort = search.sort ?? "relevance";
  const isTrending = sort === "trending";

  // Fetch the full matching set for the current text query + parent category.
  // All remaining filters (brand, price, rating, availability, offers,
  // discount) and every sort are applied client-side so the live product
  // count updates instantly with zero network round-trips.
  const priceCtx = useMemo(
    () => ({ priceOf, compareOf, shippingFeeOf }),
    [priceOf, compareOf, shippingFeeOf],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRawRows([]);

    if (isTrending) {
      (supabase as any)
        .from("products_public")
        .select(SELECT_COLS)
        .eq("trending", true)
        .then(({ data }: { data: any[] | null }) => {
          if (cancelled) return;
          const rows = (data ?? []).map((r: any) => rowToProduct(r));
          const seen = new Set<string>();
          const deduped = rows.filter((p: Product) => (seen.has(p.slug) ? false : (seen.add(p.slug), true)));
          setRawRows(deduped);
          setLoading(false);
        });
      return () => { cancelled = true; };
    }

    (supabase.rpc as any)("search_products", {
      q: search.q ?? null,
      category_filter: search.cat ?? null,
      min_price: null,
      max_price: null,
      min_rating: null,
      sort_by: "relevance",
      page_limit: 1000,
      page_offset: 0,
    }).then(({ data }: { data: any[] | null }) => {
      if (cancelled) return;
      const rows = (data ?? []).map((r: any) => rowToProduct(r));
      const seen = new Set<string>();
      const deduped = rows.filter((p: Product) => (seen.has(p.slug) ? false : (seen.add(p.slug), true)));
      setRawRows(deduped);
      setLoading(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.q, search.cat]);

  // "Did you mean…?" — fetch the closest matching term when a query returns
  // no (or very few) results, so shoppers can recover from typos quickly.
  const [suggestion, setSuggestion] = useState<string | null>(null);
  useEffect(() => {
    const q = (search.q ?? "").trim();
    if (!q || loading || rawRows.length > 2) { setSuggestion(null); return; }
    let cancelled = false;
    (supabase.rpc as any)("suggest_search_term", { q }).then(({ data }: { data: string | null }) => {
      if (cancelled) return;
      setSuggestion(data && data.toLowerCase() !== q.toLowerCase() ? data : null);
    });
    return () => { cancelled = true; };
  }, [search.q, loading, rawRows.length]);

  // Full client-side filtered + sorted result set (drives the live count).
  const results = useMemo(() => {
    if (isTrending) return rawRows;
    const filtered = applyClientFilters(rawRows, currentFilters, priceCtx);
    const sorted = applyClientSort(
      filtered,
      sort,
      (p) => discountPercent(priceOf(p), compareOf(p)) ?? p.discount ?? 0,
      priceOf,
    );
    const noActive = countActive(currentFilters) === 0;
    const isDefaultBrowse = (sort === "relevance" || !sort) && !(search.q ?? "").trim() && noActive;
    return isDefaultBrowse ? seededShuffle(sorted, rotBucket) : sorted;
  }, [rawRows, isTrending, currentFilters, priceCtx, sort, search.q, rotBucket, priceOf, compareOf]);

  // Client-side pagination — reset the visible window when the result set changes.
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [results]);
  const visibleResults = useMemo(() => results.slice(0, visibleCount), [results, visibleCount]);
  const hasMore = visibleCount < results.length;
  function loadMore() { setVisibleCount((c) => c + PAGE_SIZE); }

  // Brand facets + live draft count for the mobile drawer.
  const brands = useMemo(
    () => brandFacets(rawRows, currentFilters, priceCtx),
    [rawRows, currentFilters, priceCtx],
  );
  const draftBrands = useMemo(
    () => brandFacets(rawRows, draft, priceCtx),
    [rawRows, draft, priceCtx],
  );
  const draftCount = useMemo(
    () => applyClientFilters(rawRows, draft, priceCtx).length,
    [rawRows, draft, priceCtx],
  );

  function update(patch: Partial<SearchParams>) {
    nav({ search: (prev: SearchParams) => ({ ...prev, ...patch }), replace: true });
  }
  function applyFilters(f: Filters) {
    nav({ search: (prev: SearchParams) => ({ ...prev, ...f }), replace: true });
  }
  function clearAll() {
    nav({ search: { q: search.q, sort: search.sort }, replace: true });
  }
  function applyDraft() {
    nav({ search: (prev: SearchParams) => ({ ...prev, ...draft, sort: draftSort }), replace: true });
    setDrawerOpen(false);
  }
  function resetDraft() {
    setDraft({});
    setDraftSort("relevance");
  }

  const activeFilterCount = countActive(currentFilters);

  const getProductKey = useCallback((p: Product) => p.id ?? p.slug, []);
  const renderProduct = useCallback(
    (p: Product, i: number) => <ProductCard product={p} priority={i < 4} highlight={search.q} />,
    [search.q],
  );


  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-2 sm:py-12 sm:pb-16">
      {/* Sticky mini search — appears on scroll for quick searching without scrolling back up */}
      <div
        data-search-sticky
        className={`fixed inset-x-0 top-0 z-40 border-b border-border bg-background/90 backdrop-blur-xl transition-all duration-300 ${
          scrolled ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none"
        }`}
      >
        <form
          onSubmit={(e) => { e.preventDefault(); update({ q: query }); }}
          className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center gap-2"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products…"
              className="w-full bg-card border border-border rounded-full pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-all"
            />
          </div>
          <button type="submit" className="shrink-0 bg-accent text-accent-foreground font-bold px-4 py-2.5 rounded-full text-[10px] uppercase tracking-widest hover:brightness-110 transition-all">
            Search
          </button>
        </form>
      </div>

      <div className="mb-7 sm:mb-9">
        <h1 className="text-fluid-2xl font-display font-semibold tracking-tight mb-1.5">Search the marketplace</h1>
        <p className="text-sm text-muted-foreground font-light mb-5">Find products, brands and categories from around the world.</p>

        <form onSubmit={(e) => { e.preventDefault(); update({ q: query }); }} className="relative w-full max-w-2xl">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 size-[18px] text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products, categories…"
            className="w-full bg-white/[0.04] border border-white/10 rounded-2xl pl-12 pr-[6.5rem] py-4 text-sm sm:text-base backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50 transition-all placeholder:text-muted-foreground/70"
          />
          <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 bg-accent text-accent-foreground font-semibold px-5 py-2.5 rounded-xl text-xs tracking-wide hover:brightness-110 active:scale-95 transition-all">
            Search
          </button>
        </form>
      </div>

      {/* Controls — categories then a single clean control row */}
      <div className="mb-7 space-y-4">
        {/* Category chips — hidden in Trending mode (dedicated dataset) */}
        {!isTrending && categories.length > 0 && (
          <div className="-mx-4 px-4 sm:mx-0 sm:px-0">
            <div className="flex gap-2 overflow-x-auto py-1.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <button
                onClick={() => update({ cat: undefined })}
                className={`shrink-0 rounded-full px-4 py-2 text-xs font-medium whitespace-nowrap transition-all ${!search.cat ? "bg-gradient-to-b from-accent/25 to-accent/10 text-accent ring-1 ring-accent/40" : "bg-white/[0.04] text-muted-foreground ring-1 ring-white/5 hover:text-foreground hover:bg-white/[0.07]"}`}
              >
                All
              </button>
              {categories.map((c) => (
                <button
                  key={c.slug}
                  onClick={() => update({ cat: search.cat === c.slug ? undefined : c.slug })}
                  className={`shrink-0 rounded-full px-4 py-2 text-xs font-medium whitespace-nowrap transition-all ${search.cat === c.slug ? "bg-gradient-to-b from-accent/25 to-accent/10 text-accent ring-1 ring-accent/40" : "bg-white/[0.04] text-muted-foreground ring-1 ring-white/5 hover:text-foreground hover:bg-white/[0.07]"}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Single control row — Filters (icon button) + Sort (dropdown pill) */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setDrawerOpen(true)}
              className="lg:hidden shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/[0.05] ring-1 ring-white/10 text-xs font-medium hover:bg-white/[0.08] transition-all"
            >
              <SlidersHorizontal className="size-4" /> Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>

            {/* Premium full-screen filter drawer (mobile) */}
            <MobileFilterDrawer
              open={drawerOpen}
              onClose={() => setDrawerOpen(false)}
              draft={draft}
              setDraft={setDraft}
              sort={draftSort}
              setSort={setDraftSort}
              allCategories={allCategories}
              brands={draftBrands}
              priceMax={PRICE_MAX}
              snapPoints={[0, 50, 200, 500, PRICE_MAX]}
              fmt={fmt}
              rate={rate}
              symbol={symbol}
              resultCount={draftCount}
              onReset={resetDraft}
              onApply={applyDraft}
            />

            {activeFilterCount > 0 && (
              <button onClick={clearAll} className="shrink-0 text-xs font-medium text-muted-foreground hover:text-accent">Clear all</button>
            )}

          </div>
          <Drawer open={sortOpen} onOpenChange={setSortOpen}>
            <DrawerTrigger asChild>
              <button className="shrink-0 inline-flex items-center gap-2 rounded-full bg-white/[0.05] ring-1 ring-white/10 pl-4 pr-4 py-2.5 text-xs font-medium hover:bg-white/[0.08] active:scale-95 transition-all">
                <ArrowUpDown className="size-3.5" />
                Sort: {(SORTS.find((s) => s.value === (search.sort ?? "relevance")) ?? SORTS[0]).label}
              </button>
            </DrawerTrigger>
            <DrawerContent className="border-white/10 bg-background/80 backdrop-blur-2xl">
              <div className="mx-auto w-full max-w-md px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                <div className="flex items-center gap-2 px-2 pt-1 pb-4">
                  <ArrowUpDown className="size-4 text-accent" />
                  <h2 className="text-base font-semibold text-foreground">Sort by</h2>
                </div>
                <div className="space-y-2">
                  {SORTS.map((s) => {
                    const active = (search.sort ?? "relevance") === s.value;
                    const Icon = s.icon;
                    return (
                      <button
                        key={s.value}
                        onClick={() => { update({ sort: s.value }); setSortOpen(false); }}
                        className={`group flex w-full items-center gap-3.5 rounded-2xl px-3.5 py-3 text-left transition-all duration-200 active:scale-[0.98] ${active ? "bg-accent/[0.12] ring-1 ring-accent/40 shadow-[0_8px_28px_-12px_var(--accent)]" : "ring-1 ring-white/[0.06] hover:bg-white/[0.05]"}`}
                      >
                        <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors ${active ? "bg-accent/20 text-accent" : "bg-white/[0.05] text-muted-foreground group-hover:text-foreground"}`}>
                          <Icon className="size-[18px]" strokeWidth={2} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm font-semibold ${active ? "text-accent" : "text-foreground"}`}>{s.label}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">{s.desc}</span>
                        </span>
                        {active && (
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground animate-scale-in">
                            <Check className="size-3.5" strokeWidth={3} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </DrawerContent>
          </Drawer>

        </div>
      </div>



      {/* Applied filter chips intentionally removed — active filters live only
          inside the filter panel and the "Filters (N)" indicator. */}


      {/* "Did you mean…?" — recover from typos with one tap */}
      {suggestion && search.q && (
        <div className="mb-6 sm:mb-8 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Did you mean</span>
          <button
            onClick={() => { setQuery(suggestion); update({ q: suggestion }); }}
            className="font-semibold text-accent underline underline-offset-4 hover:brightness-110"
          >
            {suggestion}
          </button>
          <span className="text-muted-foreground">?</span>
        </div>
      )}



      {/* Trending mode banner — "Top Trending Now" */}
      {isTrending && (
        <div className="mb-6 sm:mb-8 flex items-center gap-3 rounded-2xl border border-accent/25 bg-gradient-to-r from-accent/[0.12] to-transparent px-4 py-3.5 animate-fade-up">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/20 text-accent">
            <TrendingUp className="size-5" strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              Top Trending Now
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-accent">
                <span className="size-1.5 rounded-full bg-accent animate-pulse" /> Live
              </span>
            </p>
            
          </div>
        </div>
      )}

      <div className={isTrending ? "" : "grid grid-cols-1 lg:grid-cols-[240px,1fr] gap-6 lg:gap-8"}>
        {/* Desktop sidebar — hidden in Trending mode */}
        {!isTrending && (
          <aside className="hidden lg:block">
            <FilterPanel value={currentFilters} onChange={applyFilters} />
          </aside>
        )}

        <div key={isTrending ? "trending" : "feed"} className="animate-fade-up">

          {loading ? (
            <ProductSkeletonGrid count={9} className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5 lg:gap-6" />
          ) : results.length === 0 ? (
            <div className="py-16 sm:py-24 px-6 text-center border border-dashed border-border rounded-2xl">
              <div className="size-16 mx-auto mb-5 grid place-items-center rounded-full border border-border bg-card/40">
                <Search className="size-6 text-muted-foreground" />
              </div>
              <p className="text-base font-medium">{isTrending ? "No trending products right now" : "No products match your filters"}</p>
              <p className="text-sm text-muted-foreground mt-1.5">{isTrending ? "Check back soon — trending updates in real time as shoppers browse and buy." : "Try adjusting or clearing your filters to see more results."}</p>
              <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
                {activeFilterCount > 0 && (
                  <button onClick={clearAll}
                    className="inline-flex items-center gap-1.5 rounded-full bg-accent text-accent-foreground font-mono uppercase tracking-widest text-[11px] px-4 py-2 hover:brightness-110 transition-all">
                    Clear Filters
                  </button>
                )}
                <Link to="/" className="text-xs font-mono uppercase tracking-widest text-accent border-b border-accent pb-1">Browse all</Link>
              </div>
            </div>
          ) : (
            <>
              <VirtualizedProductGrid
                items={visibleResults}
                cols={{ base: 2, md: 3, xl: 4 }}
                className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5 lg:gap-6"
                getKey={getProductKey}
                getImageSrc={(p) => p.image}
                renderItem={renderProduct}
              />

              {hasMore && (
                <div className="mt-8 sm:mt-10 flex justify-center">
                  <button
                    onClick={loadMore}
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-6 py-3 text-[11px] font-mono uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-colors"
                  >
                    Load More
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Trust bar — compact premium chips in a single scrollable row */}
      <div className="mt-10 -mx-4 sm:mx-0 px-4 sm:px-0">
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {[
            { icon: ShieldCheck, label: "Secure Payments" },
            { icon: RefreshCw, label: "Easy Returns" },
            { icon: BadgeCheck, label: "Verified Products" },
            { icon: Globe, label: "Worldwide Shipping" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-border bg-card/40 px-3 py-1.5">
              <Icon className="size-3.5 text-accent shrink-0" />
              <span className="text-[10px] sm:text-[11px] font-mono tracking-wide text-muted-foreground whitespace-nowrap">{label}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
