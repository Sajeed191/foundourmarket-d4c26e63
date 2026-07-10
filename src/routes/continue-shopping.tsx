import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ShoppingBag, Search, Sparkles, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProducts } from "@/lib/use-products";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";
import { useCompare } from "@/hooks/use-compare";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useRegion } from "@/lib/region";
import { recordEvent } from "@/lib/personalization";
import { buildVisibleMap } from "@/lib/product-availability";
import { getViewedPrices, comparePrice, type PriceChange } from "@/lib/viewed-prices";
import { ProductCard } from "@/components/site/ProductCard";
import { ProductSkeletonGrid } from "@/components/site/ProductSkeleton";
import { type Product } from "@/lib/products";

export const Route = createFileRoute("/continue-shopping")({
  head: () => ({
    meta: [
      { title: "Continue Shopping — FoundOurMarket™" },
      { name: "description", content: "Pick up where you left off. Products from your recent views, cart, wishlist and checkout — all in one place." },
      { property: "og:title", content: "Continue Shopping — FoundOurMarket™" },
      { property: "og:description", content: "Pick up where you left off — your personalized shopping activity." },
    ],
  }),
  component: ContinueShoppingPage,
});

/** Activity source, highest priority first. */
type ActivityKind = "checkout" | "cart" | "wishlist" | "viewed";
const PRIORITY: Record<ActivityKind, number> = { checkout: 0, cart: 1, wishlist: 2, viewed: 3 };

const DAY = 24 * 60 * 60 * 1000;
const EXPIRY_MS: Record<ActivityKind, number> = {
  viewed: 90 * DAY,
  cart: 60 * DAY,
  checkout: 30 * DAY,
  wishlist: Infinity,
};

type Entry = {
  product: Product;
  kind: ActivityKind;
  at: number | null;
  views: number;
  purchased: boolean;
  compared: boolean;
  inCart: boolean;
  // Real price-change signal derived from the price the user actually saw.
  priceChange: PriceChange;
  savings: number;
  pricePercent: number;
  lowStock: boolean;
};

type FilterKey = "recent" | "week" | "stock" | "drop";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "recent", label: "Recently Viewed" },
  { key: "week", label: "Last 7 Days" },
  { key: "stock", label: "In Stock" },
  { key: "drop", label: "Price Drop" },
];

const PAGE_SIZE = 12;

/** Human relative time: "2 hours ago", "Yesterday". */
function relTime(ts: number | null): string {
  if (!ts) return "recently";
  const diff = Date.now() - ts;
  if (diff < 0) return "just now";
  const min = 60 * 1000, hour = 60 * min;
  if (diff < min) return "just now";
  if (diff < hour) { const m = Math.round(diff / min); return `${m} minute${m > 1 ? "s" : ""} ago`; }
  if (diff < DAY) { const h = Math.round(diff / hour); return `${h} hour${h > 1 ? "s" : ""} ago`; }
  const days = Math.round(diff / DAY);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  const weeks = Math.round(days / 7);
  return `${weeks} weeks ago`;
}

/** Currency symbol for the active market. */
function money(n: number, market: string): string {
  const rounded = Math.round(n);
  return market === "india" ? `₹${rounded.toLocaleString("en-IN")}` : `$${rounded.toLocaleString("en-US")}`;
}

type LabelTone = "drop" | "increase" | "neutral";

/**
 * Exactly ONE context label per product, chosen by strict priority:
 * 1. Price Dropped  2. Price Increased  3. Back in Stock  4. Low Stock
 * 5. In Cart  6. Recently Viewed / Viewed Today / Yesterday
 *
 * A price label is only ever produced when a real, stored viewed price differs
 * from the current price — never globally.
 */
