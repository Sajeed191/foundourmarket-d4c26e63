import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, SlidersHorizontal, X, Star, ShieldCheck, RefreshCw, BadgeCheck, Globe, Check, ArrowUpDown, Sparkles, TrendingUp, Flame, Clock, ArrowDownWideNarrow, ArrowUpWideNarrow, Tag, Zap, type LucideIcon } from "lucide-react";
import { useFlashDeals } from "@/lib/use-flash-deals";
import { supabase } from "@/integrations/supabase/client";
import { rowToProduct, discountPercent, SELECT_COLS, type Product } from "@/lib/products";
import { useCategories, useAllCategories, type Category } from "@/lib/use-categories";
import { MobileFilterDrawer } from "@/components/site/MobileFilterDrawer";
import { ActiveFilterBar } from "@/components/site/ActiveFilterBar";
import { ResultCounter } from "@/components/site/ResultCounter";
import { InfiniteScrollSentinel } from "@/components/site/InfiniteScrollSentinel";
import {
  type Filters as ClientFilters,
  type Facet,
  type PriceCtx,
  applyFilters as applyClientFilters,
  countActive,
  basePriceOf,
} from "@/lib/search-filters";
import { useFacets } from "@/lib/search-facets";
import { fetchVariantFacets, type VariantFacetMap } from "@/lib/variant-facets";
import { primeVariantSummaries } from "@/lib/variant-swatch-cache";
import { useRegion } from "@/lib/region";
import { ProductCard } from "@/components/site/ProductCard";
import { BrowseCard } from "@/components/site/BrowseCard";
import { buildBrowsePresentation } from "@/lib/browse";
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
  color?: string;
  size?: string;
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
const FILTER_SNAP_POINTS = [0, 50, 200, 500, PRICE_MAX];
const PAGE_SIZE = 60;

const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : undefined);
const num = (v: unknown) => (v != null && v !== "" ? Number(v) : undefined);

// CSV multi-select helpers (brand / colour / size share the same encoding).
const csvSet = (v?: string) =>
  new Set((v ?? "").split(",").map((x) => x.trim()).filter(Boolean));
const toggleInCsv = (v: string | undefined, name: string): string | undefined => {
  const s = csvSet(v);
  s.has(name) ? s.delete(name) : s.add(name);
  return s.size ? [...s].join(",") : undefined;
};

