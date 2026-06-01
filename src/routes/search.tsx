import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal, X, Star, ShieldCheck, RefreshCw, BadgeCheck, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { rowToProduct, discountPercent, type Product } from "@/lib/products";
import { useCategories } from "@/lib/use-categories";
import { useRegion } from "@/lib/region";
import { ProductCard } from "@/components/site/ProductCard";
import { ProductSkeletonGrid } from "@/components/site/ProductSkeleton";
import { RecentlyViewed } from "@/components/site/RecentlyViewed";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { Slider } from "@/components/ui/slider";

type SearchParams = {
  q?: string;
  cat?: string;
  sort?: string;
  min?: number;
  max?: number;
  stock?: string;
  rating?: number;
  free?: string;
  disc?: string;
};

const PRICE_MAX = 1000;

export const Route = createFileRoute("/search")({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    q: typeof s.q === "string" ? s.q : undefined,
    cat: typeof s.cat === "string" ? s.cat : undefined,
    sort: typeof s.sort === "string" ? s.sort : undefined,
    min: s.min != null && s.min !== "" ? Number(s.min) : undefined,
    max: s.max != null && s.max !== "" ? Number(s.max) : undefined,
    stock: typeof s.stock === "string" ? s.stock : undefined,
    rating: s.rating != null && s.rating !== "" ? Number(s.rating) : undefined,
    free: typeof s.free === "string" ? s.free : undefined,
    disc: typeof s.disc === "string" ? s.disc : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Search the Marketplace — FoundOurMarket™" },
      { name: "description", content: "Search thousands of curated electronics, fashion, home, and fitness products on FoundOurMarket. Filter by category, price, and availability." },
      { property: "og:title", content: "Search the Marketplace — FoundOurMarket™" },
      { property: "og:description", content: "Search and filter thousands of curated products on FoundOurMarket." },
      { property: "og:url", content: "https://foundourmarket.com/search" },
    ],
    links: [{ rel: "canonical", href: "https://foundourmarket.com/search" }],
  }),
  component: SearchPage,
});

const SORTS = [
  { value: "relevance", label: "Relevance" },
  { value: "trending", label: "Trending" },
  { value: "best_selling", label: "Best Selling" },
  { value: "rating", label: "Highest Rated" },
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low → High" },
  { value: "price_desc", label: "Price: High → Low" },
  { value: "discount", label: "Biggest Discount" },
];

// Sorts handled natively by the search_products RPC. Others are applied
// client-side after fetching with a "relevance" base ordering.
const RPC_SORTS = new Set(["relevance", "price_asc", "price_desc", "rating", "newest"]);

function applyClientSort(rows: Product[], sort: string | undefined, discountOf: (p: Product) => number): Product[] {
  switch (sort) {
    case "trending":
      return [...rows].sort((a, b) => b.viewsCount - a.viewsCount);
    case "best_selling":
      return [...rows].sort((a, b) => b.soldCount - a.soldCount);
    case "discount":
      return [...rows].sort((a, b) => discountOf(b) - discountOf(a));
    default:
      return rows;
  }
}

const RATINGS = [4, 3, 2];

type Filters = Pick<SearchParams, "cat" | "min" | "max" | "stock" | "rating" | "free" | "disc">;