function contextLabel(e: Entry, market: string): { text: string; tone: LabelTone } {
  if (e.priceChange === "drop") {
    const extra = e.savings > 0 ? ` · Save ${money(e.savings, market)}` : e.pricePercent > 0 ? ` · ${e.pricePercent}% lower` : "";
    return { text: `⬇ Price Dropped${extra}`, tone: "drop" };
  }
  if (e.priceChange === "increase") {
    return { text: "⬆ Price Increased", tone: "increase" };
  }
  if (!e.product.inStock) {
    return { text: "Currently Unavailable", tone: "neutral" };
  }
  if (e.lowStock) {
    return { text: "Low Stock", tone: "neutral" };
  }
  if (e.inCart) return { text: "In Your Cart", tone: "neutral" };
  if (e.kind === "wishlist") return { text: "Saved for Later", tone: "neutral" };
  // Recency-based fallback.
  if (e.at != null) {
    const diff = Date.now() - e.at;
    if (diff < DAY && new Date(e.at).getDate() === new Date().getDate()) return { text: "Viewed Today", tone: "neutral" };
    if (diff < 2 * DAY) return { text: "Viewed Yesterday", tone: "neutral" };
  }
  return { text: `Viewed ${relTime(e.at)}`, tone: "neutral" };
}

function ContinueShoppingPage() {
  const { user, loading: authLoading } = useAuth();
  const { products, loading: productsLoading } = useProducts();
  const { market, priceOf } = useRegion();
  const { items: cartItems } = useCart();
  const { slugs: wishSlugs } = useWishlist();
  const { slugs: compareSlugs } = useCompare();
  const { slugs: recentSlugs, entries: recentEntries } = useRecentlyViewed();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("recent");
  // Restore paging depth from the previous visit so returning from a product
  // does not rebuild the list from the first page.
  const [limit, setLimit] = useState(() => {
    if (typeof window === "undefined") return PAGE_SIZE;
    const saved = Number(sessionStorage.getItem("fom_cs_limit"));
    return Number.isFinite(saved) && saved >= PAGE_SIZE ? saved : PAGE_SIZE;
  });

  const [eventAt, setEventAt] = useState<Map<string, number>>(new Map());
  const [checkoutAt, setCheckoutAt] = useState<Map<string, number>>(new Map());
  const [cartAt, setCartAt] = useState<Map<string, number>>(new Map());
  const [viewedAt, setViewedAt] = useState<Map<string, number>>(new Map());
  const [viewCounts, setViewCounts] = useState<Map<string, number>>(new Map());
  const [purchasedSlugs, setPurchasedSlugs] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setEventAt(new Map());
      setCheckoutAt(new Map());
      setCartAt(new Map());
      setViewedAt(new Map());
      setViewCounts(new Map());
      setPurchasedSlugs(new Set());
      return;
    }
    void (async () => {
      const [events, delivered] = await Promise.all([
        supabase
          .from("recommendation_events")
          .select("product_slug, event_type, created_at")
          .eq("user_id", user.id)
          .not("product_slug", "is", null)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("orders")
          .select("id, order_items(product_slug)")
          .eq("user_id", user.id)
          .eq("fulfillment_status", "delivered"),
      ]);
      if (cancelled) return;

      const at = new Map<string, number>();
      const checkout = new Map<string, number>();
      const cart = new Map<string, number>();
      const viewed = new Map<string, number>();
      const counts = new Map<string, number>();
      for (const r of (events.data ?? []) as { product_slug: string; event_type: string; created_at: string }[]) {
        const t = new Date(r.created_at).getTime();
        if (!at.has(r.product_slug)) at.set(r.product_slug, t);
        if (r.event_type === "begin_checkout" && !checkout.has(r.product_slug)) checkout.set(r.product_slug, t);
        if (r.event_type === "add_to_cart" && !cart.has(r.product_slug)) cart.set(r.product_slug, t);
        if (r.event_type === "view") {
          if (!viewed.has(r.product_slug)) viewed.set(r.product_slug, t);
          counts.set(r.product_slug, (counts.get(r.product_slug) ?? 0) + 1);
        }
      }

      const purchased = new Set<string>();
      for (const o of (delivered.data ?? []) as { order_items: { product_slug: string | null }[] | null }[]) {
        for (const it of o.order_items ?? []) if (it.product_slug) purchased.add(it.product_slug);
      }

      setEventAt(at);
      setCheckoutAt(checkout);
      setCartAt(cart);
      setViewedAt(viewed);
      setViewCounts(counts);
      setPurchasedSlugs(purchased);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const compareSet = useMemo(() => new Set(compareSlugs), [compareSlugs]);

  // Build one entry per product, keeping ONLY the highest-priority, non-expired
  // activity. Only active/visible products appear. Purchased items are kept but
  // gradually sink to the bottom.
  const entries = useMemo<Entry[]>(() => {
    const map = buildVisibleMap(products, market);
    const localViews = new Map<string, number>();
    for (const e of recentEntries) localViews.set(e.slug, e.at);
    const best = new Map<string, Entry>();
    const cartSet = new Set(cartItems.map((i) => i.slug));
    // Prices the user actually SAW — the only valid baseline for a price label.
    const viewedPrices = getViewedPrices();

    const tsFor = (slug: string, kind: ActivityKind): number | null => {
      if (kind === "checkout") return checkoutAt.get(slug) ?? eventAt.get(slug) ?? null;
      if (kind === "cart") return cartAt.get(slug) ?? eventAt.get(slug) ?? null;
      if (kind === "viewed") return viewedAt.get(slug) ?? localViews.get(slug) ?? eventAt.get(slug) ?? null;
      return eventAt.get(slug) ?? null;
    };

    const consider = (slug: string, kind: ActivityKind) => {
      const product = map.get(slug);
      if (!product) return;
      const at = tsFor(slug, kind);
      if (at != null && Date.now() - at > EXPIRY_MS[kind]) return;
      const existing = best.get(slug);
      if (existing && PRIORITY[existing.kind] <= PRIORITY[kind]) return;
      // Real price change: compare the CURRENT selling price against the price
      // the user actually saw for this exact product in this market.
      const cmp = comparePrice(viewedPrices[slug], priceOf(product), market);
      const lowStock =
        product.inStock && product.stockQuantity > 0 && product.stockQuantity <= (product.lowStockThreshold || 5);
      best.set(slug, {
        product,
        kind,
        at,
        views: viewCounts.get(slug) ?? 0,
        purchased: purchasedSlugs.has(slug),
        compared: compareSet.has(slug),
        inCart: cartSet.has(slug),
        priceChange: cmp.change,
        savings: cmp.savings,
        pricePercent: cmp.percent,
        lowStock,
      });
    };

    for (const slug of checkoutAt.keys()) consider(slug, "checkout");
    for (const i of cartItems) consider(i.slug, "cart");
    for (const slug of wishSlugs) consider(slug, "wishlist");
    for (const slug of recentSlugs) consider(slug, "viewed");
    return [...best.values()];
  }, [products, market, checkoutAt, cartItems, wishSlugs, recentSlugs, recentEntries, eventAt, cartAt, viewedAt, viewCounts, purchasedSlugs, compareSet, priceOf]);

  // Intelligent "Continue Shopping" score combining multiple signals so the
  // most relevant products always surface first. Purchased items are heavily
  // demoted (sink to the bottom) but not removed.
  const scoreOf = (e: Entry): number => {
    let s = 0;
    const age = e.at != null ? Date.now() - e.at : Infinity;
    if (age <= 60 * 60 * 1000) s += 1000;            // viewed within the last hour
    else if (age <= DAY) s += 400;                    // viewed today
    else if (age <= 7 * DAY) s += 150;                // viewed this week
    if (e.kind === "cart" && age <= 7 * DAY) s += 600; // recently added to cart
    else if (e.kind === "checkout") s += 500;
    s += Math.min(e.views, 10) * 40;                  // repeat visits
    if (e.kind === "wishlist") s += 200;              // saved for later
    if (e.priceChange === "drop") s += 350;           // real price drop vs viewed price
    if (e.product.inStock) s += 120;                  // back / in stock
    // gentle recency tiebreaker (newer = slightly higher)
    if (e.at != null) s += Math.max(0, 100 - age / DAY);
    if (e.purchased) s -= 5000;                       // sink purchased to bottom
    return s;
  };

  const ordered = useMemo(() => {
    return [...entries].sort((a, b) => {
      const diff = scoreOf(b) - scoreOf(a);
      if (diff !== 0) return diff;
      return (b.at ?? 0) - (a.at ?? 0);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ordered.filter((e) => {
      if (q && !(e.product.name.toLowerCase().includes(q) || (e.product.tagline ?? "").toLowerCase().includes(q))) return false;
      if (filter === "week") return e.at != null && Date.now() - e.at <= 7 * DAY;
      if (filter === "stock") return e.product.inStock;
      if (filter === "drop") return e.priceChange === "drop";
      return true; // recent
    });
  }, [ordered, query, filter]);

  // Reset paging (and any saved scroll) when the user changes search/filter —
  // that is an intentional new query, not a return visit.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    setLimit(PAGE_SIZE);
    if (typeof window !== "undefined") sessionStorage.removeItem("fom_cs_scroll");
  }, [query, filter]);

  const paged = useMemo(() => filtered.slice(0, limit), [filtered, limit]);

  // Persist paging depth for return-visit restoration.
  useEffect(() => {
    if (typeof window !== "undefined") sessionStorage.setItem("fom_cs_limit", String(limit));
  }, [limit]);

  // Infinite scroll sentinel — prefetch well before the bottom for continuous scroll.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((ents) => {
      if (ents[0]?.isIntersecting) setLimit((l) => (l < filtered.length ? l + PAGE_SIZE : l));
    }, { rootMargin: "1200px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length]);

  // Scroll restoration: save position continuously, restore once the saved
  // page depth has rendered so returning from a product feels native.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onScroll = () => sessionStorage.setItem("fom_cs_scroll", String(window.scrollY));
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || typeof window === "undefined" || paged.length === 0) return;
    const y = Number(sessionStorage.getItem("fom_cs_scroll"));
    if (Number.isFinite(y) && y > 0) {
      restored.current = true;
      requestAnimationFrame(() => window.scrollTo(0, y));
    }
  }, [paged.length]);

  const loading = authLoading || productsLoading;

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 mobile-page-clearance md:pb-16">
        <div className="h-8 w-56 rounded bg-white/[0.05] animate-pulse mb-8" />
        <ProductSkeletonGrid count={8} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 mobile-page-clearance md:pb-16">
      {/* Header — simple, no banner */}
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-semibold">Continue Shopping</h1>
          <p className="text-sm text-muted-foreground mt-1">Pick up where you left off.</p>
        </div>
        {ordered.length > 0 && (
          <span className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold tabular-nums text-muted-foreground">
            {ordered.length} {ordered.length === 1 ? "Product" : "Products"}
          </span>
        )}
      </div>

      {/* Empty state */}
      {ordered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="card-premium rounded-2xl p-12 text-center mt-4"
        >
          <div className="size-16 mx-auto mb-5 grid place-items-center rounded-full bg-accent/15 border border-accent/30 text-accent">
            <ShoppingBag className="size-6" />
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
              <ShoppingBag className="size-3.5" /> Browse Products
            </Link>
            <Link
              to="/products/trending"
              className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-3 text-[11px] uppercase tracking-widest font-bold hover:border-accent/40 transition-colors"
            >
              <TrendingUp className="size-3.5" /> Trending Products
            </Link>
          </div>
        </motion.div>
      ) : (
        <>
          {/* Controls — search + filters */}
          <div className="flex flex-col gap-3 mb-6">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search recently viewed products"
                className="w-full rounded-full border border-border bg-card py-2.5 pl-11 pr-4 text-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-accent/50 focus:ring-2 focus:ring-accent/30"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => {
                const active = filter === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
                      active ? "bg-accent text-accent-foreground shadow-[var(--shadow-ember)]" : "border border-border hover:border-accent/40 hover:text-accent"
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
              No products match your search or filter.
            </div>
          ) : (
            <>
              <div data-product-grid className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
                {paged.map((e) => {
                  const label = contextLabel(e, market);
                  const toneClass =
                    label.tone === "drop"
                      ? "text-emerald-400"
                      : label.tone === "increase"
                        ? "text-accent"
                        : "text-muted-foreground";
                  return (
                    <div
                      key={e.product.id ?? e.product.slug}
                      data-product-card-frame
                      className="flex flex-col"
                      onClickCapture={() => { void recordEvent({ type: "view", productSlug: e.product.slug }); }}
                    >
                      <ProductCard product={e.product} />
                      <p className={`mt-1.5 px-1 font-mono text-[10px] uppercase tracking-wider truncate ${toneClass}`}>
                        {label.text}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Infinite scroll sentinel + skeleton */}
              {limit < filtered.length && (
                <div ref={sentinelRef} className="mt-6">
                  <ProductSkeletonGrid count={4} />
                </div>
              )}

              <p className="mt-8 text-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center justify-center gap-2">
                <Sparkles className="size-3" /> Personalized for you
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
