import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Heart,
  Loader2,
  ShoppingBag,
  Trash2,
  CheckSquare,
  X,
  TrendingDown,
  PackageX,
  Truck,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useWishlist } from "@/lib/wishlist";
import { useProducts } from "@/lib/use-products";
import { useCart } from "@/lib/cart";
import { useRegion } from "@/lib/region";
import { supabase } from "@/integrations/supabase/client";
import { type Product } from "@/lib/products";
import { WishlistCard } from "@/components/site/WishlistCard";
import { ProductSkeletonGrid } from "@/components/site/ProductSkeleton";
import { StarRating } from "@/components/site/StarRating";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export const Route = createFileRoute("/wishlist")({
  head: () => ({ meta: [{ title: "Wishlist — FoundOurMarket™" }] }),
  component: WishlistPage,
});

type FilterKey = "all" | "in-stock" | "price-drops" | "out-of-stock" | "recent";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "in-stock", label: "In Stock" },
  { key: "price-drops", label: "Price Drops" },
  { key: "out-of-stock", label: "Out of Stock" },
  { key: "recent", label: "Recently Added" },
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

  const filtered = useMemo(() => {
    switch (filter) {
      case "in-stock":
        return items.filter((p) => p.inStock);
      case "out-of-stock":
        return items.filter((p) => !p.inStock);
      case "price-drops":
        return items.filter((p) => (drops[p.slug] ?? 0) > 0);
      case "recent":
        return [...items].reverse();
      default:
        return items;
    }
  }, [items, filter, drops]);

  // Smart insights
  const insights = useMemo(() => {
    let dropCount = 0;
    let lowStock = 0;
    let freeShip = 0;
    let total = 0;
    for (const p of items) {
      if ((drops[p.slug] ?? 0) > 0) dropCount++;
      if (p.inStock && p.stockQuantity > 0 && p.stockQuantity <= (p.lowStockThreshold || 10))
        lowStock++;
      if (shippingFeeOf(p) <= 0) freeShip++;
      total += priceOf(p);
    }
    return { dropCount, lowStock, freeShip, total };
  }, [items, drops, priceOf, shippingFeeOf]);

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
    exitSelect();
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
        Saved · {items.length}
      </p>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <h1 className="text-3xl md:text-5xl font-display font-semibold">Your Wishlist</h1>
        {items.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-[11px] uppercase tracking-widest font-bold hover:border-accent/40 transition-colors"
            >
              {selectMode ? <X className="size-3.5" /> : <CheckSquare className="size-3.5" />}
              {selectMode ? "Cancel" : "Select"}
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
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <div className="size-14 mx-auto mb-5 grid place-items-center rounded-full border border-border">
            <Heart className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            Nothing saved yet. Tap the heart on anything you love.
          </p>
          <Link
            to="/"
            className="inline-block bg-accent text-accent-foreground rounded-full px-6 py-3 text-xs uppercase tracking-widest font-bold"
          >
            Browse
          </Link>
        </div>
      ) : (
        <>
          {/* Smart insights */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            <InsightCard
              icon={<TrendingDown className="size-4" />}
              label="Price Drops"
              value={String(insights.dropCount)}
              accent
            />
            <InsightCard
              icon={<PackageX className="size-4" />}
              label="Low Stock"
              value={String(insights.lowStock)}
            />
            <InsightCard
              icon={<Truck className="size-4" />}
              label="Free Shipping"
              value={String(insights.freeShip)}
            />
            <InsightCard
              icon={<Wallet className="size-4" />}
              label="Total Value"
              value={format(insights.total)}
            />
          </div>

          {/* Filters */}
          <div className="-mx-4 sm:mx-0 mb-6 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-2 px-4 sm:px-0">
              {FILTERS.map((f) => {
                const count =
                  f.key === "price-drops"
                    ? insights.dropCount
                    : f.key === "out-of-stock"
                      ? items.filter((p) => !p.inStock).length
                      : f.key === "in-stock"
                        ? items.filter((p) => p.inStock).length
                        : items.length;
                const activeF = filter === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[11px] uppercase tracking-widest font-bold transition-all ${
                      activeF
                        ? "border-accent text-accent bg-accent/10 shadow-[0_0_18px_-4px_var(--accent)]"
                        : "border-border text-muted-foreground hover:border-accent/40"
                    }`}
                  >
                    {f.label}
                    <span className="font-mono opacity-70">{count}</span>
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 pb-24">
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

      {/* Sticky action bar */}
      {selectMode && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-4 pt-2 pointer-events-none">
          <div className="pointer-events-auto max-w-3xl mx-auto rounded-2xl border border-white/10 bg-background/80 backdrop-blur-2xl shadow-2xl shadow-black/50 p-3 flex flex-wrap items-center gap-2">
            <button
              onClick={selectAll}
              className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-[11px] uppercase tracking-widest font-bold hover:border-accent/40 transition-colors"
            >
              <CheckSquare className="size-3.5" />
              {allSelected ? "Clear" : "Select all"}
            </button>
            <span className="text-xs font-mono text-muted-foreground px-1">
              {selected.size} selected
            </span>
            <div className="flex-1" />
            <button
              onClick={removeSelected}
              disabled={selected.size === 0}
              className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-[11px] uppercase tracking-widest font-bold text-muted-foreground hover:text-accent hover:border-accent/40 transition-colors disabled:opacity-40"
            >
              <Trash2 className="size-3.5" /> Remove
            </button>
            <button
              onClick={addSelectedToCart}
              disabled={selected.size === 0}
              className="inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground px-5 py-2.5 text-[11px] uppercase tracking-widest font-bold hover:brightness-110 transition-all shadow-[var(--shadow-ember)] disabled:opacity-40"
            >
              <ShoppingBag className="size-3.5" /> Add to cart
            </button>
          </div>
        </div>
      )}

      {/* Quick View */}
      <Dialog open={!!quickView} onOpenChange={(o) => !o && setQuickView(null)}>
        <DialogContent className="max-w-lg p-0 overflow-hidden bg-card border-border">
          {quickView && <QuickView product={quickView} onClose={() => setQuickView(null)} />}
        </DialogContent>
      </Dialog>
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
    <div className="card-premium p-4 flex flex-col gap-2">
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