function FilterPanel({
  value,
  onChange,
}: {
  value: Filters;
  onChange: (next: Filters) => void;
}) {
  const { categories } = useCategories();
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });
  const priceRange: [number, number] = [value.min ?? 0, value.max ?? PRICE_MAX];

  return (
    <div className="space-y-6">
      {/* Category chips */}
      <div>
        <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">Category</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => set({ cat: undefined })}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${!value.cat ? "border-accent bg-accent/15 text-accent" : "border-border text-foreground hover:border-accent/60"}`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.slug}
              onClick={() => set({ cat: c.slug })}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${value.cat === c.slug ? "border-accent bg-accent/15 text-accent" : "border-border text-foreground hover:border-accent/60"}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Price range slider */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Price (USD)</h3>
          <span className="text-[11px] font-mono tabular-nums text-foreground">
            ${priceRange[0]} – ${priceRange[1]}{priceRange[1] >= PRICE_MAX ? "+" : ""}
          </span>
        </div>
        <Slider
          min={0}
          max={PRICE_MAX}
          step={10}
          value={priceRange}
          onValueChange={(v) => set({ min: v[0] > 0 ? v[0] : undefined, max: v[1] < PRICE_MAX ? v[1] : undefined })}
        />
      </div>

      {/* Rating filter */}
      <div>
        <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">Rating</h3>
        <div className="flex flex-wrap gap-2">
          {RATINGS.map((r) => (
            <button
              key={r}
              onClick={() => set({ rating: value.rating === r ? undefined : r })}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition-colors ${value.rating === r ? "border-accent bg-accent/15 text-accent" : "border-border text-foreground hover:border-accent/60"}`}
            >
              <Star className="size-3 fill-current" /> {r}★ & up
            </button>
          ))}
        </div>
      </div>

      {/* Toggles */}
      <div className="space-y-3">
        <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Options</h3>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={value.stock === "in"} onChange={(e) => set({ stock: e.target.checked ? "in" : undefined })} className="accent-[var(--accent)]" />
          In stock only
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={value.free === "1"} onChange={(e) => set({ free: e.target.checked ? "1" : undefined })} className="accent-[var(--accent)]" />
          Free shipping
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={value.disc === "1"} onChange={(e) => set({ disc: e.target.checked ? "1" : undefined })} className="accent-[var(--accent)]" />
          On sale / discounted
        </label>
      </div>
    </div>
  );
}

function SearchPage() {
  const search = Route.useSearch();
  const nav = useNavigate({ from: "/search" });
  const { categories } = useCategories();
  const { shippingFeeOf, compareOf } = useRegion();

  const [query, setQuery] = useState(search.q ?? "");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [scrolled, setScrolled] = useState(false);

  // Reveal a compact sticky search bar once the user scrolls past the hero.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 280);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);


  const currentFilters: Filters = {
    cat: search.cat,
    min: search.min,
    max: search.max,
    stock: search.stock,
    rating: search.rating,
    free: search.free,
    disc: search.disc,
  };
  // Local draft for the mobile drawer (applied on "Apply Filters").
  const [draft, setDraft] = useState<Filters>(currentFilters);
  useEffect(() => { if (drawerOpen) setDraft(currentFilters); /* eslint-disable-next-line */ }, [drawerOpen]);

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const sort = search.sort ?? "relevance";
    (supabase.rpc as any)("search_products", {
      q: search.q ?? null,
      category_filter: search.cat ?? null,
      min_price: search.min ?? null,
      max_price: search.max ?? null,
      min_rating: search.rating ?? null,
      sort_by: RPC_SORTS.has(sort) ? sort : "relevance",
      page_limit: 60,
      page_offset: 0,
    }).then(({ data }: { data: any[] | null }) => {
      if (cancelled) return;
      let rows = (data ?? []).map((r: any) => rowToProduct(r));
      if (search.stock === "in") rows = rows.filter((p) => p.inStock);
      if (search.free === "1") rows = rows.filter((p) => shippingFeeOf(p) <= 0);
      if (search.disc === "1") rows = rows.filter((p) => discountPercent(p.price, compareOf(p)) != null);
      rows = applyClientSort(rows, sort, (p) => discountPercent(p.price, compareOf(p)) ?? 0);
      setResults(rows);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [search.q, search.cat, search.min, search.max, search.sort, search.stock, search.rating, search.free, search.disc]);


  function update(patch: Partial<SearchParams>) {
    nav({ search: (prev: SearchParams) => ({ ...prev, ...patch }), replace: true });
  }
  function applyFilters(f: Filters) {
    nav({ search: (prev: SearchParams) => ({ ...prev, ...f }), replace: true });
  }
  function clearAll() {
    nav({ search: { q: search.q, sort: search.sort }, replace: true });
  }

  const activeFilterCount = [search.cat, search.stock, search.min, search.max, search.rating, search.free, search.disc].filter(Boolean).length;

  const activeChips: { label: string; clear: () => void }[] = [];
  if (search.cat) {
    const name = categories.find((c) => c.slug === search.cat)?.name ?? search.cat;
    activeChips.push({ label: name, clear: () => update({ cat: undefined }) });
  }
  if (search.stock === "in") activeChips.push({ label: "In stock", clear: () => update({ stock: undefined }) });
  if (search.free === "1") activeChips.push({ label: "Free shipping", clear: () => update({ free: undefined }) });
  if (search.disc === "1") activeChips.push({ label: "On sale", clear: () => update({ disc: undefined }) });
  if (search.rating) activeChips.push({ label: `${search.rating}★ & up`, clear: () => update({ rating: undefined }) });
  if (search.min) activeChips.push({ label: `Min $${search.min}`, clear: () => update({ min: undefined }) });
  if (search.max) activeChips.push({ label: `Max $${search.max}`, clear: () => update({ max: undefined }) });

  const resultCount = useMemo(() => results.length, [results]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 mobile-page-clearance sm:pb-16">
      {/* Sticky mini search — appears on scroll for quick searching without scrolling back up */}
      <div
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

      <div className="mb-6 sm:mb-8">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Discover</p>
        <h1 className="text-fluid-2xl font-display font-semibold mb-5 sm:mb-6">Search the marketplace</h1>

        <form onSubmit={(e) => { e.preventDefault(); update({ q: query }); }} className="relative max-w-2xl">
          <Search className="absolute left-4 sm:left-5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products, categories…"
            className="w-full bg-card border border-border rounded-full pl-11 sm:pl-12 pr-24 sm:pr-28 py-3.5 sm:py-4 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-all"
          />
          <button type="submit" className="absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 bg-accent text-accent-foreground font-bold px-4 sm:px-5 py-2.5 rounded-full text-[10px] sm:text-[11px] uppercase tracking-widest hover:brightness-110 transition-all">
            Search
          </button>
        </form>

        {/* Category chips — horizontal scroll, premium pill design */}
        {categories.length > 0 && (
          <div className="-mx-4 px-4 sm:mx-0 sm:px-0 mt-5">
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <button
                onClick={() => update({ cat: undefined })}
                className={`shrink-0 rounded-full border px-4 py-2 text-[11px] font-mono uppercase tracking-widest transition-all ${!search.cat ? "border-accent bg-accent/15 text-accent shadow-[0_0_18px_-4px_var(--accent)]" : "border-border text-foreground hover:border-accent/60"}`}
              >
                All
              </button>
              {categories.map((c) => (
                <button
                  key={c.slug}
                  onClick={() => update({ cat: search.cat === c.slug ? undefined : c.slug })}
                  className={`shrink-0 rounded-full border px-4 py-2 text-[11px] font-mono uppercase tracking-widest transition-all ${search.cat === c.slug ? "border-accent bg-accent/15 text-accent shadow-[0_0_18px_-4px_var(--accent)]" : "border-border text-foreground hover:border-accent/60"}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

      </div>


      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          {/* Mobile filter drawer trigger */}
          <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
            <DrawerTrigger asChild>
              <button className="lg:hidden inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border text-[11px] font-mono uppercase tracking-widest hover:bg-white/5">
                <SlidersHorizontal className="size-3.5" /> Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              </button>
            </DrawerTrigger>
            <DrawerContent className="max-h-[85vh]">
              <div className="flex items-center justify-between px-4 pb-3 pt-1">
                <h2 className="text-sm font-semibold">Filters</h2>
                <button onClick={() => setDrawerOpen(false)} aria-label="Close filters" className="grid place-items-center size-8 rounded-full hover:bg-white/5">
                  <X className="size-4" />
                </button>
              </div>
              <div className="overflow-y-auto px-4 pb-4">
                <FilterPanel value={draft} onChange={setDraft} />
              </div>
              <div className="flex items-center gap-3 border-t border-border p-4">
                <button
                  onClick={() => { clearAll(); setDrawerOpen(false); }}
                  className="flex-1 rounded-full border border-border py-3 text-[11px] font-mono uppercase tracking-widest hover:bg-white/5"
                >
                  Clear All
                </button>
                <button
                  onClick={() => { applyFilters(draft); setDrawerOpen(false); }}
                  className="flex-1 rounded-full bg-accent text-accent-foreground py-3 text-[11px] font-bold font-mono uppercase tracking-widest hover:brightness-110"
                >
                  Apply Filters
                </button>
              </div>
            </DrawerContent>
          </Drawer>

          {activeFilterCount > 0 && (
            <button onClick={clearAll} className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-accent">Clear all</button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono tracking-wide text-muted-foreground">{loading ? "Searching…" : `${resultCount} Product${resultCount === 1 ? "" : "s"} Found`}</span>
          <select value={search.sort ?? "relevance"} onChange={(e) => update({ sort: e.target.value })}
            aria-label="Sort search results"
            className="bg-background border border-border rounded-full px-3 py-2 text-[11px] font-mono uppercase tracking-widest focus:outline-none focus:border-accent">
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {/* Active filter chips — removable */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-6 sm:mb-8">
          {activeChips.map((chip) => (
            <button
              key={chip.label}
              onClick={chip.clear}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1.5 text-[11px] font-mono tracking-wide text-foreground hover:border-accent hover:text-accent transition-colors"
            >
              {chip.label}
              <X className="size-3" />
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[240px,1fr] gap-6 lg:gap-8">
        {/* Desktop sidebar — applies instantly */}
        <aside className="hidden lg:block">
          <FilterPanel value={currentFilters} onChange={applyFilters} />
        </aside>

        <div>
          {loading ? (
            <ProductSkeletonGrid count={9} className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5 lg:gap-6" />
          ) : results.length === 0 ? (
            <div className="py-16 sm:py-24 px-6 text-center border border-dashed border-border rounded-2xl">
              <div className="size-16 mx-auto mb-5 grid place-items-center rounded-full border border-border bg-card/40">
                <Search className="size-6 text-muted-foreground" />
              </div>
              <p className="text-base font-medium">No products match your filters</p>
              <p className="text-sm text-muted-foreground mt-1.5">Try adjusting or clearing your filters to see more results.</p>
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
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5 lg:gap-6">
              {results.map((p) => <ProductCard key={p.slug} product={p} />)}
            </div>
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


      {/* Recently viewed — real per-user history, hides itself when empty */}
      <div className="-mx-4 sm:-mx-6">
        <RecentlyViewed />
      </div>
    </div>
  );
}
