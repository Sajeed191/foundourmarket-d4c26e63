import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import { motion } from "framer-motion";
import {
  ShoppingBag,
  Search,
  Sparkles,
  TrendingUp,
  ShoppingCart,
  Heart,
  ArrowDown,
  ArrowUp,
  PackageCheck,
  AlertTriangle,
  Clock,
  CalendarDays,
  MoreHorizontal,
  Trash2,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { track } from "@/lib/analytics";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProducts } from "@/lib/use-products";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";
import { useCompare } from "@/hooks/use-compare";
import { useRecentlyViewed, type RecentlyViewedEntry } from "@/hooks/use-recently-viewed";
import { useRegion } from "@/lib/region";
import { recordEvent } from "@/lib/personalization";
import { buildVisibleMap } from "@/lib/product-availability";
import { getViewedPrices, comparePrice, type PriceChange } from "@/lib/viewed-prices";
import { ProductCard } from "@/components/site/ProductCard";
import { ProductSkeletonGrid } from "@/components/site/ProductSkeleton";
import { type Product } from "@/lib/products";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

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
  inWishlist: boolean;
  // Real price-change signal derived from the price the user actually saw.
  priceChange: PriceChange;
  savings: number;
  pricePercent: number;
  lowStock: boolean;
  backInStock: boolean;
};

type FilterKey = "recent" | "week" | "stock" | "drop";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "recent", label: "Recently Viewed" },
  { key: "week", label: "Last 7 Days" },
  { key: "stock", label: "In Stock" },
  { key: "drop", label: "Price Drop" },
];

const PAGE_SIZE = 12;



/** Currency symbol for the active market. */
function money(n: number, market: string): string {
  const rounded = Math.round(n);
  return market === "india" ? `₹${rounded.toLocaleString("en-IN")}` : `$${rounded.toLocaleString("en-US")}`;
}

/**
 * The single primary activity shown below each card. Minimal, left-aligned,
 * information — never a marketing badge. Each activity has its own icon and a
 * muted, semantically-tinted color.
 */
type Status = {
  key: string;
  text: string;
  Icon: ComponentType<{ className?: string }>;
  /** Icon + text color class. */
  fg: string;
};

/** "Today" / "Yesterday" / "" for a timestamp — used for cart/wishlist context. */
function dayContext(at: number | null): string {
  if (at == null) return "";
  const start = new Date(); start.setHours(0, 0, 0, 0);
  if (at >= start.getTime()) return "Today";
  if (at >= start.getTime() - DAY) return "Yesterday";
  return "";
}

/** Human "Viewed …" phrasing with minute-level granularity. */
function viewedPhrase(at: number | null): { text: string; Icon: ComponentType<{ className?: string }> } {
  if (at == null) return { text: "Viewed Recently", Icon: Clock };
  const d = Date.now() - at;
  if (d < 60 * 1000) return { text: "Viewed Just Now", Icon: Clock };
  if (d < 60 * 60 * 1000) {
    const m = Math.max(1, Math.round(d / 60000));
    return { text: `Viewed ${m} minute${m > 1 ? "s" : ""} ago`, Icon: Clock };
  }
  const start = new Date(); start.setHours(0, 0, 0, 0);
  if (at >= start.getTime()) {
    const h = Math.round(d / (60 * 60 * 1000));
    return { text: h >= 1 ? `Viewed ${h} hour${h > 1 ? "s" : ""} ago` : "Viewed Today", Icon: Clock };
  }
  if (at >= start.getTime() - DAY) return { text: "Viewed Yesterday", Icon: CalendarDays };
  return { text: "Viewed This Week", Icon: CalendarDays };
}

/**
 * Exactly ONE primary activity per product, chosen by strict priority:
 *   1. Added to Cart   2. Saved to Wishlist   3. Price Dropped / Increased
 *   4. Back in Stock   5. Low Stock           6-8. Viewed (recency)
 *
 * A price label is only ever produced when a real, stored viewed price differs
 * from the current price — never globally.
 */
