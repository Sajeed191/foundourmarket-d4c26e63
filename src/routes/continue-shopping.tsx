import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ShoppingBag, Heart, Eye, CreditCard, Clock, ArrowDownUp, Sparkles, LogIn, ArrowRight, LayoutGrid,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProducts } from "@/lib/use-products";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useRegion } from "@/lib/region";
import { Price } from "@/components/site/Price";
import type { Product } from "@/lib/products";

export const Route = createFileRoute("/continue-shopping")({
  head: () => ({
    meta: [
      { title: "Continue Shopping — FoundOurMarket™" },
      { name: "description", content: "Pick up exactly where you left off. Products from your checkout, cart, wishlist and recent views — all in one place." },
      { property: "og:title", content: "Continue Shopping — FoundOurMarket™" },
      { property: "og:description", content: "Pick up exactly where you left off — your personalized shopping activity." },
    ],
  }),
  component: ContinueShoppingPage,
});

/** Activity source, highest priority first. */
type ActivityKind = "checkout" | "cart" | "wishlist" | "viewed";

const PRIORITY: Record<ActivityKind, number> = { checkout: 0, cart: 1, wishlist: 2, viewed: 3 };

const KIND_META: Record<ActivityKind, { label: string; icon: typeof ShoppingBag; tone: string }> = {
  checkout: { label: "Checkout started", icon: CreditCard, tone: "text-amber-400 bg-amber-500/15" },
  cart: { label: "Added to cart", icon: ShoppingBag, tone: "text-sky-400 bg-sky-500/15" },
  wishlist: { label: "Saved for later", icon: Heart, tone: "text-rose-400 bg-rose-500/15" },
  viewed: { label: "Viewed recently", icon: Eye, tone: "text-violet-400 bg-violet-500/15" },
};

/** Activity expiry windows (days). Wishlist never expires. */
const DAY = 24 * 60 * 60 * 1000;
const EXPIRY_MS: Record<ActivityKind, number> = {
  viewed: 90 * DAY,
  cart: 60 * DAY,
  checkout: 30 * DAY,
  wishlist: Infinity,
};

type Entry = { product: Product; kind: ActivityKind; at: number | null };
type FilterKey = "all" | ActivityKind;
type SortKey = "recent" | "price-asc" | "price-desc";

/** Human, enterprise-style relative time: "5 minutes ago", "Yesterday", "Last week". */
function relTime(ts: number | null): string {
  if (!ts) return "Recently";
  const diff = Date.now() - ts;
  if (diff < 0) return "Just now";
  const min = 60 * 1000, hour = 60 * min;
  if (diff < min) return "Just now";
  if (diff < hour) { const m = Math.round(diff / min); return `${m} minute${m > 1 ? "s" : ""} ago`; }
  if (diff < DAY) { const h = Math.round(diff / hour); return `${h} hour${h > 1 ? "s" : ""} ago`; }
  const days = Math.round(diff / DAY);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "Last week";
  if (days < 30) { const w = Math.round(days / 7); return `${w} weeks ago`; }
  const months = Math.round(days / 30);
  return months <= 1 ? "Last month" : `${months} months ago`;
}

