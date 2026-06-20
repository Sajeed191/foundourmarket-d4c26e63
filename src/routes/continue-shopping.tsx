import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import {
  ShoppingBag, Heart, Eye, CreditCard, Clock, ArrowDownUp, Sparkles, LogIn, Plus, Check,
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
  cart: { label: "In your cart", icon: ShoppingBag, tone: "text-sky-400 bg-sky-500/15" },
  wishlist: { label: "Saved", icon: Heart, tone: "text-rose-400 bg-rose-500/15" },
  viewed: { label: "Recently viewed", icon: Eye, tone: "text-violet-400 bg-violet-500/15" },
};

type Entry = { product: Product; kind: ActivityKind; at: number | null };
type FilterKey = "all" | ActivityKind;
type SortKey = "recent" | "price-asc" | "price-desc";

function ActivityCard({ entry }: { entry: Entry }) {
  const { product, kind, at } = entry;
  const { priceOf } = useRegion();
  const { add, items } = useCart();
  const [justAdded, setJustAdded] = useState(false);
  const inCart = items.some((i) => i.slug === product.slug);
  const meta = KIND_META[kind];
  const Icon = meta.icon;

  return (
    <div className="group card-premium overflow-hidden p-2.5 flex flex-col">
      <Link to="/products/$slug" params={{ slug: product.slug }} className="block">
        <div className="relative aspect-square rounded-xl overflow-hidden bg-black/40 mb-2.5">
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
          <span className={`absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur ${meta.tone}`}>
            <Icon className="size-3" /> {meta.label}
          </span>
          {!product.inStock && (
            <span className="absolute right-2 top-2 inline-flex items-center rounded-full bg-background/85 backdrop-blur px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              Out of stock
            </span>
          )}
        </div>
        <h3 className="text-xs sm:text-sm font-medium line-clamp-1 group-hover:text-accent transition-colors">{product.name}</h3>
      </Link>

      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Clock className="size-3 shrink-0" />
        <span className="truncate">{at ? `${formatDistanceToNow(at)} ago` : "Recently"}</span>
        {product.inStock ? (
          <span className="ml-auto text-emerald-400 font-medium">In stock</span>
        ) : (
          <span className="ml-auto text-muted-foreground">—</span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <Price value={priceOf(product)} className="font-display font-semibold text-sm tabular-nums leading-none" />
        <button
          onClick={() => {
            add(product.slug);
            setJustAdded(true);
            window.setTimeout(() => setJustAdded(false), 900);
          }}
          aria-label={`Add ${product.name} to cart`}
          disabled={!product.inStock}
          className="shrink-0 grid place-items-center size-8 rounded-full bg-accent text-accent-foreground transition-all hover:brightness-110 active:scale-90 shadow-[var(--shadow-ember)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {justAdded || inCart ? <Check className="size-4" /> : <Plus className="size-4" />}
        </button>
      </div>
    </div>
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
  const [checkoutSlugs, setCheckoutSlugs] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setEventAt(new Map());
      setCheckoutSlugs(new Set());
      return;
    }
    void (async () => {
      const { data } = await supabase
        .from("recommendation_events")
        .select("product_slug, event_type, created_at")
        .eq("user_id", user.id)
        .not("product_slug", "is", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (cancelled) return;
      const at = new Map<string, number>();
      const checkout = new Set<string>();
      for (const r of (data ?? []) as { product_slug: string; event_type: string; created_at: string }[]) {
        const t = new Date(r.created_at).getTime();
        if (!at.has(r.product_slug)) at.set(r.product_slug, t);
        if (r.event_type === "begin_checkout") checkout.add(r.product_slug);
      }
      setEventAt(at);
      setCheckoutSlugs(checkout);
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Build one entry per product, keeping ONLY the highest-priority activity.
  const entries = useMemo<Entry[]>(() => {
    const map = new Map(products.map((p) => [p.slug, p] as const));
    const best = new Map<string, Entry>();
    const consider = (slug: string, kind: ActivityKind) => {
      const product = map.get(slug);
      if (!product) return;
      const at = eventAt.get(slug) ?? null;
      const existing = best.get(slug);
      if (existing && PRIORITY[existing.kind] <= PRIORITY[kind]) return;
      best.set(slug, { product, kind, at });
    };
    for (const slug of checkoutSlugs) consider(slug, "checkout");
    for (const i of cartItems) consider(i.slug, "cart");
    for (const slug of wishSlugs) consider(slug, "wishlist");
    for (const slug of recentSlugs) consider(slug, "viewed");
    return [...best.values()];
  }, [products, checkoutSlugs, cartItems, wishSlugs, recentSlugs, eventAt]);

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
    { key: "cart", label: "Cart" },
    { key: "wishlist", label: "Wishlist" },
    { key: "viewed", label: "Recently viewed" },
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
            className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5"
          >
            {visible.map((entry) => (
              <ActivityCard key={entry.product.slug} entry={entry} />
            ))}
          </motion.div>
        </>
      )}

      {/* Empty (signed in, no activity) */}
      {!loading && user && entries.length === 0 && (
        <div className="card-premium rounded-2xl p-12 text-center mt-8">
          <div className="size-16 mx-auto mb-5 grid place-items-center rounded-full bg-accent/15 border border-accent/30 text-accent animate-[float-soft_3s_ease-in-out_infinite]">
            <ShoppingBag className="size-6" />
          </div>
          <h2 className="text-xl font-display font-semibold mb-1.5">No activity yet</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
            Browse products, add to cart or save to your wishlist and they will appear here.
          </p>
          <Link to="/" className="inline-flex items-center gap-2 bg-accent text-accent-foreground rounded-full px-6 py-3 text-[11px] uppercase tracking-widest font-bold hover:brightness-110 transition-all shadow-[var(--shadow-ember)]">
            <ShoppingBag className="size-3.5" /> Start browsing
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
