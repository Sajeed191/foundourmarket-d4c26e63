import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Heart,
  ShoppingBag,
  Trash2,
  CheckSquare,
  X,
  TrendingDown,
  PackageX,
  Truck,
  Wallet,
  Layers,
  Share2,
  AlertTriangle,
  Star,
  Eye,
  Percent,
  Tag,
  Sparkles,
  Flame,
  Box,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useWishlist } from "@/lib/wishlist";
import { useProducts } from "@/lib/use-products";
import { useCart } from "@/lib/cart";
import { useRegion } from "@/lib/region";
import { supabase } from "@/integrations/supabase/client";
import { type Product, discountPercent } from "@/lib/products";
import { WishlistCard } from "@/components/site/WishlistCard";
import { WishlistRecommendations } from "@/components/site/WishlistRecommendations";
import { ProductSkeletonGrid } from "@/components/site/ProductSkeleton";
import { StarRating } from "@/components/site/StarRating";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export const Route = createFileRoute("/wishlist")({
  head: () => ({ meta: [{ title: "Wishlist — FoundOurMarket™" }] }),
  component: WishlistPage,
});

type FilterKey =
  | "all"
  | "in-stock"
  | "price-drops"
  | "free-shipping"
  | "out-of-stock"
  | "low-stock"
  | "recently-added"
  | "new-arrivals"
  | "highest-discount"
  | "lowest-price"
  | "highest-price"
  | "best-rated"
  | "most-viewed";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "in-stock", label: "In Stock" },
  { key: "price-drops", label: "Price Drops" },
  { key: "free-shipping", label: "Free Shipping" },
  { key: "recently-added", label: "Recently Added" },
  { key: "highest-discount", label: "Highest Discount" },
  { key: "lowest-price", label: "Lowest Price" },
  { key: "highest-price", label: "Highest Price" },
  { key: "new-arrivals", label: "New Arrivals" },
  { key: "best-rated", label: "Best Rated" },
  { key: "low-stock", label: "Low Stock" },
  { key: "most-viewed", label: "Most Viewed" },
  { key: "out-of-stock", label: "Out of Stock" },
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