function ActivityCard({ entry }: { entry: Entry }) {
  const { product, kind, at } = entry;
  const { priceOf } = useRegion();
  const meta = KIND_META[kind];
  const Icon = meta.icon;

  return (
    <div data-product-card data-android-static-card className="group card-premium product-card-shell overflow-hidden p-2.5 flex flex-col">
      <Link to="/products/$slug" params={{ slug: product.slug }} className="block">
        <div data-product-media className="relative aspect-square rounded-xl overflow-hidden bg-black/40 mb-2.5">
          <img
            data-product-image
            src={product.image}
            alt={product.name}
            loading="lazy"
            decoding="sync"
            className="w-full h-full object-cover transition-opacity duration-500"
          />
          <span className={`product-typography absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur ${meta.tone}`}>
            <Icon className="size-3" /> {meta.label}
          </span>
          {!product.inStock && (
            <span className="product-typography absolute right-2 top-2 inline-flex items-center rounded-full bg-background/85 backdrop-blur px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              Out of stock
            </span>
          )}
        </div>
        <h3 data-product-text className="product-typography product-title-text text-xs sm:text-sm font-medium line-clamp-1 group-hover:text-accent transition-colors">{product.name}</h3>
      </Link>

      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Clock className="size-3 shrink-0" />
        <span className="product-typography truncate">{relTime(at)}</span>
        {product.inStock ? (
          <span className="product-typography ml-auto text-emerald-400 font-medium">In stock</span>
        ) : (
          <span className="product-typography ml-auto text-muted-foreground">—</span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <Price value={priceOf(product)} className="font-display font-semibold text-sm tabular-nums leading-none" />
      </div>

      <Link
        to="/products/$slug"
        params={{ slug: product.slug }}
        className="mt-3 inline-flex h-11 sm:h-12 w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-accent px-4 sm:px-5 text-[11px] sm:text-xs font-semibold uppercase tracking-widest text-accent-foreground transition-colors hover:brightness-110 shadow-[var(--shadow-ember)]"
      >
        <span className="product-typography truncate">Continue Shopping</span>
        <ArrowRight className="size-3.5 shrink-0" />
      </Link>
    </div>
  );
}

/**
 * Premium "View All" gateway card. Not a product card — a distinct navigation
 * destination to the full catalogue, sized to align with the product grid.
 * GPU-friendly transforms only (no backdrop-filter / heavy blur).
 */
function ViewAllCard({ productCount }: { productCount: number }) {
  const hint =
    productCount > 0
      ? `${Math.max(10, Math.floor(productCount / 10) * 10)}+ products`
      : "Based on your interests";

  return (
    <Link
      to="/"
      onClick={() => {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          try { navigator.vibrate?.(8); } catch { /* no-op */ }
        }
      }}
      className="group card-premium product-card-shell relative flex flex-col items-center justify-between overflow-hidden p-4 text-center transition-transform duration-200 will-change-transform active:scale-[0.97]"
      aria-label="View all products"
    >
      {/* Soft breathing orange glow — transform/opacity only */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 size-40 rounded-full opacity-40 animate-[glow-breathe_4s_ease-in-out_infinite]"
        style={{ background: "var(--gradient-ember)" }}
      />

      {/* Top: elegant circular icon container */}
      <div className="relative mt-3 grid size-14 place-items-center rounded-full bg-accent/15 border border-accent/30 text-accent shadow-[var(--shadow-ember)]">
        <LayoutGrid className="size-6 transition-transform duration-700 group-hover:rotate-[5deg] animate-[icon-tilt_6s_ease-in-out_infinite]" />
      </div>

      {/* Center */}
      <div className="relative">
        <h3 className="font-display text-lg sm:text-xl font-semibold tracking-tight">View All</h3>
        <p className="mt-1 text-[11px] text-muted-foreground">Discover more products</p>
        <p className="mt-1.5 text-[10px] font-mono uppercase tracking-widest text-accent/90">{hint}</p>
      </div>

      {/* Bottom premium chip */}
      <span className="relative mb-1 inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-accent">
        Browse Collection
        <ArrowRight className="size-3 transition-transform duration-300 group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function ContinueShoppingPage() {
  const { user, loading: authLoading } = useAuth();
  const { products, loading: productsLoading } = useProducts();
  const { items: cartItems } = useCart();
  const { slugs: wishSlugs } = useWishlist();
  const { slugs: recentSlugs } = useRecentlyViewed();

  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("recent");

  // Account-isolated activity timestamps + checkout-started signals, scoped to
  // auth.uid() by RLS. Guests fall back to client-side cart/wishlist/views only.
  const [eventAt, setEventAt] = useState<Map<string, number>>(new Map());
  const [checkoutAt, setCheckoutAt] = useState<Map<string, number>>(new Map());
  const [cartAt, setCartAt] = useState<Map<string, number>>(new Map());
  const [viewedAt, setViewedAt] = useState<Map<string, number>>(new Map());
  // Products already purchased AND delivered — never show these again.
  const [purchasedSlugs, setPurchasedSlugs] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setEventAt(new Map());
      setCheckoutAt(new Map());
      setCartAt(new Map());
      setViewedAt(new Map());
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
      for (const r of (events.data ?? []) as { product_slug: string; event_type: string; created_at: string }[]) {
        const t = new Date(r.created_at).getTime();
        if (!at.has(r.product_slug)) at.set(r.product_slug, t);
        if (r.event_type === "begin_checkout" && !checkout.has(r.product_slug)) checkout.set(r.product_slug, t);
        if (r.event_type === "add_to_cart" && !cart.has(r.product_slug)) cart.set(r.product_slug, t);
        if (r.event_type === "view" && !viewed.has(r.product_slug)) viewed.set(r.product_slug, t);
      }

      const purchased = new Set<string>();
      for (const o of (delivered.data ?? []) as { order_items: { product_slug: string | null }[] | null }[]) {
        for (const it of o.order_items ?? []) {
          if (it.product_slug) purchased.add(it.product_slug);
        }
      }

      setEventAt(at);
      setCheckoutAt(checkout);
      setCartAt(cart);
      setViewedAt(viewed);
      setPurchasedSlugs(purchased);
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Build one entry per product, keeping ONLY the highest-priority, non-expired
  // activity. Delivered purchases are excluded entirely.
  const entries = useMemo<Entry[]>(() => {
    const map = new Map(products.map((p) => [p.slug, p] as const));
    const best = new Map<string, Entry>();
    const tsFor = (slug: string, kind: ActivityKind): number | null => {
      if (kind === "checkout") return checkoutAt.get(slug) ?? eventAt.get(slug) ?? null;
      if (kind === "cart") return cartAt.get(slug) ?? eventAt.get(slug) ?? null;
      if (kind === "viewed") return viewedAt.get(slug) ?? eventAt.get(slug) ?? null;
      return eventAt.get(slug) ?? null; // wishlist
    };
    const consider = (slug: string, kind: ActivityKind) => {
      if (purchasedSlugs.has(slug)) return; // never show delivered purchases
      const product = map.get(slug);
      if (!product) return;
      const at = tsFor(slug, kind);
      // Expire stale activity (wishlist never expires).
      if (at != null && Date.now() - at > EXPIRY_MS[kind]) return;
      const existing = best.get(slug);
      if (existing && PRIORITY[existing.kind] <= PRIORITY[kind]) return;
      best.set(slug, { product, kind, at });
    };
    for (const slug of checkoutAt.keys()) consider(slug, "checkout");
    for (const i of cartItems) consider(i.slug, "cart");
    for (const slug of wishSlugs) consider(slug, "wishlist");
    for (const slug of recentSlugs) consider(slug, "viewed");
    return [...best.values()];
  }, [products, checkoutAt, cartItems, wishSlugs, recentSlugs, eventAt, cartAt, viewedAt, purchasedSlugs]);

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { all: entries.length, checkout: 0, cart: 0, wishlist: 0, viewed: 0 };
    for (const e of entries) c[e.kind] += 1;
    return c;
  }, [entries]);

  const { priceOf } = useRegion();
  const visible = useMemo(() => {
    const filtered = filter === "all" ? entries : entries.filter((e) => e.kind === filter);
    const sorted = [...filtered];
    if (sort === "recent") sorted.sort((a, b) => (b.at ?? 0) - (a.at ?? 0) || PRIORITY[a.kind] - PRIORITY[b.kind]);
    else if (sort === "price-asc") sorted.sort((a, b) => priceOf(a.product) - priceOf(b.product));
    else sorted.sort((a, b) => priceOf(b.product) - priceOf(a.product));
    return sorted;
  }, [entries, filter, sort, priceOf]);

  const loading = authLoading || productsLoading;

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: "all", label: "All" },
    { key: "checkout", label: "Checkout started" },
    { key: "cart", label: "Added to cart" },
    { key: "wishlist", label: "Saved for later" },
    { key: "viewed", label: "Viewed recently" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16 mobile-page-clearance md:pb-16">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3 flex items-center gap-2">
          <Sparkles className="size-3" /> Pick up where you left off
        </p>
        <h1 className="text-3xl md:text-5xl font-display font-semibold">Continue Shopping</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-md">
          Only products you have interacted with — from checkout, cart, wishlist and recent views. Nothing random.
        </p>
      </motion.div>

      {/* Signed-out CTA */}
      {!loading && !user && (
        <div className="card-premium rounded-2xl p-12 text-center mt-8">
          <div className="size-16 mx-auto mb-5 grid place-items-center rounded-full bg-accent/15 border border-accent/30 text-accent">
            <LogIn className="size-6" />
          </div>
          <h2 className="text-xl font-display font-semibold mb-1.5">Sign in to see your activity</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
            Your shopping activity is private to your account. Sign in to continue where you left off.
          </p>
          <Link to="/auth" className="inline-flex items-center gap-2 bg-accent text-accent-foreground rounded-full px-6 py-3 text-[11px] uppercase tracking-widest font-bold hover:brightness-110 transition-all shadow-[var(--shadow-ember)]">
            <LogIn className="size-3.5" /> Sign in
          </Link>
        </div>
      )}

      {/* Controls */}
      {!loading && user && entries.length > 0 && (
        <>
          <div className="mt-7 flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => {
              const n = counts[f.key];
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  disabled={n === 0}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                    active ? "bg-accent text-accent-foreground shadow-[var(--shadow-ember)]" : "border border-border hover:border-accent/40 hover:text-accent"
                  }`}
                >
                  {f.label}
                  <span className={`text-[10px] tabular-nums ${active ? "opacity-80" : "text-muted-foreground"}`}>{n}</span>
                </button>
              );
            })}
            <div className="ml-auto relative inline-flex items-center gap-2">
              <ArrowDownUp className="size-3.5 text-muted-foreground" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="bg-card border border-border rounded-full px-3 py-1.5 text-xs font-medium focus:outline-none focus:border-accent/50"
              >
                <option value="recent">Most recent</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
              </select>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            data-product-grid
            className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5"
          >
            {visible.map((entry) => (
              <ActivityCard key={entry.product.slug} entry={entry} />
            ))}
            <ViewAllCard productCount={products.length} />
          </motion.div>
        </>
      )}

      {/* Empty (signed in, no activity) */}
      {!loading && user && entries.length === 0 && (
        <div className="card-premium rounded-2xl p-12 text-center mt-8">
          <div className="size-16 mx-auto mb-5 grid place-items-center rounded-full bg-accent/15 border border-accent/30 text-accent animate-[float-soft_3s_ease-in-out_infinite]">
            <ShoppingBag className="size-6" />
          </div>
          <h2 className="text-xl font-display font-semibold mb-1.5">Nothing here yet</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
            Start exploring products to build your personalized shopping experience.
          </p>
          <Link to="/" className="inline-flex items-center gap-2 bg-accent text-accent-foreground rounded-full px-6 py-3 text-[11px] uppercase tracking-widest font-bold hover:brightness-110 transition-all shadow-[var(--shadow-ember)]">
            <ShoppingBag className="size-3.5" /> Browse Products
          </Link>
        </div>
      )}

      {loading && (
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] rounded-2xl bg-white/[0.05] animate-pulse" />
          ))}
        </div>
      )}
    </div>
  );
}
