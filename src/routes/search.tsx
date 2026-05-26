import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, Loader2, X } from "lucide-react";
import { useCategories } from "@/lib/use-categories";
import { useProducts } from "@/lib/use-products";

import { ProductCard } from "@/components/site/ProductCard";

type SearchParams = { q?: string; cat?: string; sort?: string; min?: number; max?: number; stock?: string };

export const Route = createFileRoute("/search")({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    q: typeof s.q === "string" ? s.q : undefined,
    cat: typeof s.cat === "string" ? s.cat : undefined,
    sort: typeof s.sort === "string" ? s.sort : undefined,
    min: typeof s.min === "number" ? s.min : s.min ? Number(s.min) : undefined,
    max: typeof s.max === "number" ? s.max : s.max ? Number(s.max) : undefined,
    stock: typeof s.stock === "string" ? s.stock : undefined,
  }),
  head: () => ({ meta: [{ title: "Search — FoundOurMarket™" }] }),
  component: SearchPage,
});

const SORTS = [
  { value: "relevance", label: "Relevance" },
  { value: "price-asc", label: "Price: Low → High" },
  { value: "price-desc", label: "Price: High → Low" },
  { value: "rating", label: "Top Rated" },
  { value: "newest", label: "Newest" },
];

function SearchPage() {
  const search = Route.useSearch();
  const nav = useNavigate({ from: "/search" });
  const { products, loading } = useProducts();
  const { categories } = useCategories();

  const [query, setQuery] = useState(search.q ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const results = useMemo(() => {
    const q = (search.q ?? "").trim().toLowerCase();
    let r = products.filter((p) => {
      if (search.cat && p.category !== search.cat) return false;
      if (search.stock === "in" && !p.inStock) return false;
      if (search.min != null && p.price < search.min) return false;
      if (search.max != null && p.price > search.max) return false;
      if (q && !(`${p.name} ${p.tagline} ${p.description} ${p.category}`.toLowerCase().includes(q))) return false;
      return true;
    });
    switch (search.sort) {
      case "price-asc": r = [...r].sort((a, b) => a.price - b.price); break;
      case "price-desc": r = [...r].sort((a, b) => b.price - a.price); break;
      case "rating": r = [...r].sort((a, b) => b.rating - a.rating); break;
      case "newest": r = [...r].reverse(); break;
    }
    return r;
  }, [products, search]);

  function update(patch: Partial<SearchParams>) {
    nav({ search: (prev: SearchParams) => ({ ...prev, ...patch }), replace: true });
  }

  const activeFilterCount = [search.cat, search.stock, search.min, search.max].filter(Boolean).length;

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="mb-8">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Discover</p>
        <h1 className="text-3xl md:text-5xl font-display font-semibold mb-6">Search the marketplace</h1>

        <form onSubmit={(e) => { e.preventDefault(); update({ q: query }); }} className="relative max-w-2xl">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products, categories, brands…"
            className="w-full bg-card border border-border rounded-full pl-12 pr-28 py-4 text-base focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-all"
          />
          <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 bg-accent text-accent-foreground font-bold px-5 py-2.5 rounded-full text-[11px] uppercase tracking-widest hover:brightness-110 transition-all">
            Search
          </button>
        </form>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-8 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <button onClick={() => setFiltersOpen((o) => !o)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border text-[11px] font-mono uppercase tracking-widest hover:bg-white/5">
            <SlidersHorizontal className="size-3.5" /> Filters
            {activeFilterCount > 0 && <span className="size-5 rounded-full bg-accent text-accent-foreground grid place-items-center text-[10px]">{activeFilterCount}</span>}
          </button>
          {activeFilterCount > 0 && (
            <button onClick={() => nav({ search: { q: search.q }, replace: true })}
              className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-accent">Clear</button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">{loading ? "…" : `${results.length} results`}</span>
          <select value={search.sort ?? "relevance"} onChange={(e) => update({ sort: e.target.value })}
            className="bg-background border border-border rounded-full px-3 py-2 text-[11px] font-mono uppercase tracking-widest focus:outline-none focus:border-accent">
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px,1fr] gap-8">
        <aside className={`${filtersOpen ? "block" : "hidden"} lg:block space-y-8`}>
          <div>
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">Category</h3>
            <div className="space-y-1.5">
              <button onClick={() => update({ cat: undefined })}
                className={`block text-sm hover:text-accent transition-colors ${!search.cat ? "text-accent" : "text-foreground"}`}>All</button>
              {CATEGORIES.map((c) => (
                <button key={c.slug} onClick={() => update({ cat: c.slug })}
                  className={`block text-sm hover:text-accent transition-colors ${search.cat === c.slug ? "text-accent" : "text-foreground"}`}>{c.name}</button>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">Price (USD)</h3>
            <div className="flex gap-2">
              <input type="number" placeholder="Min" defaultValue={search.min ?? ""}
                onBlur={(e) => update({ min: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
              <input type="number" placeholder="Max" defaultValue={search.max ?? ""}
                onBlur={(e) => update({ max: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
            </div>
          </div>
          <div>
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">Availability</h3>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={search.stock === "in"}
                onChange={(e) => update({ stock: e.target.checked ? "in" : undefined })}
                className="accent-[var(--accent)]" />
              In stock only
            </label>
          </div>
        </aside>

        <div>
          {loading ? (
            <div className="py-24 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          ) : results.length === 0 ? (
            <div className="py-24 text-center border border-dashed border-border rounded-2xl">
              <div className="size-14 mx-auto mb-5 grid place-items-center rounded-full border border-border">
                <X className="size-5 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">No products match your search.</p>
              <Link to="/" className="inline-block mt-6 text-xs font-mono uppercase tracking-widest text-accent border-b border-accent pb-1">Browse all</Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {results.map((p) => <ProductCard key={p.slug} product={p} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
