import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import {
  Loader2, Package, Search, ArrowRight, Heart, Eye, Bell, Sparkles,
  ShoppingBag, Star, Tag, X, Filter, ChevronLeft, ChevronRight, Clock,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRegion } from "@/lib/region";
import { useWishlist } from "@/lib/wishlist";
import { useNotifications } from "@/lib/notifications";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useProducts } from "@/lib/use-products";
import { useCart } from "@/lib/cart";
import { ProductCard } from "@/components/site/ProductCard";

export const Route = createFileRoute("/account_/history")({
  head: () => ({ meta: [{ title: "History — FoundOurMarket™" }] }),
  component: HistoryPage,
});

type Order = {
  id: string;
  status: string;
  total: number;
  currency: string;
  created_at: string;
  tracking_number: string | null;
  order_items: { name: string; quantity: number; image: string | null }[];
};

const ease = [0.16, 1, 0.3, 1] as const;
const SEARCH_KEY = "fom_search_history";

function readSearchHistory(): { q: string; ts: number }[] {
  try {
    const raw = localStorage.getItem(SEARCH_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => x && typeof x.q === "string") : [];
  } catch {
    return [];
  }
}

const TRENDING = ["denim jacket", "leather boots", "ceramic mug", "linen shirt", "wool scarf", "sneakers"];

type FilterKey = "all" | "orders" | "wishlist" | "viewed" | "searches" | "notifications";
const FILTERS: { key: FilterKey; label: string; icon: typeof Package }[] = [
  { key: "all", label: "All", icon: Sparkles },
  { key: "orders", label: "Orders", icon: Package },
  { key: "wishlist", label: "Wishlist", icon: Heart },
  { key: "viewed", label: "Viewed", icon: Eye },
  { key: "searches", label: "Searches", icon: Search },
  { key: "notifications", label: "Alerts", icon: Bell },
];

const STATUS_STEPS: Record<string, number> = {
  pending: 20, processing: 40, shipped: 65, in_transit: 80, delivered: 100, cancelled: 0, refunded: 0,
};

function Counter({ value }: { value: number }) {
  const mv = useMotionValue(0);
  const display = useTransform(mv, (v) => Math.round(v).toLocaleString());
  useEffect(() => {
    const ctrl = animate(mv, value, { duration: 1.1, ease });
    return () => ctrl.stop();
  }, [value, mv]);
  return <motion.span>{display}</motion.span>;
}

