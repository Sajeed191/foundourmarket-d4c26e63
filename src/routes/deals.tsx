import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Loader2,
  Zap,
  Clock,
  Flame,
  Sparkles,
  Package,
  TrendingDown,
  ArrowDownWideNarrow,
  LayoutGrid,
  Tag,
  Star,
  ArrowRight,
} from "lucide-react";
import { useFlashDeals } from "@/lib/use-flash-deals";
import { BrowseCard } from "@/components/site/BrowseCard";
import type { Product } from "@/lib/products";
import { buildBrowsePresentation, sortProductsForBrowse } from "@/lib/browse";
import { useHomepageCollectionRules } from "@/lib/site-rules";

export const Route = createFileRoute("/deals")({
  head: () => ({
    meta: [
      { title: "Flash Deals — FoundOurMarket™" },
      {
        name: "description",
        content:
          "Live flash sales and hot deals across FoundOurMarket™. Refreshed daily with discounts up to 70% off — while stock lasts.",
      },
      { property: "og:title", content: "Flash Deals — FoundOurMarket™" },
      {
        property: "og:description",
        content: "Live flash sales and hot deals. Refreshed daily — while stock lasts.",
      },
    ],
  }),
  component: DealsPage,
});

const ease = [0.16, 1, 0.3, 1] as const;

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

/** Counts down to next midnight — a rolling daily "deal resets" timer. */
function useDailyCountdown() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const end = useMemo(() => {
    const d = new Date();
    d.setHours(24, 0, 0, 0);
    return d.getTime();
  }, []);
  const diff = Math.max(0, end - now);
  return {
    h: Math.floor(diff / 3_600_000),
    m: Math.floor((diff % 3_600_000) / 60_000),
    s: Math.floor((diff % 60_000) / 1000),
    totalMs: diff,
  };
}

type DealSort = "savings" | "ending" | "newest" | "rating" | "price-low" | "popular";

const SORT_OPTIONS: { value: DealSort; label: string }[] = [
  { value: "savings", label: "Highest discount" },
  { value: "ending", label: "Ending soon" },
  { value: "price-low", label: "Lowest price" },
  { value: "newest", label: "Newest" },
  { value: "rating", label: "Best rated" },
  { value: "popular", label: "Most popular" },
];

const BATCH_SIZE = 12;