function statusOf(e: Entry, market: string): Status {
  // 1. Added to Cart — cart identity always wins.
  if (e.inCart) {
    const d = dayContext(e.at);
    return { key: "cart", text: d ? `Added to Cart ${d}` : "In Your Cart", Icon: ShoppingCart, fg: "text-accent" };
  }
  // 2. Saved to Wishlist.
  if (e.inWishlist) {
    const d = dayContext(e.at);
    return { key: "wishlist", text: d ? `Saved ${d}` : "Saved for Later", Icon: Heart, fg: "text-purple-400" };
  }
  // 3. Real price change vs the price the user actually saw.
  if (e.priceChange === "drop") {
    const extra = e.savings > 0 ? ` · Save ${money(e.savings, market)}` : e.pricePercent > 0 ? ` · ${e.pricePercent}% off` : "";
    return { key: "drop", text: `Price Dropped${extra}`, Icon: ArrowDown, fg: "text-emerald-400" };
  }
  if (e.priceChange === "increase") {
    return { key: "increase", text: "Price Increased", Icon: ArrowUp, fg: "text-rose-400" };
  }
  // 4. Back in Stock — was out of stock when last viewed, in stock now.
  if (e.backInStock) {
    return { key: "back", text: "Back in Stock", Icon: PackageCheck, fg: "text-sky-400" };
  }
  // 5. Low Stock.
  if (e.lowStock) {
    return { key: "low", text: `Only ${e.product.stockQuantity} Left`, Icon: AlertTriangle, fg: "text-amber-400" };
  }
  // 6-8. Recency-based, neutral.
  const v = viewedPhrase(e.at);
  return { key: "viewed", text: v.text, Icon: v.Icon, fg: "text-muted-foreground" };
}