function HistoryPage() {
  const { user, loading } = useAuth();
  const { format } = useRegion();
  const nav = useNavigate();
  const { slugs: recentSlugs, clear: clearRecent } = useRecentlyViewed();
  const { slugs: wishSlugs } = useWishlist();
  const { items: notifications } = useNotifications();
  const { products } = useProducts();
  const { add } = useCart();

  const [orders, setOrders] = useState<Order[] | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [searchHistory, setSearchHistory] = useState<{ q: string; ts: number }[]>([]);
  const recentScroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  useEffect(() => { setSearchHistory(readSearchHistory()); }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("orders")
      .select("id,status,total,currency,created_at,tracking_number,order_items(name,quantity,image)")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => { if (!cancelled) setOrders((data as Order[]) ?? []); });
    return () => { cancelled = true; };
  }, [user]);

  const productMap = useMemo(() => new Map(products.map((p) => [p.slug, p])), [products]);

  const recentProducts = useMemo(
    () => recentSlugs.map((s) => productMap.get(s)).filter(Boolean).slice(0, 12),
    [recentSlugs, productMap],
  );
  const wishProducts = useMemo(
    () => Array.from(wishSlugs).map((s) => productMap.get(s)).filter(Boolean).slice(0, 8),
    [wishSlugs, productMap],
  );

  type TimelineItem = {
    id: string;
    kind: FilterKey;
    title: string;
    sub?: string;
    ts: number;
    icon: typeof Package;
    href?: string;
    image?: string | null;
    badge?: string;
  };

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    (orders ?? []).forEach((o) => {
      const s = String(o.status).toLowerCase();
      items.push({
        id: `o-${o.id}`,
        kind: "orders",
        title: s === "delivered" ? "Order delivered" : s === "shipped" ? "Order shipped" : "Order placed",
        sub: `#${o.id.slice(0, 8)} · ${format(Number(o.total))}`,
        ts: new Date(o.created_at).getTime(),
        icon: Package,
        href: `/orders/${o.id}`,
        image: o.order_items?.[0]?.image ?? null,
        badge: o.status,
      });
    });
    recentSlugs.slice(0, 10).forEach((slug, i) => {
      const p = productMap.get(slug);
      if (!p) return;
      items.push({
        id: `v-${slug}`,
        kind: "viewed",
        title: "Viewed product",
        sub: p.name,
        ts: Date.now() - (i + 1) * 1000 * 60 * 30,
        icon: Eye,
        href: `/products/${slug}`,
        image: p.image,
      });
    });
    Array.from(wishSlugs).slice(0, 10).forEach((slug, i) => {
      const p = productMap.get(slug);
      if (!p) return;
      items.push({
        id: `w-${slug}`,
        kind: "wishlist",
        title: "Saved to wishlist",
        sub: p.name,
        ts: Date.now() - (i + 1) * 1000 * 60 * 90,
        icon: Heart,
        href: `/products/${slug}`,
        image: p.image,
      });
    });
    searchHistory.slice(0, 10).forEach((s) => {
      items.push({
        id: `s-${s.q}-${s.ts}`,
        kind: "searches",
        title: "Search performed",
        sub: `"${s.q}"`,
        ts: s.ts,
        icon: Search,
        href: `/search?q=${encodeURIComponent(s.q)}`,
      });
    });
    notifications.slice(0, 10).forEach((n) => {
      items.push({
        id: `n-${n.id}`,
        kind: "notifications",
        title: n.title,
        sub: n.body ?? undefined,
        ts: new Date(n.created_at).getTime(),
        icon: Bell,
        href: n.link ?? undefined,
      });
    });
    return items.sort((a, b) => b.ts - a.ts);
  }, [orders, recentSlugs, wishSlugs, productMap, searchHistory, notifications, format]);

  const filtered = filter === "all" ? timeline : timeline.filter((t) => t.kind === filter);

  const stats = [
    { label: "Orders", value: (orders ?? []).length, icon: Package },
    { label: "Viewed", value: recentSlugs.length, icon: Eye },
    { label: "Wishlist", value: wishSlugs.size, icon: Heart },
    { label: "Searches", value: searchHistory.length, icon: Search },
  ];

  function clearSearches() {
    try { localStorage.removeItem(SEARCH_KEY); } catch { /* ignore */ }
    setSearchHistory([]);
  }

  function scrollRecent(dir: -1 | 1) {
    const el = recentScroller.current;
    if (!el) return;
    el.scrollBy({ left: el.clientWidth * 0.85 * dir, behavior: "smooth" });
  }

  if (loading || !user) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen pb-32 md:pb-16">
      {/* Ambient glow */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-20 h-[420px] -z-10 blur-3xl opacity-60" style={{ background: "var(--gradient-ember-soft)" }} />

      <div className="container-page max-w-5xl py-8 sm:py-12">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
          <div className="flex items-center justify-between mb-3">
            <Link to="/account" className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors">
              <ChevronLeft className="size-3" /> Account
            </Link>
            <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent">Activity Center</span>
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-display tracking-tight">History</h1>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-xl">
            A cinematic timeline of everything you've explored, saved, searched and purchased.
          </p>
          <div className="mt-6 h-px w-full relative overflow-hidden">
            <motion.div
              initial={{ x: "-100%" }} animate={{ x: "100%" }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
              className="absolute inset-y-0 left-0 w-2/3 bg-gradient-to-r from-transparent via-accent/70 to-transparent"
            />
          </div>
        </motion.div>

        {/* Overview cards */}
        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.05, duration: 0.5, ease }}
              whileHover={{ y: -4 }}
              className="group relative glass-strong rounded-2xl p-4 sm:p-5 ring-1 ring-white/10 overflow-hidden"
            >
              <div aria-hidden className="absolute -inset-px rounded-[inherit] opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: "var(--gradient-ember-soft)", filter: "blur(20px)" }} />
              <div className="relative flex items-center justify-between mb-3">
                <span className="size-9 grid place-items-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/30">
                  <s.icon className="size-4" />
                </span>
                <Sparkles className="size-3 text-accent/60" />
              </div>
              <p className="relative text-2xl sm:text-3xl font-display font-semibold tabular-nums">
                <Counter value={s.value} />
              </p>
              <p className="relative text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground mt-1">{s.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Filters */}
        <div className="mt-8 -mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto scrollbar-hide">
          <div className="flex gap-2 min-w-max">
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`relative inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[11px] font-mono uppercase tracking-widest transition-all ${
                    active
                      ? "bg-accent text-accent-foreground shadow-[0_0_24px_-4px_var(--color-accent)]"
                      : "glass border border-white/10 text-muted-foreground hover:text-foreground hover:border-accent/40"
                  }`}
                >
                  <f.icon className="size-3.5" />
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Timeline */}
        <section className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg sm:text-xl font-display tracking-tight inline-flex items-center gap-2">
              <Clock className="size-4 text-accent" /> Timeline
            </h2>
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{filtered.length} events</span>
          </div>

          {orders === null ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 rounded-2xl bg-card/50 border border-border animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState filter={filter} />
          ) : (
            <ol className="relative pl-6 sm:pl-8">
              <div aria-hidden className="absolute left-2 sm:left-3 top-2 bottom-2 w-px bg-gradient-to-b from-accent/60 via-white/10 to-transparent" />
              <AnimatePresence initial={false}>
                {filtered.slice(0, 40).map((it, i) => {
                  const order = (orders ?? []).find((o) => `o-${o.id}` === it.id);
                  const step = order ? STATUS_STEPS[String(order.status).toLowerCase()] ?? 50 : null;
                  const content = (
                    <div className="group relative glass rounded-2xl p-4 sm:p-5 ring-1 ring-white/10 hover:ring-accent/40 transition-all overflow-hidden">
                      <div aria-hidden className="absolute -inset-px rounded-[inherit] opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: "var(--gradient-ember-soft)", filter: "blur(24px)" }} />
                      <div className="relative flex items-center gap-3">
                        {it.image ? (
                          <img loading="lazy" decoding="async" src={it.image} alt="" className="size-12 rounded-xl object-cover ring-1 ring-white/10 shrink-0" />
                        ) : (
                          <span className="size-12 grid place-items-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/30 shrink-0">
                            <it.icon className="size-5" />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{it.title}</p>
                            {it.badge && (
                              <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-accent/15 text-accent ring-1 ring-accent/30">
                                {it.badge}
                              </span>
                            )}
                          </div>
                          {it.sub && <p className="text-xs text-muted-foreground truncate mt-0.5">{it.sub}</p>}
                          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 mt-1">
                            {timeAgo(it.ts)}
                          </p>
                        </div>
                        {it.href && <ArrowRight className="size-4 text-muted-foreground group-hover:text-accent group-hover:translate-x-0.5 transition-all shrink-0" />}
                      </div>
                      {step !== null && (
                        <div className="relative mt-3 h-1 rounded-full bg-white/5 overflow-hidden">
                          <motion.div initial={{ width: 0 }} animate={{ width: `${step}%` }} transition={{ duration: 0.8, ease }} className="h-full bg-gradient-to-r from-accent to-accent/60" />
                        </div>
                      )}
                    </div>
                  );
                  return (
                    <motion.li
                      key={it.id}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      transition={{ delay: Math.min(i * 0.03, 0.4), duration: 0.4, ease }}
                      className="relative mb-3"
                    >
                      <span className="absolute -left-[22px] sm:-left-[26px] top-5 size-3 rounded-full bg-accent shadow-[0_0_12px_var(--color-accent)] ring-4 ring-background" />
                      {it.href ? (
                        it.href.startsWith("/") ? (
                          <Link to={it.href} className="block">{content}</Link>
                        ) : (
                          <a href={it.href} className="block">{content}</a>
                        )
                      ) : content}
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ol>
          )}
        </section>

        {/* Search history */}
        <section className="mt-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg sm:text-xl font-display tracking-tight inline-flex items-center gap-2">
              <Search className="size-4 text-accent" /> Search history
            </h2>
            {searchHistory.length > 0 && (
              <button onClick={clearSearches} className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors">
                <X className="size-3" /> Clear
              </button>
            )}
          </div>
          <div className="glass rounded-2xl p-4 sm:p-5 ring-1 ring-white/10">
            {searchHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No searches yet. Try the search bar to explore.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {searchHistory.slice(0, 12).map((s) => (
                  <Link
                    key={s.q + s.ts}
                    to="/search"
                    search={{ q: s.q } as never}
                    className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 ring-1 ring-white/10 text-xs hover:bg-accent/15 hover:ring-accent/40 transition-all"
                  >
                    <Clock className="size-3 text-muted-foreground group-hover:text-accent" />
                    <span className="truncate max-w-[180px]">{s.q}</span>
                  </Link>
                ))}
              </div>
            )}
            <div className="mt-5 pt-4 border-t border-white/10">
              <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground mb-3 inline-flex items-center gap-1.5">
                <TrendingUp className="size-3 text-accent" /> Trending now
              </p>
              <div className="flex flex-wrap gap-2">
                {TRENDING.map((t) => (
                  <Link
                    key={t}
                    to="/search"
                    search={{ q: t } as never}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/10 ring-1 ring-accent/30 text-xs text-accent hover:bg-accent hover:text-accent-foreground transition-all"
                  >
                    <Sparkles className="size-3" />
                    {t}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Recently viewed removed */}

        {/* Wishlist preview */}
        {wishProducts.length > 0 && (
          <section className="mt-12">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg sm:text-xl font-display tracking-tight inline-flex items-center gap-2">
                <Heart className="size-4 text-accent" /> Wishlist activity
              </h2>
              <Link to="/wishlist" className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-accent inline-flex items-center gap-1">
                View all <ArrowRight className="size-3" />
              </Link>
            </div>
            <div data-product-grid className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
              {wishProducts.map((p) => (
                <ProductCard key={p!.id ?? p!.slug} product={p!} />
              ))}
            </div>
          </section>
        )}

        {/* Order history detail */}
        <section className="mt-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg sm:text-xl font-display tracking-tight inline-flex items-center gap-2">
              <Package className="size-4 text-accent" /> Recent orders
            </h2>
            <Link to="/account/orders" className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-accent inline-flex items-center gap-1">
              All orders <ArrowRight className="size-3" />
            </Link>
          </div>
          {orders === null ? (
            <div className="h-24 rounded-2xl bg-card/50 border border-border animate-pulse" />
          ) : orders.length === 0 ? (
            <EmptyState filter="orders" />
          ) : (
            <ul className="space-y-3">
              {orders.slice(0, 4).map((o, i) => {
                const step = STATUS_STEPS[String(o.status).toLowerCase()] ?? 50;
                return (
                  <motion.li key={o.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                    <Link to="/orders/$id" params={{ id: o.id }} className="group block glass rounded-2xl p-4 sm:p-5 ring-1 ring-white/10 hover:ring-accent/40 transition-all relative overflow-hidden">
                      <div aria-hidden className="absolute -inset-px rounded-[inherit] opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: "var(--gradient-ember-soft)", filter: "blur(24px)" }} />
                      <div className="relative flex items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex -space-x-2 shrink-0">
                            {o.order_items.slice(0, 3).map((it, idx) =>
                              it.image ? (
                                <img loading="lazy" decoding="async" key={idx} src={it.image} alt="" className="size-10 rounded-full border-2 border-background object-cover" />
                              ) : (
                                <div key={idx} className="size-10 rounded-full border-2 border-background bg-muted grid place-items-center text-[9px]">{idx + 1}</div>
                              )
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">#{o.id.slice(0, 8)}</p>
                            <p className="text-[11px] text-muted-foreground">{new Date(o.created_at).toLocaleDateString()} · {o.order_items.length} item{o.order_items.length !== 1 ? "s" : ""}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono text-sm tabular-nums">{format(Number(o.total))}</p>
                          <p className="text-[10px] uppercase tracking-widest text-accent">{o.status}</p>
                        </div>
                      </div>
                      <div className="relative h-1 rounded-full bg-white/5 overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${step}%` }} transition={{ duration: 0.9, ease }} className="h-full bg-gradient-to-r from-accent to-accent/60 shadow-[0_0_12px_var(--color-accent)]" />
                      </div>
                    </Link>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function EmptyState({ filter }: { filter: FilterKey }) {
  const copy: Record<FilterKey, { title: string; sub: string; cta: string; to: string }> = {
    all: { title: "Your story starts here", sub: "Browse, save, and shop to fill your history.", cta: "Explore the market", to: "/" },
    orders: { title: "No orders yet", sub: "Once you check out, your orders will appear here.", cta: "Start shopping", to: "/" },
    wishlist: { title: "Nothing saved yet", sub: "Tap the heart on a product to save it for later.", cta: "Browse products", to: "/" },
    viewed: { title: "Nothing viewed yet", sub: "Tap into a product to begin your trail.", cta: "Discover items", to: "/" },
    searches: { title: "No searches yet", sub: "Try searching for something you love.", cta: "Open search", to: "/search" },
    notifications: { title: "All caught up", sub: "We'll ping you here when something happens.", cta: "Go home", to: "/" },
  };
  const c = copy[filter];
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative glass-strong rounded-3xl p-10 sm:p-14 text-center ring-1 ring-white/10 overflow-hidden">
      <div aria-hidden className="absolute inset-0 -z-10 opacity-70" style={{ background: "var(--gradient-ember-soft)" }} />
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease }}
        className="size-16 mx-auto mb-5 grid place-items-center rounded-2xl bg-accent/15 ring-1 ring-accent/30 text-accent shadow-[0_0_40px_-10px_var(--color-accent)]"
      >
        <Sparkles className="size-6" />
      </motion.div>
      <p className="text-lg font-display">{c.title}</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">{c.sub}</p>
      <Link to={c.to} className="mt-5 inline-flex items-center gap-1.5 bg-accent text-accent-foreground px-5 py-2.5 rounded-full text-xs uppercase tracking-widest font-bold hover:brightness-110 transition-all shadow-[0_0_24px_-4px_var(--color-accent)]">
        {c.cta} <ArrowRight className="size-3" />
      </Link>
    </motion.div>
  );
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}