function DealsPage() {
  // Shared, badge-gated, Site-Rules-capped source used by homepage + /deals.
  // Do NOT re-filter by static p.flashDeal/hotDeal — the hook already gated by
  // live product_badges assignments. That extra filter was the "only 2 shown" bug.
  const { items, loading } = useFlashDeals();
  const rules = useHomepageCollectionRules();
  const countdown = useDailyCountdown();

  const [activeCat, setActiveCat] = useState<string>("all");
  const [sort, setSort] = useState<DealSort>("savings");
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);

  // Products from the full rotated window — no double-filter, no homepage slice.
  const dealProducts = useMemo(() => items.map((i) => i.product), [items]);
  const endAtByProductId = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of items) if (i.endAt && i.product.id) m.set(i.product.id, i.endAt);
    return m;
  }, [items]);

  // Categories with counts
  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of dealProducts) map.set(p.category, (map.get(p.category) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [dealProducts]);

  const filteredProducts = useMemo(
    () =>
      activeCat === "all"
        ? dealProducts
        : dealProducts.filter((p) => p.category === activeCat),
    [dealProducts, activeCat],
  );

  const presentation = useMemo(
    () => buildBrowsePresentation({ products: filteredProducts, surface: "deals" }),
    [filteredProducts],
  );

  const sortedProducts = useMemo(() => {
    const base = sortProductsForBrowse(filteredProducts, presentation, "recommended");
    const arr = [...base];
    switch (sort) {
      case "savings":
        return arr.sort((a, b) => (b.discount ?? 0) - (a.discount ?? 0));
      case "price-low":
        return arr.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
      case "newest":
        return arr.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
      case "rating":
        return arr.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      case "popular":
        return arr.sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0));
      case "ending":
      default:
        return arr.sort((a, b) => {
          const ea = a.id ? endAtByProductId.get(a.id) : undefined;
          const eb = b.id ? endAtByProductId.get(b.id) : undefined;
          const va = ea ? new Date(ea).getTime() : Number.POSITIVE_INFINITY;
          const vb = eb ? new Date(eb).getTime() : Number.POSITIVE_INFINITY;
          return va - vb;
        });
    }
  }, [filteredProducts, presentation, sort, endAtByProductId]);

  // Reset visible count when filters/sort change
  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [activeCat, sort]);

  const visible = useMemo(
    () => sortedProducts.slice(0, visibleCount),
    [sortedProducts, visibleCount],
  );

  // Stats
  const stats = useMemo(() => {
    const active = dealProducts.length;
    const avgDiscount = active
      ? Math.round(
          dealProducts.reduce((s, p) => s + (p.discount ?? 0), 0) / active,
        )
      : 0;
    const biggest = dealProducts.reduce((m, p) => Math.max(m, p.discount ?? 0), 0);
    const lowStock = dealProducts.filter(
      (p) => (p.stockQuantity ?? 0) > 0 && (p.stockQuantity ?? 99) <= 10,
    ).length;
    const endingSoon = items.filter((i) => {
      if (!i.endAt) return false;
      const t = new Date(i.endAt).getTime() - Date.now();
      return t > 0 && t < 6 * 3600_000;
    }).length;
    return { active, avgDiscount, biggest, lowStock, endingSoon };
  }, [dealProducts, items]);

  // Dev verification logs (Part 1)
  useEffect(() => {
    if (!import.meta.env.DEV || loading) return;
    console.info(
      `[Flash Deals · View All] eligible/window=${items.length} | siteRulesLimit=${rules.limits.flash_deals} | homepagePreview=4 | visible=${sortedProducts.length} | category=${activeCat} | rendered=${visible.length}`,
    );
  }, [items.length, sortedProducts.length, visible.length, activeCat, loading, rules.limits.flash_deals]);

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisibleCount((c) => Math.min(sortedProducts.length, c + BATCH_SIZE));
          }
        }
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [sortedProducts.length]);

  const renderProduct = useCallback(
    (p: Product, i: number) => (
      <BrowseCard
        key={p.id ?? p.slug}
        product={p}
        presentation={presentation.get(p.id ?? p.slug)}
        priority={i < 4}
        forceBadge={p.flashDeal ? "flash_deal" : "hot_deal"}
      />
    ),
    [presentation],
  );

  if (loading) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-16 md:pb-24">
      <div className="container-page py-4 sm:py-8 lg:py-10 space-y-6 sm:space-y-8">
        {/* ── PART 2: Premium Hero ── */}
        <PremiumHero
          countdown={countdown}
          biggest={stats.biggest}
          avgDiscount={stats.avgDiscount}
          active={stats.active}
        />

        {/* ── PART 3: Deal Statistics ── */}
        <StatsRow
          active={stats.active}
          endingSoon={stats.endingSoon}
          biggest={stats.biggest}
          lowStock={stats.lowStock}
        />

        {/* ── PART 4: Sticky Filter Bar ── */}
        <StickyFilterBar
          count={sortedProducts.length}
          activeCat={activeCat}
          categories={categories}
          totalCount={dealProducts.length}
          onCategory={setActiveCat}
          sort={sort}
          onSort={setSort}
          rotationHours={rules.rotationHours}
        />

        {/* ── PART 5: Deal Grid ── */}
        {visible.length > 0 ? (
          <section id="deals-grid" data-product-card-frame>
            <div className="grid grid-cols-2 lg:grid-cols-4 items-start gap-3 sm:gap-4">
              {visible.map((p, i) => renderProduct(p, i))}
            </div>

            {/* PART 6: Highlight strip — biggest saving in this window */}
            {sortedProducts.length > 8 && (
              <HighlightStrip biggest={stats.biggest} totalDeals={stats.active} />
            )}

            {/* PART 8: Infinite scroll sentinel */}
            {visibleCount < sortedProducts.length && (
              <div ref={sentinelRef} className="mt-8 flex items-center justify-center py-6">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
                <span className="ml-2 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                  Loading more deals
                </span>
              </div>
            )}
            {visibleCount >= sortedProducts.length && sortedProducts.length > BATCH_SIZE && (
              <p className="mt-8 text-center text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                You've reached the end · {sortedProducts.length} deals shown
              </p>
            )}
          </section>
        ) : (
          <EmptyDeals />
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────  PART 2: Premium Hero  ───────────────────────── */

function PremiumHero({
  countdown,
  biggest,
  avgDiscount,
  active,
}: {
  countdown: { h: number; m: number; s: number };
  biggest: number;
  avgDiscount: number;
  active: number;
}) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease }}
      className="relative overflow-hidden rounded-2xl sm:rounded-[28px] bg-[#0a0f1c] border border-accent/15 px-5 py-7 sm:px-9 sm:py-11"
    >
      {/* Amber glow — no glassmorphism, per spec */}
      <div aria-hidden className="absolute inset-0 -z-10">
        <div
          className="absolute -top-24 -right-16 size-[380px] rounded-full opacity-30"
          style={{ background: "radial-gradient(circle, var(--color-accent) 0%, transparent 60%)", filter: "blur(60px)" }}
        />
        <div
          className="absolute -bottom-24 -left-16 size-[320px] rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, var(--color-accent) 0%, transparent 60%)", filter: "blur(70px)" }}
        />
      </div>

      <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
        {/* LEFT — headline + savings */}
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 border border-accent/30 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.25em] text-accent">
            <Flame className="size-3" /> Flash Deals · Live
          </span>
          <h1 className="mt-4 font-display font-bold leading-[1.02] text-[2.2rem] sm:text-[3.2rem] tracking-tight text-foreground">
            Flash <span className="text-accent">Deals</span>
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground max-w-md">
            Curated flash sales, refreshed daily. Grab them before the timer resets.
          </p>

          {/* Big savings number */}
          {biggest > 0 && (
            <div className="mt-6 flex items-baseline gap-3">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
                  Save up to
                </p>
                <p className="font-display font-bold text-[3.5rem] sm:text-[4.5rem] leading-none text-accent tabular-nums">
                  {biggest}
                  <span className="text-[1.5rem] sm:text-[2rem] ml-1">%</span>
                </p>
              </div>
              <div className="border-l border-accent/20 pl-4 self-center space-y-1.5">
                <MicroStat label="Active deals" value={active.toString()} />
                <MicroStat label="Avg discount" value={`${avgDiscount}%`} />
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — countdown */}
        <div className="lg:min-w-[300px]">
          <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground mb-3 flex items-center gap-1.5">
            <Clock className="size-3 text-accent" /> Ends in
          </p>
          <div className="flex items-center gap-2 font-mono tabular-nums">
            {[
              { v: pad(countdown.h), l: "HRS" },
              { v: pad(countdown.m), l: "MIN" },
              { v: pad(countdown.s), l: "SEC" },
            ].map((t, i) => (
              <div key={t.l} className="flex items-center gap-2">
                <div className="flex flex-col items-center">
                  <span className="grid place-items-center min-w-[64px] rounded-xl bg-black/60 ring-1 ring-accent/30 px-3 py-3 text-[2rem] font-bold text-accent leading-none">
                    {t.v}
                  </span>
                  <span className="mt-1.5 text-[9px] tracking-[0.25em] text-muted-foreground">
                    {t.l}
                  </span>
                </div>
                {i < 2 && <span className="text-accent/60 text-2xl -mt-4">:</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.header>
  );
}

function MicroStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground leading-none">
        {label}
      </p>
      <p className="text-sm font-semibold text-foreground tabular-nums mt-1">{value}</p>
    </div>
  );
}

/* ─────────────────────────  PART 3: Stats Row  ───────────────────────── */

function StatsRow({
  active,
  endingSoon,
  biggest,
  lowStock,
}: {
  active: number;
  endingSoon: number;
  biggest: number;
  lowStock: number;
}) {
  const cards = [
    { icon: Flame, label: "Active Deals", value: active, tone: "text-accent" },
    { icon: Clock, label: "Ending Soon", value: endingSoon, tone: "text-amber-400" },
    { icon: TrendingDown, label: "Biggest Off", value: `${biggest}%`, tone: "text-emerald-400" },
    { icon: Package, label: "Limited Stock", value: lowStock, tone: "text-rose-400" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-3 sm:px-4 sm:py-4"
        >
          <div className="flex items-center gap-2">
            <c.icon className={`size-4 ${c.tone}`} />
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
              {c.label}
            </p>
          </div>
          <p className="mt-1.5 text-xl sm:text-2xl font-display font-bold text-foreground tabular-nums">
            {c.value}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────  PART 4: Sticky Filter Bar  ───────────────────────── */

function StickyFilterBar({
  count,
  totalCount,
  activeCat,
  categories,
  onCategory,
  sort,
  onSort,
  rotationHours,
}: {
  count: number;
  totalCount: number;
  activeCat: string;
  categories: [string, number][];
  onCategory: (c: string) => void;
  sort: DealSort;
  onSort: (s: DealSort) => void;
  rotationHours: number;
}) {
  return (
    <div className="sticky top-[calc(var(--app-header-h,4.75rem)+4px)] z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 backdrop-blur-xl bg-background/80 border-y border-white/[0.06] scroll-mt-20">
      <div className="flex items-center justify-between gap-3 min-h-[44px]">
        <div className="min-w-0">
          <p className="text-[13px] sm:text-sm font-medium truncate">
            <span className="font-semibold text-foreground tabular-nums">{count}</span>{" "}
            <span className="text-muted-foreground">
              of {totalCount} deal{totalCount === 1 ? "" : "s"}
            </span>
          </p>
          <p className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-0.5">
            <span className="inline-block size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live · rotates every {rotationHours}h
          </p>
        </div>
        <label className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] pl-3 pr-2 py-2 text-[11px] font-medium min-h-[40px]">
          <ArrowDownWideNarrow className="size-3.5 text-accent" />
          <span className="sr-only">Sort</span>
          <select
            value={sort}
            onChange={(e) => onSort(e.target.value as DealSort)}
            className="bg-transparent text-[11px] font-mono uppercase tracking-widest focus:outline-none appearance-none pr-1"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Category chips */}
      {categories.length > 0 && (
        <div className="mt-2 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide">
          <CatChip
            label="All"
            count={totalCount}
            active={activeCat === "all"}
            onClick={() => onCategory("all")}
            icon={<LayoutGrid className="size-3" />}
          />
          {categories.map(([cat, n]) => (
            <CatChip
              key={cat}
              label={cat}
              count={n}
              active={activeCat === cat}
              onClick={() => onCategory(cat)}
              icon={<Tag className="size-3" />}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CatChip({
  label,
  count,
  active,
  onClick,
  icon,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors min-h-[36px] ${
        active
          ? "bg-accent text-accent-foreground border border-accent"
          : "bg-white/[0.04] border border-white/10 text-foreground/80 hover:border-accent/40 hover:text-accent"
      }`}
    >
      {icon}
      <span className="capitalize">{label}</span>
      <span
        className={`text-[10px] tabular-nums ${
          active ? "text-accent-foreground/70" : "text-muted-foreground"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

/* ─────────────────────────  PART 6: Highlight Strip  ───────────────────────── */

function HighlightStrip({ biggest, totalDeals }: { biggest: number; totalDeals: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.5, ease }}
      className="my-8 relative overflow-hidden rounded-2xl border border-accent/20 bg-gradient-to-r from-accent/[0.08] via-transparent to-transparent px-5 py-6 sm:px-8 sm:py-8"
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-accent">
            <Sparkles className="inline size-3 mr-1" /> Editorial pick
          </p>
          <h2 className="mt-2 font-display font-bold text-2xl sm:text-3xl text-foreground">
            Today's Biggest Savings
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {totalDeals} live deals · up to {biggest}% off — curated by our team.
          </p>
        </div>
        <a
          href="#deals-grid"
          className="inline-flex items-center gap-1.5 rounded-full bg-accent text-accent-foreground px-5 py-2.5 text-sm font-semibold"
        >
          <Flame className="size-4" /> Browse all
        </a>
      </div>
    </motion.div>
  );
}

/* ─────────────────────────  PART 7: Empty State  ───────────────────────── */

function EmptyDeals() {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-14 sm:py-20 text-center">
      <div className="inline-flex size-14 items-center justify-center rounded-full bg-accent/10 border border-accent/20 text-accent mb-5">
        <Flame className="size-6" />
      </div>
      <h2 className="font-display font-bold text-xl sm:text-2xl">
        No Flash Deals right now
      </h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
        New offers arrive every day. Check back soon — or browse what's trending in the meantime.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
        <Link
          to="/products/best-sellers"
          className="inline-flex items-center gap-1.5 rounded-full bg-accent text-accent-foreground px-5 py-2.5 text-sm font-semibold"
        >
          <Star className="size-4" /> Best Sellers
          <ArrowRight className="size-4" />
        </Link>
        <Link
          to="/products/trending"
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-medium hover:border-accent/40 hover:text-accent"
        >
          <Zap className="size-4" /> Trending
        </Link>
      </div>
    </div>
  );
}