function WishlistPage() {
  const { user, loading } = useAuth();
  const { slugs, toggle, loading: wlLoading } = useWishlist();
  const { products, loading: pLoading } = useProducts();
  const { add } = useCart();
  const { format, priceOf, compareOf, shippingFeeOf, currency } = useRegion();
  const nav = useNavigate();

  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quickView, setQuickView] = useState<Product | null>(null);
  const [variants, setVariants] = useState<Record<string, string>>({});
  const [drops, setDrops] = useState<Record<string, number>>({});
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  // Wishlist items, preserving the saved order (slugs is a Set built from rows).
  const items = useMemo(
    () => products.filter((p) => slugs.has(p.slug)),
    [products, slugs],
  );

  // Real-time price-drop detection against a per-currency snapshot.
  useEffect(() => {
    if (!items.length) return;
    const snap = readSnap();
    const nextDrops: Record<string, number> = {};
    let changed = false;
    for (const p of items) {
      const cur = priceOf(p);
      snap[p.slug] = snap[p.slug] || {};
      const prev = snap[p.slug][currency];
      if (prev == null) {
        snap[p.slug][currency] = cur;
        changed = true;
      } else if (cur > prev) {
        // Price went up — reset baseline so future drops are measured fresh.
        snap[p.slug][currency] = cur;
        changed = true;
      } else if (cur < prev) {
        nextDrops[p.slug] = prev - cur;
      }
    }
    if (changed) writeSnap(snap);
    setDrops(nextDrops);
  }, [items, priceOf, currency]);

  // Real-time variant summary for each wishlist product.
  useEffect(() => {
    const list = items.map((p) => p.slug);
    if (!list.length) {
      setVariants({});
      return;
    }
    let active = true;
    supabase
      .from("product_variants")
      .select("product_slug,name")
      .in("product_slug", list)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        if (!active) return;
        const grouped: Record<string, string[]> = {};
        for (const r of (data ?? []) as { product_slug: string; name: string }[]) {
          (grouped[r.product_slug] ||= []).push(r.name);
        }
        const summary: Record<string, string> = {};
        for (const [slug, names] of Object.entries(grouped)) {
          const shown = names.slice(0, 3).join(" · ");
          summary[slug] = names.length > 3 ? `${shown} +${names.length - 3}` : shown;
        }
        setVariants(summary);
      });
    return () => {
      active = false;
    };
  }, [items]);

  const lowStockOf = (p: Product) =>
    p.inStock && p.stockQuantity > 0 && p.stockQuantity <= (p.lowStockThreshold || 10);
  const discOf = (p: Product) => discountPercent(priceOf(p), compareOf(p));

  const filtered = useMemo(() => {
    const byDate = (a: Product, b: Product) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    switch (filter) {
      case "in-stock":
        return items.filter((p) => p.inStock);
      case "out-of-stock":
        return items.filter((p) => !p.inStock);
      case "low-stock":
        return items.filter(lowStockOf);
      case "price-drops":
        return items.filter((p) => (drops[p.slug] ?? 0) > 0);
      case "free-shipping":
        return items.filter((p) => shippingFeeOf(p) <= 0);
      case "recently-added":
        return [...items].reverse();
      case "new-arrivals":
        return [...items].sort(byDate);
      case "highest-discount":
        return [...items].sort((a, b) => (discOf(b) ?? 0) - (discOf(a) ?? 0));
      case "lowest-price":
        return [...items].sort((a, b) => priceOf(a) - priceOf(b));
      case "highest-price":
        return [...items].sort((a, b) => priceOf(b) - priceOf(a));
      case "best-rated":
        return [...items].sort((a, b) => b.rating - a.rating);
      case "most-viewed":
        return [...items].sort((a, b) => (b.viewsCount ?? 0) - (a.viewsCount ?? 0));
      default:
        return items;
    }
  }, [items, filter, drops, shippingFeeOf, priceOf, compareOf]);

  // Smart insights
  const insights = useMemo(() => {
    let dropCount = 0;
    let outOfStock = 0;
    let lowStock = 0;
    let freeShip = 0;
    let total = 0;
    let savings = 0;
    let discSum = 0;
    let discCount = 0;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let recent = 0;
    for (const p of items) {
      if ((drops[p.slug] ?? 0) > 0) dropCount++;
      if (!p.inStock) outOfStock++;
      if (lowStockOf(p)) lowStock++;
      if (shippingFeeOf(p) <= 0) freeShip++;
      total += priceOf(p);
      const cmp = compareOf(p);
      if (cmp && cmp > priceOf(p)) savings += cmp - priceOf(p);
      const d = discOf(p);
      if (d && d > 0) {
        discSum += d;
        discCount++;
      }
      if (new Date(p.createdAt).getTime() >= weekAgo) recent++;
    }
    return {
      dropCount,
      outOfStock,
      lowStock,
      freeShip,
      total,
      savings,
      avgDiscount: discCount ? Math.round(discSum / discCount) : 0,
      recent,
      count: items.length,
    };
  }, [items, drops, priceOf, compareOf, shippingFeeOf]);


  const selectedTotal = useMemo(
    () => items.filter((p) => selected.has(p.slug)).reduce((s, p) => s + priceOf(p), 0),
    [items, selected, priceOf],
  );

  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };
  const toggleSelect = (slug: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(slug) ? next.delete(slug) : next.add(slug);
      return next;
    });
  const allSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.slug));
  const selectAll = () =>
    setSelected((prev) =>
      allSelected ? new Set() : new Set(filtered.map((p) => p.slug)),
    );

  const addSelectedToCart = () => {
    items
      .filter((p) => selected.has(p.slug) && p.inStock)
      .forEach((p) => add(p.slug, 1));
    exitSelect();
  };
  const removeSelected = async () => {
    const list = Array.from(selected);
    for (const slug of list) await toggle(slug);
    setConfirmRemove(false);
    exitSelect();
  };

  const COLLECTIONS_KEY = "wishlist_collections";
  const moveToCollection = (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    try {
      const store: Record<string, string[]> = JSON.parse(
        localStorage.getItem(COLLECTIONS_KEY) || "{}",
      );
      const set = new Set([...(store[clean] || []), ...Array.from(selected)]);
      store[clean] = Array.from(set);
      localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(store));
    } catch {
      /* ignore */
    }
    setCollectionOpen(false);
    exitSelect();
  };

  const shareSelected = async () => {
    const chosen = items.filter((p) => selected.has(p.slug));
    const text = chosen.map((p) => p.name).join(", ");
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({ title: "My FoundOurMarket Wishlist", text, url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${text} — ${url}`);
      }
    } catch {
      /* user cancelled */
    }
  };


  const addAll = () => items.filter((p) => p.inStock).forEach((p) => add(p.slug, 1));

  if (loading || !user || wlLoading || pLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="h-8 w-48 rounded bg-white/[0.05] animate-pulse mb-8" />
        <ProductSkeletonGrid count={8} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">
        Wishlist · {items.length} {items.length === 1 ? "Item" : "Items"}
      </p>
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 mb-8">
        <div>
          <h1 className="text-3xl md:text-5xl font-display font-semibold">Your Wishlist</h1>
          {items.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="text-sm">
                <span className="font-display font-semibold tabular-nums">
                  {format(insights.total)}
                </span>{" "}
                <span className="text-muted-foreground text-[11px] uppercase tracking-widest font-mono">
                  Value
                </span>
              </span>
              {insights.savings > 0 && (
                <span className="text-sm text-emerald-400">
                  <span className="font-display font-semibold tabular-nums">
                    {format(insights.savings)}
                  </span>{" "}
                  <span className="text-[11px] uppercase tracking-widest font-mono opacity-80">
                    Savings
                  </span>
                </span>
              )}
            </div>
          )}
        </div>
        {items.length > 0 && (
          <div className="flex items-center gap-2">
            {selectMode && (
              <button
                onClick={selectAll}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-[11px] uppercase tracking-widest font-bold hover:border-accent/40 transition-colors"
              >
                <CheckSquare className="size-3.5" />
                {allSelected ? "Clear all" : "Select all"}
              </button>
            )}
            <button
              onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-[11px] uppercase tracking-widest font-bold hover:border-accent/40 transition-colors"
            >
              {selectMode ? <X className="size-3.5" /> : <CheckSquare className="size-3.5" />}
              {selectMode ? "Cancel" : "Select"}
            </button>
            <button
              onClick={() => {
                setSelected(new Set(items.map((p) => p.slug)));
                shareSelected();
              }}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-[11px] uppercase tracking-widest font-bold hover:border-accent/40 transition-colors"
            >
              <Share2 className="size-3.5" /> Share
            </button>
            <button
              onClick={addAll}
              className="bg-accent text-accent-foreground font-bold px-5 py-2.5 rounded-full text-[11px] uppercase tracking-widest hover:brightness-110 transition-all inline-flex items-center gap-2 shadow-[var(--shadow-ember)]"
            >
              <ShoppingBag className="size-3.5" /> Add all
            </button>
          </div>
        )}
      </div>


      {items.length === 0 ? (
        <div className="card-premium rounded-2xl p-12 text-center animate-[fade-up_0.5s_ease-out]">
          <div className="size-16 mx-auto mb-5 grid place-items-center rounded-full bg-accent/15 border border-accent/30 text-accent animate-[float-soft_3s_ease-in-out_infinite]">
            <Heart className="size-6 fill-accent/40" />
          </div>
          <h2 className="text-xl font-display font-semibold mb-1.5">Your Wishlist Is Empty 🧡</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
            Discover products you'll love and tap the heart to save them here.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <Link
              to="/"
              className="inline-flex items-center gap-2 bg-accent text-accent-foreground rounded-full px-6 py-3 text-[11px] uppercase tracking-widest font-bold hover:brightness-110 transition-all shadow-[var(--shadow-ember)]"
            >
              <ShoppingBag className="size-3.5" /> Browse Products
            </Link>
            <Link
              to="/search"
              className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-3 text-[11px] uppercase tracking-widest font-bold hover:border-accent/40 transition-colors"
            >
              <Flame className="size-3.5" /> Trending
            </Link>
            <Link
              to="/search"
              className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-3 text-[11px] uppercase tracking-widest font-bold hover:border-accent/40 transition-colors"
            >
              <Sparkles className="size-3.5" /> New Arrivals
            </Link>
          </div>

        </div>
      ) : (
        <>
          {/* Smart alert center */}
          <AlertCenter
            insights={insights}
            dismissed={dismissedAlerts}
            onDismiss={(k) => setDismissedAlerts((prev) => new Set(prev).add(k))}
            onView={(k) => setFilter(k)}
          />

          {/* Advanced statistics dashboard */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-8">
            <InsightCard icon={<Wallet className="size-4" />} label="Total Value" value={format(insights.total)} accent />
            <InsightCard icon={<Heart className="size-4" />} label="Saved" value={String(insights.count)} />
            <InsightCard icon={<Truck className="size-4" />} label="Free Ship" value={String(insights.freeShip)} />
            <InsightCard icon={<TrendingDown className="size-4" />} label="Price Drops" value={String(insights.dropCount)} />
            <InsightCard icon={<PackageX className="size-4" />} label="Out of Stock" value={String(insights.outOfStock)} />
            <InsightCard icon={<Tag className="size-4" />} label="Savings" value={format(insights.savings)} />
            <InsightCard icon={<Percent className="size-4" />} label="Avg Discount" value={`${insights.avgDiscount}%`} />
            <InsightCard icon={<Sparkles className="size-4" />} label="Recently Added" value={String(insights.recent)} />
          </div>


          {/* Filters */}
          <div className="-mx-4 sm:mx-0 mb-6 overflow-x-auto no-scrollbar snap-x snap-mandatory">
            <div className="flex items-center gap-2 px-4 sm:px-0">
              {FILTERS.map((f) => {
                const count =
                  f.key === "price-drops"
                    ? insights.dropCount
                    : f.key === "free-shipping"
                      ? insights.freeShip
                      : f.key === "out-of-stock"
                        ? insights.outOfStock
                        : f.key === "low-stock"
                          ? insights.lowStock
                          : f.key === "in-stock"
                            ? items.filter((p) => p.inStock).length
                            : f.key === "new-arrivals" || f.key === "recently-added"
                              ? insights.recent
                              : items.length;
                const activeF = filter === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`snap-start shrink-0 inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[11px] uppercase tracking-widest font-bold transition-all active:scale-95 ${
                      activeF
                        ? "border-accent text-accent bg-accent/10 shadow-[0_0_18px_-4px_var(--accent)]"
                        : "border-border text-muted-foreground hover:border-accent/40"
                    }`}
                  >
                    {f.label}
                    {(count > 0 || activeF) && (
                      <span className="font-mono opacity-70">{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>



          {filtered.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-10 text-center text-sm text-muted-foreground">
              No items match this filter.
            </div>
          ) : (
            <div
              className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 transition-[padding] duration-200"
              style={{
                paddingBottom:
                  selectMode && selected.size > 0
                    ? "calc(200px + env(safe-area-inset-bottom, 0px))"
                    : "6rem",
              }}
            >
              {filtered.map((p) => (
                <WishlistCard
                  key={p.slug}
                  product={p}
                  variantSummary={variants[p.slug] ?? null}
                  priceDrop={drops[p.slug] ?? null}
                  selectMode={selectMode}
                  selected={selected.has(p.slug)}
                  onToggleSelect={() => toggleSelect(p.slug)}
                  onQuickView={() => setQuickView(p)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* AI recommendation rails — lazy, mobile-first, hide when empty */}
      <WishlistRecommendations wishlistSlugs={items.map((p) => p.slug)} />


      {/* Floating selection toolbar — floats above the bottom nav, never overlaps it */}
      {selectMode && selected.size > 0 && (
        <div
          className="fixed inset-x-0 z-40 flex justify-center px-3 pointer-events-none"
          style={{
            bottom:
              "calc(env(safe-area-inset-bottom, 0px) + 16px + var(--wishlist-nav-offset, 86px))",
          }}
        >
          <div
            className="pointer-events-auto w-full max-w-2xl rounded-[18px] border bg-background/65 backdrop-blur-xl shadow-[0_18px_50px_-12px_rgba(0,0,0,0.7),0_0_30px_-10px_var(--shadow-ember-color,oklch(0.74_0.19_49/0.45))] px-2.5 sm:px-3.5 animate-[slide-in-up_0.22s_cubic-bezier(0.16,1,0.3,1)]"
            style={{
              width: "calc(100% - 24px)",
              minHeight: "60px",
              borderColor: "rgba(255,255,255,0.08)",
            }}
          >
            <div className="flex items-center gap-1.5 sm:gap-2 h-[60px]">
              {/* Select all */}
              <button
                onClick={selectAll}
                aria-label={allSelected ? "Clear selection" : "Select all"}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 sm:px-3.5 h-9 text-[10px] uppercase tracking-widest font-bold hover:border-accent/40 transition-colors active:scale-95"
              >
                <CheckSquare className="size-3.5" />
                <span className="hidden sm:inline">{allSelected ? "Clear" : "All"}</span>
              </button>

              {/* Count + value + clear */}
              <div className="min-w-0 flex flex-col leading-none gap-0.5">
                <span className="text-[13px] font-display font-semibold tabular-nums whitespace-nowrap">
                  {selected.size} item{selected.size > 1 ? "s" : ""}
                </span>
                <span className="text-[10px] font-mono text-accent tabular-nums whitespace-nowrap hidden sm:inline">
                  {format(selectedTotal)}
                </span>
                <button
                  onClick={exitSelect}
                  className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors text-left"
                >
                  Clear
                </button>
              </div>


              <div className="flex-1 min-w-1" />

              {/* Share */}
              <button
                onClick={shareSelected}
                aria-label="Share selected"
                className="shrink-0 grid place-items-center rounded-full border border-border size-9 text-muted-foreground hover:text-accent hover:border-accent/40 transition-colors active:scale-90"
              >
                <Share2 className="size-4" />
              </button>

              {/* Move to collection */}
              <button
                onClick={() => setCollectionOpen(true)}
                aria-label="Move to collection"
                className="shrink-0 grid place-items-center rounded-full border border-border size-9 text-muted-foreground hover:text-accent hover:border-accent/40 transition-colors active:scale-90"
              >
                <Layers className="size-4" />
              </button>

              {/* Remove */}
              <button
                onClick={() => setConfirmRemove(true)}
                aria-label="Remove selected"
                className="shrink-0 grid place-items-center rounded-full border border-border size-9 text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors active:scale-90"
              >
                <Trash2 className="size-4" />
              </button>

              {/* Add to cart (primary) */}
              <button
                onClick={addSelectedToCart}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-accent text-accent-foreground px-3 sm:px-4 h-9 text-[10px] uppercase tracking-widest font-bold hover:brightness-110 transition-all shadow-[var(--shadow-ember)] active:scale-95"
              >
                <ShoppingBag className="size-3.5" />
                <span className="hidden sm:inline">Add</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk remove confirmation */}
      <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <DialogContent className="max-w-sm bg-card border-border">
          <div className="text-center">
            <div className="size-12 mx-auto mb-4 grid place-items-center rounded-full bg-destructive/15 border border-destructive/30 text-destructive">
              <AlertTriangle className="size-5" />
            </div>
            <h3 className="text-lg font-display font-semibold">Remove {selected.size} item{selected.size > 1 ? "s" : ""}?</h3>
            <p className="text-sm text-muted-foreground mt-1.5">
              They'll be removed from your wishlist. You can always save them again later.
            </p>
            <div className="mt-5 flex items-center gap-2">
              <button
                onClick={() => setConfirmRemove(false)}
                className="flex-1 rounded-full border border-border py-3 text-[11px] uppercase tracking-widest font-bold hover:border-accent/40 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={removeSelected}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-destructive text-destructive-foreground py-3 text-[11px] uppercase tracking-widest font-bold hover:brightness-110 transition-all"
              >
                <Trash2 className="size-3.5" /> Remove
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Move to collection */}
      <Dialog open={collectionOpen} onOpenChange={setCollectionOpen}>
        <DialogContent className="max-w-sm bg-card border-border">
          <CollectionPicker count={selected.size} onSubmit={moveToCollection} />
        </DialogContent>
      </Dialog>



      {/* Quick View */}
      <Dialog open={!!quickView} onOpenChange={(o) => !o && setQuickView(null)}>
        <DialogContent className="max-w-lg p-0 overflow-hidden bg-card border-border">
          {quickView && <QuickView product={quickView} onClose={() => setQuickView(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CollectionPicker({
  count,
  onSubmit,
}: {
  count: number;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [existing, setExisting] = useState<string[]>([]);

  useEffect(() => {
    try {
      const store = JSON.parse(localStorage.getItem("wishlist_collections") || "{}");
      setExisting(Object.keys(store));
    } catch {
      setExisting([]);
    }
  }, []);

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-4">
        <div className="size-10 grid place-items-center rounded-xl bg-accent/15 border border-accent/30 text-accent">
          <Layers className="size-5" />
        </div>
        <div>
          <h3 className="text-base font-display font-semibold leading-none">Move to collection</h3>
          <p className="text-[11px] text-muted-foreground mt-1">
            {count} item{count > 1 ? "s" : ""} selected
          </p>
        </div>
      </div>

      {existing.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {existing.map((c) => (
            <button
              key={c}
              onClick={() => onSubmit(c)}
              className="rounded-full border border-border px-3 py-1.5 text-[11px] font-bold hover:border-accent/40 hover:text-accent transition-colors"
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(name);
        }}
        className="flex items-center gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New collection name"
          className="flex-1 rounded-full bg-background border border-border px-4 py-2.5 text-sm outline-none focus:border-accent/50"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="shrink-0 rounded-full bg-accent text-accent-foreground px-5 py-2.5 text-[11px] uppercase tracking-widest font-bold hover:brightness-110 transition-all shadow-[var(--shadow-ember)] disabled:opacity-40"
        >
          Save
        </button>
      </form>
    </div>
  );
}


function InsightCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="card-premium p-4 flex flex-col gap-2 transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[0_0_24px_-8px_var(--accent)]">
      <div
        className={`size-9 grid place-items-center rounded-xl border ${
          accent
            ? "bg-accent/15 border-accent/40 text-accent"
            : "bg-white/[0.04] border-white/10 text-muted-foreground"
        }`}
      >
        {icon}
      </div>
      <div>
        <p className="text-lg font-display font-semibold tabular-nums leading-none">{value}</p>
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-1">
          {label}
        </p>
      </div>
    </div>
  );
}

type WishlistInsights = {
  dropCount: number;
  outOfStock: number;
  lowStock: number;
  freeShip: number;
  total: number;
  savings: number;
  avgDiscount: number;
  recent: number;
  count: number;
};

function AlertCenter({
  insights,
  dismissed,
  onDismiss,
  onView,
}: {
  insights: WishlistInsights;
  dismissed: Set<string>;
  onDismiss: (k: string) => void;
  onView: (k: FilterKey) => void;
}) {
  const alerts: {
    key: string;
    filter: FilterKey;
    icon: React.ReactNode;
    title: string;
    desc: string;
    tone: "accent" | "emerald" | "amber";
  }[] = [];
  if (insights.dropCount > 0)
    alerts.push({
      key: "drops",
      filter: "price-drops",
      icon: <TrendingDown className="size-4" />,
      title: "Price Drop",
      desc: `${insights.dropCount} product${insights.dropCount > 1 ? "s" : ""} reduced`,
      tone: "emerald",
    });
  if (insights.lowStock > 0)
    alerts.push({
      key: "low",
      filter: "low-stock",
      icon: <Box className="size-4" />,
      title: "Limited Stock",
      desc: `${insights.lowStock} selling fast`,
      tone: "amber",
    });
  if (insights.outOfStock > 0)
    alerts.push({
      key: "oos",
      filter: "out-of-stock",
      icon: <PackageX className="size-4" />,
      title: "Out of Stock",
      desc: `${insights.outOfStock} unavailable`,
      tone: "accent",
    });

  const visible = alerts.filter((a) => !dismissed.has(a.key));
  if (!visible.length) return null;

  const tones = {
    accent: "bg-accent/10 border-accent/30 text-accent",
    emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
    amber: "bg-amber-500/10 border-amber-500/30 text-amber-300",
  };

  return (
    <div className="-mx-4 sm:mx-0 mb-6 overflow-x-auto no-scrollbar">
      <div className="flex items-stretch gap-2.5 px-4 sm:px-0">
        {visible.map((a) => (
          <div
            key={a.key}
            className={`shrink-0 flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 backdrop-blur-xl animate-[fade-up_0.4s_ease-out] ${tones[a.tone]}`}
          >
            <button onClick={() => onView(a.filter)} className="flex items-center gap-3 text-left">
              <span className="grid place-items-center size-8 rounded-xl bg-background/40 border border-current/20">
                {a.icon}
              </span>
              <span className="leading-tight">
                <span className="block text-[12px] font-display font-semibold text-foreground">
                  {a.title}
                </span>
                <span className="block text-[10px] font-mono opacity-80">{a.desc}</span>
              </span>
            </button>
            <button
              onClick={() => onDismiss(a.key)}
              aria-label="Dismiss"
              className="grid place-items-center size-6 rounded-full hover:bg-background/40 text-muted-foreground transition-colors"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}


function QuickView({ product, onClose }: { product: Product; onClose: () => void }) {
  const { format, priceOf, compareOf } = useRegion();
  const { add } = useCart();
  const price = priceOf(product);
  const original = compareOf(product);

  return (
    <div>
      <div className="relative aspect-[4/3] bg-black/40">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>
      <div className="p-5">
        <h3 className="text-lg font-display font-semibold">{product.name}</h3>
        {product.tagline && (
          <p className="text-sm text-muted-foreground mt-1">{product.tagline}</p>
        )}
        {product.reviews > 0 && (
          <div className="mt-2">
            <StarRating rating={product.rating} count={product.reviews} starClassName="size-3.5" textClassName="text-xs" />
          </div>
        )}
        {product.description && (
          <p className="text-sm text-muted-foreground mt-3 line-clamp-3">{product.description}</p>
        )}
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-2xl font-display font-semibold tabular-nums">{format(price)}</span>
          {original && original > price && (
            <span className="text-sm font-mono text-muted-foreground/60 line-through">
              {format(original)}
            </span>
          )}
        </div>
        <div className="mt-5 flex items-center gap-2">
          <button
            onClick={() => {
              add(product.slug, 1);
              onClose();
            }}
            disabled={!product.inStock}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-accent text-accent-foreground font-bold py-3 text-[11px] uppercase tracking-widest hover:brightness-110 transition-all shadow-[var(--shadow-ember)] disabled:opacity-40"
          >
            <ShoppingBag className="size-3.5" /> {product.inStock ? "Add to cart" : "Sold out"}
          </button>
          <Link
            to="/products/$slug"
            params={{ slug: product.slug }}
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-full border border-border px-5 py-3 text-[11px] uppercase tracking-widest font-bold hover:border-accent/40 transition-colors"
          >
            Details
          </Link>
        </div>
      </div>
    </div>
  );
}