function ContinueShoppingPage() {
  const { user, loading: authLoading } = useAuth();
  const { products, loading: productsLoading } = useProducts();
  const { market, priceOf } = useRegion();
  const { items: cartItems } = useCart();
  const { slugs: wishSlugs } = useWishlist();
  const { slugs: compareSlugs } = useCompare();
  const { entries: recentEntries, remove, clear, clearSince, restore, loading: recentLoading } = useRecentlyViewed();

  // Confirmation dialog for the destructive "Clear all history" action.
  const [confirmClear, setConfirmClear] = useState(false);
  // Controlled menu so we can keep it open for the spinner, then close on done.
  const [menuOpen, setMenuOpen] = useState(false);
  // Which history action is currently persisting. Drives the inline spinner,
  // disables the whole menu, and blocks duplicate/repeated taps.
  const [busy, setBusy] = useState<null | "today" | "week" | "all">(null);
  // Per-product removals in flight — prevents duplicate delete requests.
  const removing = useRef<Set<string>>(new Set());

  const ERROR_MSG = "Couldn't update your Continue Shopping history.";

  // Success toast + optional Undo for a reversible removal.
  const notify = (removed: RecentlyViewedEntry[], message: string, undoable: boolean) => {
    toast.success(message, {
      duration: 6000,
      action:
        undoable && removed.length > 0
          ? {
              label: "Undo",
              onClick: () => {
                void track("history_restore", { value: removed.length });
                void restore(removed);
              },
            }
          : undefined,
    });
  };

  // Timezone-aware boundaries using the user's local clock.
  const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

  // Live counts drive both the disabled state and the destructive operations.
  const todayCount = useMemo(
    () => recentEntries.filter((e) => e.at >= startOfToday()).length,
    [recentEntries],
  );
  const weekCount = useMemo(
    () => recentEntries.filter((e) => e.at >= Date.now() - 7 * DAY).length,
    [recentEntries],
  );
  const historyCount = recentEntries.length;

  const handleClearAll = async () => {
    if (busy) return;
    setConfirmClear(false);
    setBusy("all");
    void track("history_clear_all", { value: historyCount });
    try {
      const previousLimit = limit;
      const mutation = clear();
      resetVisibleHistoryState();
      const { ok } = await mutation;
      if (!ok) setLimit(previousLimit);
      if (!ok) { toast.error(ERROR_MSG); return; }
      toast.success("Continue Shopping history cleared.");
    } finally {
      setBusy(null);
    }
  };
  const handleClearToday = async () => {
    if (busy) return;
    setBusy("today");
    void track("history_clear_today", { value: todayCount });
    try {
      const previousLimit = limit;
      const mutation = clearSince(startOfToday());
      resetVisibleHistoryState();
      const { removed, ok } = await mutation;
      if (!ok) setLimit(previousLimit);
      if (!ok) { toast.error(ERROR_MSG); return; }
      notify(removed, "Viewed today cleared.", true);
    } finally {
      setBusy(null);
      setMenuOpen(false); // close immediately after the action resolves
    }
  };
  const handleClearWeek = async () => {
    if (busy) return;
    setBusy("week");
    void track("history_clear_last7", { value: weekCount });
    try {
      const previousLimit = limit;
      const mutation = clearSince(Date.now() - 7 * DAY);
      resetVisibleHistoryState();
      const { removed, ok } = await mutation;
      if (!ok) setLimit(previousLimit);
      if (!ok) { toast.error(ERROR_MSG); return; }
      notify(removed, "Last 7 days history cleared.", true);
    } finally {
      setBusy(null);
      setMenuOpen(false); // close immediately after the action resolves
    }
  };
  const handleRemoveOne = async (slug: string) => {
    if (removing.current.has(slug)) return; // no duplicate requests
    removing.current.add(slug);
    void track("history_remove_product", { productSlug: slug });
    try {
      const previousLimit = limit;
      const mutation = remove(slug);
      resetVisibleHistoryState();
      const { removed, ok } = await mutation;
      if (!ok) setLimit(previousLimit);
      if (!ok) { toast.error(ERROR_MSG); return; }
      notify(removed, "Removed from Continue Shopping.", true);
    } finally {
      removing.current.delete(slug);
    }
  };


  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("recent");
  // Restore paging depth from the previous visit so returning from a product
  // does not rebuild the list from the first page.
  const [limit, setLimit] = useState(() => {
    if (typeof window === "undefined") return PAGE_SIZE;
    const saved = Number(sessionStorage.getItem("fom_cs_limit"));
    return Number.isFinite(saved) && saved >= PAGE_SIZE ? saved : PAGE_SIZE;
  });

  function resetVisibleHistoryState() {
    setLimit(PAGE_SIZE);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("fom_cs_limit", String(PAGE_SIZE));
      sessionStorage.removeItem("fom_cs_scroll");
    }
  }

  const [viewCounts, setViewCounts] = useState<Map<string, number>>(new Map());
  const [purchasedSlugs, setPurchasedSlugs] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setViewCounts(new Map());
      setPurchasedSlugs(new Set());
      return;
    }
    void (async () => {
      const [events, delivered] = await Promise.all([
        supabase
          .from("recommendation_events")
          .select("product_slug")
          .eq("user_id", user.id)
          .eq("event_type", "view")
          .not("product_slug", "is", null)
          .limit(500),
        supabase
          .from("orders")
          .select("id, order_items(product_slug)")
          .eq("user_id", user.id)
          .eq("fulfillment_status", "delivered"),
      ]);
      if (cancelled) return;

      const counts = new Map<string, number>();
      for (const r of (events.data ?? []) as { product_slug: string }[]) {
        counts.set(r.product_slug, (counts.get(r.product_slug) ?? 0) + 1);
      }

      const purchased = new Set<string>();
      for (const o of (delivered.data ?? []) as { order_items: { product_slug: string | null }[] | null }[]) {
        for (const it of o.order_items ?? []) if (it.product_slug) purchased.add(it.product_slug);
      }

      setViewCounts(counts);
      setPurchasedSlugs(purchased);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const compareSet = useMemo(() => new Set(compareSlugs), [compareSlugs]);
  const wishlistSet = useMemo(() => new Set(wishSlugs), [wishSlugs]);

  // Build one entry per product, keeping ONLY the highest-priority, non-expired
  // activity. Only active/visible products appear. Purchased items are kept but
  // gradually sink to the bottom.
  const entries = useMemo<Entry[]>(() => {
    const map = buildVisibleMap(products, market);
    const best = new Map<string, Entry>();
    const cartSet = new Set(cartItems.map((i) => i.slug));
    // Prices the user actually SAW — the only valid baseline for a price label.
    const viewedPrices = getViewedPrices();

    const consider = (entry: RecentlyViewedEntry) => {
      const slug = entry.slug;
      const product = map.get(slug);
      if (!product) return;
      const at = entry.at;
      if (Date.now() - at > EXPIRY_MS.viewed) return;
      const existing = best.get(slug);
      if (existing && PRIORITY[existing.kind] <= PRIORITY.viewed) return;
      // Real price change: compare the CURRENT selling price against the price
      // the user actually saw for this exact product in this market.
      const cmp = comparePrice(viewedPrices[slug], priceOf(product), market);
      const lowStock =
        product.inStock && product.stockQuantity > 0 && product.stockQuantity <= (product.lowStockThreshold || 5);
      // Back in stock: out of stock when the user last saw it, in stock now.
      const backInStock = product.inStock && viewedPrices[slug]?.inStock === false;
      best.set(slug, {
        product,
        kind: "viewed",
        at,
        views: viewCounts.get(slug) ?? 0,
        purchased: purchasedSlugs.has(slug),
        compared: compareSet.has(slug),
        inCart: cartSet.has(slug),
        inWishlist: wishlistSet.has(slug),
        priceChange: cmp.change,
        savings: cmp.savings,
        pricePercent: cmp.percent,
        lowStock,
        backInStock,
      });
    };

    for (const entry of recentEntries) consider(entry);
    return [...best.values()];
  }, [products, market, cartItems, recentEntries, viewCounts, purchasedSlugs, compareSet, wishlistSet, priceOf]);

  // Intelligent "Continue Shopping" score combining multiple signals so the
  // most relevant products always surface first. Purchased items are heavily
  // demoted (sink to the bottom) but not removed.
  const scoreOf = (e: Entry): number => {
    let s = 0;
    const age = e.at != null ? Date.now() - e.at : Infinity;
    if (age <= 60 * 60 * 1000) s += 1000;            // viewed within the last hour
    else if (age <= DAY) s += 400;                    // viewed today
    else if (age <= 7 * DAY) s += 150;                // viewed this week
    if (e.inCart && age <= 7 * DAY) s += 600;           // currently in cart
    else if (e.kind === "checkout") s += 500;
    s += Math.min(e.views, 10) * 40;                  // repeat visits
    if (e.inWishlist) s += 200;                        // saved for later
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

  const loading = authLoading || productsLoading || recentLoading;

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
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold tabular-nums text-muted-foreground">
              {ordered.length} {ordered.length === 1 ? "Product" : "Products"}
            </span>
            <DropdownMenu open={menuOpen} onOpenChange={(o) => { if (!busy) setMenuOpen(o); }}>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Manage Continue Shopping history"
                  disabled={busy !== null}
                  className="grid size-11 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-60"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Manage history</DropdownMenuLabel>
                <DropdownMenuItem
                  disabled={busy !== null || todayCount === 0}
                  onSelect={(e) => { e.preventDefault(); void handleClearToday(); }}
                  className="min-h-11"
                >
                  {busy === "today" ? <Loader2 className="size-4 animate-spin" /> : <Clock className="size-4" />} Clear viewed today
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={busy !== null || weekCount === 0}
                  onSelect={(e) => { e.preventDefault(); void handleClearWeek(); }}
                  className="min-h-11"
                >
                  {busy === "week" ? <Loader2 className="size-4 animate-spin" /> : <CalendarDays className="size-4" />} Clear last 7 days
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={busy !== null || historyCount === 0}
                  onSelect={() => setConfirmClear(true)}
                  className="min-h-11 text-rose-400 focus:text-rose-400"
                >
                  <Trash2 className="size-4" /> Clear all history
                </DropdownMenuItem>
              </DropdownMenuContent>

            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Confirmation before clearing everything */}
      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Continue Shopping History?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove all your recently viewed products. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleClearAll()}
              className="bg-rose-500 text-white hover:bg-rose-600"
            >
              Clear History
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                  const status = statusOf(e, market);
                  const StatusIcon = status.Icon;
                  return (
                    <div
                      key={e.product.id ?? e.product.slug}
                      data-product-card-frame
                      className="group/frame relative flex flex-col"
                      onClickCapture={() => { void recordEvent({ type: "view", productSlug: e.product.slug }); }}
                    >
                      {/* Remove this product from Continue Shopping history. */}
                      <button
                        aria-label={`Remove ${e.product.name} from Continue Shopping`}
                        onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); void handleRemoveOne(e.product.slug); }}
                        className="absolute right-2 top-2 z-20 grid size-7 place-items-center rounded-full border border-white/10 bg-black/55 text-white/80 opacity-0 backdrop-blur-sm transition-all hover:text-accent focus:opacity-100 group-hover/frame:opacity-100"
                      >
                        <X className="size-3.5" />
                      </button>
                      {/* Marketing badges hidden here — this is a personal surface. */}
                      <ProductCard product={e.product} hideBadges />
                      {/* One minimal activity line — information, not a badge. */}
                      <div className={`mt-2 flex max-w-full items-center gap-1.5 self-start ${status.fg}`}>
                        <StatusIcon className="size-3.5 shrink-0" />
                        <span className="truncate text-[12px] sm:text-[13px] font-medium">{status.text}</span>
                      </div>
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