export const Route = createFileRoute("/search")({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    q: str(s.q),
    cat: str(s.cat),
    sub: str(s.sub),
    brand: str(s.brand),
    color: str(s.color),
    size: str(s.size),
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

const SORTS: { value: string; label: string; desc: string; icon: LucideIcon; group: string }[] = [
  { value: "relevance", label: "Relevance", desc: "Best match for your search", icon: Sparkles, group: "Recommended" },
  { value: "flash_deals", label: "Flash Deals", desc: "Limited-time offers first", icon: Zap, group: "Recommended" },
  { value: "trending", label: "Trending", desc: "Rising in views & sales", icon: TrendingUp, group: "Recommended" },
  { value: "best_selling", label: "Best Selling", desc: "Most orders overall", icon: Flame, group: "Recommended" },
  { value: "price_asc", label: "Price: Low → High", desc: "Cheapest first", icon: ArrowDownWideNarrow, group: "Price" },
  { value: "price_desc", label: "Price: High → Low", desc: "Premium first", icon: ArrowUpWideNarrow, group: "Price" },
  { value: "discount", label: "Biggest Discount", desc: "Best deals first", icon: Tag, group: "Price" },
  { value: "rating", label: "Highest Rated", desc: "Top review scores first", icon: Star, group: "Customer" },
  { value: "newest", label: "Newest", desc: "Latest arrivals", icon: Clock, group: "New" },
];

// Sort options grouped for a premium, scannable sort sheet.
const SORT_GROUPS: string[] = ["Recommended", "Price", "Customer", "New"];

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

/**
 * Deterministic multi-key sort. Every branch uses stable tiebreakers so the
 * same input always produces the same output — no randomness after sort.
 * Final fallback is a stable key (id/slug) to keep order identical across
 * re-renders and virtualization windows.
 */
function applyClientSort(
  rows: Product[],
  sort: string | undefined,
  discountOf: (p: Product) => number,
  priceOf: (p: Product) => number,
  flashEndAt: Map<string, string> = new Map(),
): Product[] {
  const stableKey = (p: Product) => p.id ?? p.slug ?? "";
  const cmpStable = (a: Product, b: Product) => stableKey(a).localeCompare(stableKey(b));
  const cmpBy =
    (...keys: Array<(p: Product) => number>) =>
    (a: Product, b: Product) => {
      for (const k of keys) {
        const d = k(b) - k(a); // higher first
        if (d !== 0) return d;
      }
      return cmpStable(a, b);
    };
  const ts = (s?: string | null) => (s ? Date.parse(s) || 0 : 0);
  const isFlash = (p: Product) => (p.flashDeal || p.hotDeal ? 1 : 0);

  switch (sort) {
    case "flash_deals": {
      // Active deals first; within deals: ending-soonest, then highest discount,
      // then popularity. Non-deal products fall through to relevance-ish order.
      const now = Date.now();
      return [...rows].sort((a, b) => {
        const af = isFlash(a), bf = isFlash(b);
        if (af !== bf) return bf - af;
        if (af && bf) {
          const ae = flashEndAt.get(a.id ?? "") ? ts(flashEndAt.get(a.id ?? "")) : Infinity;
          const be = flashEndAt.get(b.id ?? "") ? ts(flashEndAt.get(b.id ?? "")) : Infinity;
          // Only consider future end times for "ending soon".
          const aend = ae > now ? ae : Infinity;
          const bend = be > now ? be : Infinity;
          if (aend !== bend) return aend - bend;
          const dd = discountOf(b) - discountOf(a);
          if (dd !== 0) return dd;
        }
        const pop = (b.soldCount - a.soldCount) || (b.viewsCount - a.viewsCount);
        if (pop !== 0) return pop;
        return cmpStable(a, b);
      });
    }
    case "trending":
      // Trending flag first, then recent views + sales, then recency.
      return [...rows].sort(
        cmpBy(
          (p) => (p.trending ? 1 : 0),
          (p) => p.viewsCount,
          (p) => p.soldCount,
          (p) => ts(p.createdAt),
        ),
      );
    case "best_selling":
      // Total completed orders → sales velocity proxy (sold / age days) → rating → reviews.
      return [...rows].sort(
        cmpBy(
          (p) => p.ordersCount || p.soldCount,
          (p) => {
            const ageDays = Math.max(1, (Date.now() - ts(p.createdAt)) / 86_400_000);
            return p.soldCount / ageDays;
          },
          (p) => p.rating,
          (p) => p.reviews,
        ),
      );
    case "best_selling_reviews":
      return [...rows].sort(cmpBy((p) => p.reviews, (p) => p.rating));
    case "rating": {
      // Bayesian-ish rating to avoid 1–2 review products dominating.
      const C = 4.0; // prior mean
      const m = 10; // prior weight (min reviews to matter)
      const score = (p: Product) => (p.rating * p.reviews + C * m) / (p.reviews + m);
      return [...rows].sort(
        cmpBy(score, (p) => p.reviews, (p) => p.soldCount, (p) => ts(p.createdAt)),
      );
    }
    case "newest":
      return [...rows].sort(
        cmpBy(
          (p) => ts(p.scheduledPublishAt),
          (p) => ts(p.createdAt),
        ),
      );
    case "discount": {
      // Only products with a real discount rank; zero-discount fall to popularity.
      return [...rows].sort((a, b) => {
        const da = discountOf(a), db = discountOf(b);
        const ha = da > 0 ? 1 : 0, hb = db > 0 ? 1 : 0;
        if (ha !== hb) return hb - ha;
        if (db !== da) return db - da;
        // Larger absolute saving next
        const savingA = Math.max(0, priceOf(a) * (da / 100));
        const savingB = Math.max(0, priceOf(b) * (db / 100));
        if (savingB !== savingA) return savingB - savingA;
        const pa = priceOf(a), pb = priceOf(b);
        if (pa !== pb) return pa - pb;
        const pop = (b.soldCount - a.soldCount);
        if (pop !== 0) return pop;
        return cmpStable(a, b);
      });
    }
    case "price_asc":
      return [...rows].sort((a, b) => priceOf(a) - priceOf(b) || cmpStable(a, b));
    case "price_desc":
      return [...rows].sort((a, b) => priceOf(b) - priceOf(a) || cmpStable(a, b));
    default:
      return rows;
  }
}

const RATINGS = [4, 3, 2];

type Filters = ClientFilters;

const FILTER_KEYS: (keyof Filters)[] = [
  "cat",
  "sub",
  "brand",
  "color",
  "size",
  "min",
  "max",
  "rating",
  "stock",
  "free",
  "cod",
  "sale",
  "flash",
  "hot",
  "newx",
  "feat",
  "dmin",
];

function sameFilters(a: Filters, b: Filters): boolean {
  return FILTER_KEYS.every((key) => a[key] === b[key]);
}

function MobileFilterLauncher({
  currentFilters,
  currentSort,
  rawRows,
  priceCtx,
  variantFacets,
  liveFacets,
  allCategories,
  activeFilterCount,
  fmt,
  rate,
  symbol,
  onApplyFilters,
  renderTrigger,
}: {
  currentFilters: Filters;
  currentSort: string;
  rawRows: Product[];
  priceCtx: PriceCtx;
  variantFacets: VariantFacetMap;
  liveFacets: { count: number; brands: Facet[]; colors: Facet[]; sizes: Facet[] };
  allCategories: Category[];
  activeFilterCount: number;
  fmt: (usd: number) => string;
  rate: number;
  symbol: string;
  onApplyFilters: (filters: Filters, sort: string) => void;
  /** Optional custom trigger. Receives open-callback and current active count. */
  renderTrigger?: (open: () => void, activeCount: number) => React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState<Filters>(currentFilters);
  const [draftSort, setDraftSort] = useState<string>(currentSort);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (drawerOpen && !wasOpenRef.current) {
      setDraft((prev) => (sameFilters(prev, currentFilters) ? prev : currentFilters));
      setDraftSort((prev) => (prev === currentSort ? prev : currentSort));
    }
    wasOpenRef.current = drawerOpen;
  }, [drawerOpen, currentFilters, currentSort]);

  useEffect(() => {
    if (!drawerOpen) return;
    document.body.classList.add("hide-bottom-nav");
    const feed = document.querySelector<HTMLElement>("[data-search-feed]");
    const previousDisplay = feed?.style.display ?? "";
    if (feed) feed.style.display = "none";
    return () => {
      document.body.classList.remove("hide-bottom-nav");
      if (feed) feed.style.display = previousDisplay;
    };
  }, [drawerOpen]);

  const draftMatchesCurrent = useMemo(() => sameFilters(draft, currentFilters), [draft, currentFilters]);
  const draftFacets = useFacets(
    rawRows,
    draft,
    priceCtx,
    variantFacets,
    drawerOpen && !draftMatchesCurrent,
    liveFacets,
  );

  const applyDraft = useCallback(() => {
    onApplyFilters(draft, draftSort);
    setDrawerOpen(false);
  }, [onApplyFilters, draft, draftSort]);

  const resetDraft = useCallback(() => {
    setDraft({});
    setDraftSort("relevance");
  }, []);

  return (
    <>
      {renderTrigger ? (
        renderTrigger(() => setDrawerOpen(true), activeFilterCount)
      ) : (
        <button
          onClick={() => setDrawerOpen(true)}
          className="lg:hidden shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/[0.05] ring-1 ring-white/10 text-xs font-medium hover:bg-white/[0.08] transition-all"
        >
          <SlidersHorizontal className="size-4" /> Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </button>
      )}

      <MobileFilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        draft={draft}
        setDraft={setDraft}
        sort={draftSort}
        setSort={setDraftSort}
        allCategories={allCategories}
        brands={draftFacets.brands}
        colors={draftFacets.colors}
        sizes={draftFacets.sizes}
        priceMax={PRICE_MAX}
        snapPoints={FILTER_SNAP_POINTS}
        fmt={fmt}
        rate={rate}
        symbol={symbol}
        resultCount={draftFacets.count}
        onReset={resetDraft}
        onApply={applyDraft}
      />
    </>
  );
}



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
  brands = [],
  colors = [],
  sizes = [],
}: {
  value: Filters;
  onChange: (next: Filters) => void;
  /** When provided, an inline Sort section is rendered (mobile drawer). */
  sort?: string;
  onSortChange?: (sort: string) => void;
  brands?: Facet[];
  colors?: Facet[];
  sizes?: Facet[];
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

      {/* Brand (dynamic facet) */}
      {brands.length > 0 && (
        <div>
          <SectionLabel>Brand</SectionLabel>
          <div className="space-y-1 max-h-64 overflow-y-auto pr-1 [scrollbar-width:thin]">
            {brands.map((b) => {
              const sel = csvSet(value.brand);
              const active = sel.has(b.name);
              return (
                <button
                  key={b.name}
                  onClick={() => !b.disabled && set({ brand: toggleInCsv(value.brand, b.name) })}
                  disabled={b.disabled}
                  aria-disabled={b.disabled}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors ${b.disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-white/[0.04]"}`}
                >
                  <span className={`grid size-4 place-items-center rounded-md border ${active ? "border-accent bg-accent text-accent-foreground" : "border-white/25"}`}>
                    {active && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className={`flex-1 text-left ${active ? "text-accent font-medium" : "text-foreground"}`}>{b.name}</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{b.count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Colour (variant-aware dynamic facet) */}
      {colors.length > 0 && (
        <div>
          <SectionLabel>Colour</SectionLabel>
          <div className="grid grid-cols-5 gap-3">
            {colors.map((c) => {
              const active = csvSet(value.color).has(c.name);
              return (
                <button
                  key={c.name}
                  onClick={() => !c.disabled && set({ color: toggleInCsv(value.color, c.name) })}
                  disabled={c.disabled}
                  aria-pressed={active}
                  aria-disabled={c.disabled}
                  aria-label={`${c.name}${c.disabled ? " (unavailable)" : ` (${c.count})`}`}
                  className={`group flex flex-col items-center gap-1.5 transition-transform ${c.disabled ? "opacity-50 cursor-not-allowed" : "active:scale-95"}`}
                >
                  <span className={`relative grid size-10 place-items-center rounded-full ring-2 transition-all ${active ? "ring-accent" : c.disabled ? "ring-white/10" : "ring-white/20 group-hover:ring-white/40"}`}>
                    <span className="size-7 rounded-full ring-1 ring-black/20" style={{ backgroundColor: c.hex ?? "#888" }} aria-hidden />
                    {active && (
                      <span className="absolute inset-0 grid place-items-center animate-scale-in">
                        <span className="grid size-4.5 place-items-center rounded-full bg-accent text-accent-foreground shadow">
                          <Check className="size-3" strokeWidth={3} />
                        </span>
                      </span>
                    )}
                    {c.disabled && (
                      <span aria-hidden className="absolute inset-0 grid place-items-center">
                        <span className="h-px w-8 rotate-45 bg-white/40" />
                      </span>
                    )}
                  </span>
                  <span className={`max-w-[4rem] truncate text-[11px] font-medium ${active ? "text-accent" : "text-foreground"}`}>{c.name}</span>
                  <span className="-mt-1 tabular-nums text-[10px] text-muted-foreground">{c.count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Size (variant-aware dynamic facet) */}
      {sizes.length > 0 && (
        <div>
          <SectionLabel>Size</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {sizes.map((s) => {
              const active = csvSet(value.size).has(s.name);
              return (
                <button
                  key={s.name}
                  onClick={() => !s.disabled && set({ size: toggleInCsv(value.size, s.name) })}
                  disabled={s.disabled}
                  aria-pressed={active}
                  aria-disabled={s.disabled}
                  className={`relative min-w-11 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all ${
                    s.disabled
                      ? "text-muted-foreground/60 bg-white/[0.02] ring-1 ring-white/5 cursor-not-allowed"
                      : active
                        ? "bg-accent/15 text-accent ring-1 ring-accent/40 active:scale-95"
                        : "bg-white/[0.05] text-foreground ring-1 ring-white/10 hover:bg-white/[0.08] active:scale-95"
                  }`}
                >
                  <span className={s.disabled ? "line-through" : ""}>{s.name}</span>
                  <span className="ml-1 tabular-nums text-[10px] text-muted-foreground">{s.count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}



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
  const [sortOpen, setSortOpen] = useState(false);
  const [rawRows, setRawRows] = useState<Product[]>([]);
  const [variantFacets, setVariantFacets] = useState<VariantFacetMap>(() => new Map());
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
  // Sticky control bar visibility: collapse on scroll-down, reveal on scroll-up.
  const [barHidden, setBarHidden] = useState(false);

  // Hide the mobile bottom nav while the sort sheet is open.
  useEffect(() => {
    document.body.classList.toggle("hide-bottom-nav", sortOpen);
    return () => document.body.classList.remove("hide-bottom-nav");
  }, [sortOpen]);

  // Reveal a compact sticky search bar once the user scrolls past the hero.
  // Also track scroll DIRECTION so the sticky control bar collapses when the
  // user scrolls down (maximising the grid) and reappears when scrolling up.
  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;
    const update = () => {
      const y = window.scrollY;
      setScrolled(y > 280);
      const delta = y - lastY;
      if (y < 160) setBarHidden(false); // always show near the top
      else if (delta > 6) setBarHidden(true); // scrolling down
      else if (delta < -6) setBarHidden(false); // scrolling up
      lastY = y;
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const currentFilters: Filters = useMemo(
    () => ({
      cat: search.cat,
      sub: search.sub,
      brand: search.brand,
      color: search.color,
      size: search.size,
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
    [search.cat, search.sub, search.brand, search.color, search.size, search.min, search.max, search.rating, search.stock, search.free, search.cod, search.sale, search.flash, search.hot, search.newx, search.feat, search.dmin],
  );

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

  // Live flash-deal end-times, keyed by product id — powers the "ending soon"
  // tiebreaker for the Flash Deals sort. Enabled only when that sort is active
  // so other sorts stay free of the extra realtime subscription.
  const { items: flashItems } = useFlashDeals();
  const flashEndAt = useMemo(() => {
    const m = new Map<string, string>();
    if (sort !== "flash_deals") return m;
    for (const it of flashItems) {
      if (it.product.id && it.endAt) m.set(it.product.id, it.endAt);
    }
    return m;
  }, [flashItems, sort]);

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

  // Lightweight variant facet layer: once the result set loads, fetch ONLY the
  // colour/size/stock/price columns for those slugs (never full variants) and
  // merge them into the filter engine. Payload stays tiny and variant sections
  // simply stay hidden when no variants exist.
  useEffect(() => {
    if (rawRows.length === 0) {
      setVariantFacets(new Map());
      return;
    }
    let cancelled = false;
    const slugs = rawRows.map((p) => p.slug);
    fetchVariantFacets(slugs)
      .then((map) => { if (!cancelled) { setVariantFacets(map); primeVariantSummaries(map); } })
      .catch(() => { if (!cancelled) setVariantFacets(new Map()); });
    return () => { cancelled = true; };
  }, [rawRows]);

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

  // Exclusive-collection sorts: Flash Deals, Best Selling, Trending, Newest.
  // These narrow the pool to products holding the matching badge, then sort
  // deterministically. Other sorts continue to sort the full visible set.
  const flashEligibleIds = useMemo(() => {
    const s = new Set<string>();
    for (const it of flashItems) if (it.product.id) s.add(it.product.id);
    return s;
  }, [flashItems]);

  const daysSinceIso = (iso?: string) => {
    if (!iso) return Infinity;
    const t = Date.parse(iso);
    return Number.isNaN(t) ? Infinity : (Date.now() - t) / 86_400_000;
  };
  const isBestsellerBadge = (p: Product) => Boolean(p.bestseller) || (p.soldCount ?? 0) >= 50;
  const isTrendingBadge = (p: Product) =>
    Boolean(p.trending) || (p.viewsCount ?? 0) >= 200 || (p.wishlistCount ?? 0) >= 15;
  const isNewBadge = (p: Product) => Boolean(p.newArrival) || daysSinceIso(p.createdAt) <= 14;

  // Full client-side filtered + sorted result set (drives the live count).
  const results = useMemo(() => {
    let pool = rawRows;
    if (sort === "flash_deals") {
      pool = rawRows.filter((p) => p.id && flashEligibleIds.has(p.id));
    } else if (sort === "best_selling") {
      pool = rawRows.filter(isBestsellerBadge);
    } else if (sort === "trending") {
      pool = rawRows.filter(isTrendingBadge);
    } else if (sort === "newest") {
      pool = rawRows.filter(isNewBadge);
    }
    const filtered = applyClientFilters(pool, currentFilters, priceCtx, variantFacets);
    const sorted = applyClientSort(
      filtered,
      sort,
      (p) => discountPercent(priceOf(p), compareOf(p)) ?? p.discount ?? 0,
      priceOf,
      flashEndAt,
    );
    if (sort === "flash_deals") return sorted.slice(0, 10);
    if (sort === "newest") return sorted.slice(0, 30);
    const noActive = countActive(currentFilters) === 0;
    const isDefaultBrowse = (sort === "relevance" || !sort) && !(search.q ?? "").trim() && noActive;
    return isDefaultBrowse ? seededShuffle(sorted, rotBucket) : sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawRows, currentFilters, priceCtx, variantFacets, sort, search.q, rotBucket, priceOf, compareOf, flashEndAt, flashEligibleIds]);

  // Client-side pagination with back-navigation state preservation. The
  // scroll position + visible window are persisted per search key so returning
  // from a product page restores scroll, pagination and the infinite-scroll
  // window exactly. Changing filters/query (new key) resets to the first page.
  const searchKey = useMemo(() => JSON.stringify(search), [search]);
  const restoredKey = useRef<string | null>(null);
  const posKey = `fom_search_pos:${searchKey}`;

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    restoredKey.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey]);

  useEffect(() => {
    if (loading || results.length === 0 || restoredKey.current === searchKey) return;
    restoredKey.current = searchKey;
    try {
      const raw = sessionStorage.getItem(posKey);
      if (!raw) return;
      const { y, v } = JSON.parse(raw) as { y?: number; v?: number };
      if (typeof v === "number" && v > PAGE_SIZE) setVisibleCount(Math.min(v, results.length));
      if (typeof y === "number") requestAnimationFrame(() => window.scrollTo(0, y));
    } catch { /* ignore */ }
  }, [loading, results, searchKey, posKey]);

  useEffect(() => {
    const save = () => {
      try {
        sessionStorage.setItem(posKey, JSON.stringify({ y: window.scrollY, v: visibleCount }));
      } catch { /* ignore */ }
    };
    window.addEventListener("scroll", save, { passive: true });
    window.addEventListener("pagehide", save);
    return () => {
      save();
      window.removeEventListener("scroll", save);
      window.removeEventListener("pagehide", save);
    };
  }, [posKey, visibleCount]);

  const visibleResults = useMemo(() => results.slice(0, visibleCount), [results, visibleCount]);
  
  function loadMore() { setVisibleCount((c) => c + PAGE_SIZE); }

  // Dynamic facets (brand/colour/size) + live counts for the desktop sidebar.
  const liveFacets = useFacets(rawRows, currentFilters, priceCtx, variantFacets);

  // Empty-state recommendations: a few products from the unfiltered set for the
  // current query/category, so shoppers always have something to explore.
  const recommended = useMemo(
    () => rawRows.filter((p) => !p.hideFromRecommendations).slice(0, 8),
    [rawRows],
  );

  // Smart empty-state suggestions — inspect the active filters and propose the
  // single-tap relaxations most likely to bring products back ("Remove Blue",
  // "Increase max price", "Try another size"). Ordered by how restrictive each
  // dimension typically is; capped so the UI stays calm.
  const smartSuggestions = useMemo(() => {
    const out: { label: string; patch: Partial<SearchParams> }[] = [];
    for (const c of csvSet(currentFilters.color))
      out.push({ label: `Remove ${c}`, patch: { color: toggleInCsv(currentFilters.color, c) } });
    for (const s of csvSet(currentFilters.size))
      out.push({ label: `Try another size (remove ${s})`, patch: { size: toggleInCsv(currentFilters.size, s) } });
    for (const b of csvSet(currentFilters.brand))
      out.push({ label: `Remove ${b}`, patch: { brand: toggleInCsv(currentFilters.brand, b) } });
    if (currentFilters.max != null)
      out.push({ label: "Increase max price", patch: { max: undefined } });
    if (currentFilters.min != null)
      out.push({ label: "Lower minimum price", patch: { min: undefined } });
    if (currentFilters.rating != null)
      out.push({
        label: currentFilters.rating > 1 ? `Lower rating to ${currentFilters.rating - 1}★` : "Remove rating filter",
        patch: { rating: currentFilters.rating > 1 ? currentFilters.rating - 1 : undefined },
      });
    if (currentFilters.dmin != null)
      out.push({ label: "Lower discount requirement", patch: { dmin: undefined } });
    if (currentFilters.stock)
      out.push({ label: "Show any availability", patch: { stock: undefined } });
    return out.slice(0, 5);
  }, [currentFilters]);




  function update(patch: Partial<SearchParams>) {
    nav({ search: (prev: SearchParams) => ({ ...prev, ...patch }), replace: true });
  }
  function applyFilters(f: Filters) {
    nav({ search: (prev: SearchParams) => ({ ...prev, ...f }), replace: true });
  }
  function clearAll() {
    nav({ search: { q: search.q, sort: search.sort }, replace: true });
  }
  const applyMobileFilters = useCallback((filters: Filters, nextSort: string) => {
    nav({ search: (prev: SearchParams) => ({ ...prev, ...filters, sort: nextSort }), replace: true });
  }, [nav]);

  const activeFilterCount = countActive(currentFilters);

  const getProductKey = useCallback((p: Product) => p.id ?? p.slug, []);
  const browsePresentation = useMemo(
    () => buildBrowsePresentation({ products: results, surface: "search" }),
    [results],
  );
  const renderProduct = useCallback(
    (p: Product, i: number) => (
      <BrowseCard
        product={p}
        presentation={browsePresentation.get(p.id ?? p.slug)}
        priority={i < 4}
        highlight={search.q}
      />
    ),
    [search.q, browsePresentation],
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

      {/* Premium hero — compact, integrated capsule search */}
      <div className="relative mb-4 sm:mb-5">
        {/* Subtle ambient glow — pure paint, no layout impact */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-6 -top-6 h-40 bg-[radial-gradient(60%_100%_at_50%_0%,oklch(0.74_0.19_49/0.10),transparent_70%)]"
        />
        <div className="relative">
          <h1 className="text-[22px] sm:text-[28px] font-display font-semibold tracking-tight leading-tight">Browse Marketplace</h1>
          <p className="text-[12px] sm:text-sm text-muted-foreground/80 font-light mt-0.5 mb-3 sm:mb-4">
            Discover products from trusted global sellers.
          </p>

          <form
            onSubmit={(e) => { e.preventDefault(); update({ q: query }); }}
            className="relative w-full max-w-2xl"
            role="search"
          >
            <div className="group relative flex items-center rounded-full bg-white/[0.05] ring-1 ring-white/10 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_10px_40px_-24px_rgba(0,0,0,0.7)] focus-within:ring-accent/50 focus-within:bg-white/[0.07] transition-all duration-200">
              <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 size-[16px] text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products, brands, categories…"
                aria-label="Search marketplace"
                className="w-full bg-transparent border-0 rounded-full pl-11 pr-24 py-3 text-sm sm:text-[15px] focus:outline-none placeholder:text-muted-foreground/70"
              />
              <button
                type="submit"
                aria-label="Search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 bg-accent text-accent-foreground font-semibold pl-3.5 pr-4 py-2 rounded-full text-[11px] uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all"
              >
                <Search className="size-3.5" strokeWidth={2.5} />
                Search
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Premium unified control panel — categories + filter + sort in one
          intelligent surface. Sticky on mobile with auto-collapse on scroll. */}
      <div
        className={`sticky top-0 z-30 -mx-4 sm:mx-0 mb-5 transition-transform duration-300 will-change-transform ${barHidden ? "-translate-y-[130%]" : "translate-y-0"}`}
      >
        <div className="relative px-4 py-3 sm:p-4 bg-[oklch(0.16_0.008_260/0.75)] sm:rounded-3xl border-b sm:border border-white/[0.06] backdrop-blur-2xl shadow-[0_20px_60px_-30px_rgba(0,0,0,0.6)]">
          {/* Subtle ambient orange edge glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 sm:rounded-3xl bg-[radial-gradient(80%_100%_at_50%_0%,oklch(0.74_0.19_49/0.06),transparent_60%)]"
          />

          <div className="relative space-y-2.5">
            {/* Category chips — hidden in Trending mode (dedicated dataset) */}
            {!isTrending && categories.length > 0 && (
              <div className="-mx-4 sm:mx-0">
                <div className="flex gap-1.5 overflow-x-auto px-4 sm:px-0 py-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  <button
                    onClick={() => update({ cat: undefined })}
                    className={`shrink-0 h-9 inline-flex items-center rounded-full px-3.5 text-[12px] font-medium leading-none whitespace-nowrap transition-colors duration-150 active:scale-[0.97] ${!search.cat ? "bg-accent/[0.14] text-accent ring-1 ring-accent/40 shadow-[0_0_18px_-8px_var(--accent)]" : "bg-white/[0.035] text-muted-foreground ring-1 ring-white/[0.07] hover:text-foreground hover:bg-white/[0.06]"}`}
                  >
                    All
                  </button>
                  {categories.map((c) => {
                    const active = search.cat === c.slug;
                    return (
                      <button
                        key={c.slug}
                        onClick={() => update({ cat: active ? undefined : c.slug })}
                        className={`shrink-0 h-9 inline-flex items-center rounded-full px-3.5 text-[12px] font-medium leading-none whitespace-nowrap transition-colors duration-150 active:scale-[0.97] ${active ? "bg-accent/[0.14] text-accent ring-1 ring-accent/40 shadow-[0_0_18px_-8px_var(--accent)]" : "bg-white/[0.035] text-muted-foreground ring-1 ring-white/[0.07] hover:text-foreground hover:bg-white/[0.06]"}`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Filter + Sort — compact premium pills */}
            <div className="flex items-center gap-2">
              <MobileFilterLauncher
                currentFilters={currentFilters}
                currentSort={sort}
                rawRows={rawRows}
                priceCtx={priceCtx}
                variantFacets={variantFacets}
                liveFacets={liveFacets}
                allCategories={allCategories}
                activeFilterCount={activeFilterCount}
                fmt={fmt}
                rate={rate}
                symbol={symbol}
                onApplyFilters={applyMobileFilters}
                renderTrigger={(open, count) => (
                  <button
                    onClick={open}
                    aria-label={`Filter${count > 0 ? `, ${count} active` : ""}`}
                    className="group inline-flex h-10 items-center gap-2 rounded-full bg-white/[0.05] ring-1 ring-white/[0.09] pl-3.5 pr-4 text-[12.5px] font-semibold text-foreground transition-colors duration-150 hover:bg-white/[0.075] active:scale-[0.97]"
                  >
                    <SlidersHorizontal className="size-4 text-foreground/80" strokeWidth={2} />
                    <span>Filter</span>
                    {count > 0 && (
                      <>
                        <span aria-hidden className="text-muted-foreground/50">•</span>
                        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-accent-foreground text-[10px] font-bold tabular-nums leading-none">
                          {count}
                        </span>
                      </>
                    )}
                  </button>
                )}
              />

              <Drawer open={sortOpen} onOpenChange={setSortOpen}>
                <DrawerTrigger asChild>
                  <button
                    aria-label={`Sort: ${(SORTS.find((s) => s.value === (search.sort ?? "relevance")) ?? SORTS[0]).label}`}
                    className="group inline-flex h-10 items-center gap-2 rounded-full bg-white/[0.05] ring-1 ring-white/[0.09] pl-3.5 pr-4 text-[12.5px] font-semibold text-foreground transition-colors duration-150 hover:bg-white/[0.075] active:scale-[0.97]"
                  >
                    <ArrowUpDown className="size-4 text-foreground/80" strokeWidth={2} />
                    <span>Sort</span>
                    <span aria-hidden className="text-muted-foreground/50">•</span>
                    <span className="max-w-[9rem] truncate text-muted-foreground font-medium">
                      {(SORTS.find((s) => s.value === (search.sort ?? "relevance")) ?? SORTS[0]).label}
                    </span>
                  </button>
                </DrawerTrigger>
                <DrawerContent className="border-white/10 bg-background/80 backdrop-blur-2xl">
                  <div className="mx-auto w-full max-w-md px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                    <div className="flex items-center gap-2 px-2 pt-1 pb-4">
                      <ArrowUpDown className="size-4 text-accent" />
                      <h2 className="text-base font-semibold text-foreground">Sort by</h2>
                    </div>
                    <div className="space-y-5">
                      {SORT_GROUPS.map((group) => {
                        const items = SORTS.filter((s) => s.group === group);
                        if (items.length === 0) return null;
                        return (
                          <div key={group}>
                            <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">{group}</p>
                            <div className="space-y-2">
                              {items.map((s) => {
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
                        );
                      })}
                    </div>
                  </div>
                </DrawerContent>
              </Drawer>
            </div>
          </div>
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
            <FilterPanel
              value={currentFilters}
              onChange={applyFilters}
              brands={liveFacets.brands}
              colors={liveFacets.colors}
              sizes={liveFacets.sizes}
            />
          </aside>
        )}

        <div data-search-feed key={isTrending ? "trending" : "feed"} className="animate-fade-up">

          {!isTrending && (
            <>
              <ActiveFilterBar
                filters={currentFilters}
                allCategories={allCategories}
                fmt={fmt}
                priceMax={PRICE_MAX}
                onChange={(patch) => update(patch as Partial<SearchParams>)}
                onClear={clearAll}
                className="mb-4"
              />
            </>
          )}

          {loading ? (
            <ProductSkeletonGrid count={9} className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5 lg:gap-6" />
          ) : results.length === 0 ? (
            <div className="py-16 sm:py-24 px-6 text-center border border-dashed border-border rounded-2xl">
              <div className="size-16 mx-auto mb-5 grid place-items-center rounded-full border border-border bg-card/40">
                <Search className="size-6 text-muted-foreground" />
              </div>
              <p className="text-base font-medium">{isTrending ? "No trending products right now" : "No products match your filters."}</p>
              <p className="text-sm text-muted-foreground mt-1.5">{isTrending ? "Check back soon — trending updates in real time as shoppers browse and buy." : "Try adjusting or clearing your filters to see more results."}</p>
              <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
                {!isTrending && activeFilterCount > 0 && (
                  <button onClick={clearAll}
                    className="inline-flex items-center gap-1.5 rounded-full bg-accent text-accent-foreground font-mono uppercase tracking-widest text-[11px] px-4 py-2 hover:brightness-110 transition-all">
                    Clear Filters
                  </button>
                )}
                <button onClick={() => window.history.back()}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 font-mono uppercase tracking-widest text-[11px] px-4 py-2 hover:border-accent hover:text-accent transition-all">
                  Back
                </button>
                <Link to="/categories" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 font-mono uppercase tracking-widest text-[11px] px-4 py-2 hover:border-accent hover:text-accent transition-all">
                  Browse Categories
                </Link>
              </div>

              {/* Smart suggestions — one-tap relaxations of the tightest filters */}
              {!isTrending && smartSuggestions.length > 0 && (
                <div className="mt-7">
                  <p className="mb-3 text-xs font-mono uppercase tracking-widest text-muted-foreground">Try adjusting</p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {smartSuggestions.map((s) => (
                      <button
                        key={s.label}
                        onClick={() => update(s.patch)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-accent/12 text-accent ring-1 ring-accent/30 px-3.5 py-2 text-xs font-medium hover:bg-accent/20 active:scale-95 transition-all"
                      >
                        <Sparkles className="size-3.5" />
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommend similar products from the unfiltered result set */}
              {!isTrending && recommended.length > 0 && (
                <div className="mt-10 text-left">
                  <p className="mb-4 text-center text-xs font-mono uppercase tracking-widest text-muted-foreground">You might also like</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
                    {recommended.map((p, i) => (
                      <ProductCard key={p.id ?? p.slug} product={p} priority={i < 4} />
                    ))}
                  </div>
                </div>
              )}
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

              <InfiniteScrollSentinel
                hasMore={visibleResults.length < results.length}
                onLoadMore={loadMore}
              />


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
