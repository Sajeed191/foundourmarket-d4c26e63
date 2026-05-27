import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, Package, Search, ArrowRight, Calendar, ArrowLeft, ShoppingBag, Bell,
  Truck, CheckCircle2, Clock, RotateCcw, XCircle, Sparkles, ShieldCheck, Mic,
  X, FileText, HelpCircle, RefreshCw, MapPin, Star, Zap, TrendingUp, Tag, Gift, Flame,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRegion } from "@/lib/region";
import { useCart } from "@/lib/cart";
import { RecommendationStrip } from "@/components/site/RecommendationStrip";
import { fetchPersonalizedSlugs, fetchTrendingSlugs } from "@/lib/personalization";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useCategories } from "@/lib/use-categories";

export const Route = createFileRoute("/account_/orders")({
  head: () => ({ meta: [{ title: "Your Orders — FoundOurMarket™" }] }),
  component: OrdersPage,
});

type Order = {
  id: string;
  status: string;
  total: number;
  currency: string;
  created_at: string;
  tracking_number: string | null;
  carrier: string | null;
  payment_status: string | null;
  order_items: { name: string; quantity: number; image: string | null; product_slug: string }[];
};

const FILTERS = [
  { id: "all", label: "All", icon: Package },
  { id: "active", label: "Active", icon: Truck },
  { id: "delivered", label: "Delivered", icon: CheckCircle2 },
  { id: "returning", label: "Returning", icon: RotateCcw },
  { id: "cancelled", label: "Cancelled", icon: XCircle },
  { id: "refunded", label: "Refunded", icon: RefreshCw },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

const DATE_PRESETS = [
  { id: "any", label: "Anytime" },
  { id: "30d", label: "30 days" },
  { id: "3m", label: "3 months" },
  { id: "6m", label: "6 months" },
  { id: "year", label: "This year" },
  { id: "custom", label: "Custom" },
] as const;
type DatePreset = (typeof DATE_PRESETS)[number]["id"];

const STATUS_META: Record<string, { step: number; label: string; color: string }> = {
  pending: { step: 15, label: "Confirming", color: "text-amber-400" },
  processing: { step: 35, label: "Packing", color: "text-amber-400" },
  shipped: { step: 60, label: "Shipped", color: "text-sky-400" },
  in_transit: { step: 75, label: "In transit", color: "text-sky-400" },
  out_for_delivery: { step: 90, label: "Out for delivery", color: "text-accent" },
  delivered: { step: 100, label: "Delivered", color: "text-emerald-400" },
  cancelled: { step: 0, label: "Cancelled", color: "text-rose-400" },
  refunded: { step: 0, label: "Refunded", color: "text-rose-400" },
  returning: { step: 0, label: "Returning", color: "text-amber-400" },
};

const TIMELINE = [
  { key: "confirmed", label: "Confirmed", icon: CheckCircle2, at: 15 },
  { key: "packed", label: "Packed", icon: Package, at: 35 },
  { key: "shipped", label: "Shipped", icon: Truck, at: 60 },
  { key: "ofd", label: "Out for delivery", icon: MapPin, at: 90 },
  { key: "delivered", label: "Delivered", icon: CheckCircle2, at: 100 },
];

const RECENT_KEY = "fom_orders_recent_search";

function OrdersPage() {
  const { user, loading } = useAuth();
  const { format } = useRegion();
  const cart = useCart();
  const nav = useNavigate();
  const { slugs: recentlyViewed } = useRecentlyViewed();
  const { categories } = useCategories();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFocus, setSearchFocus] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("any");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const [recSlugs, setRecSlugs] = useState<string[]>([]);
  const [trendSlugs, setTrendSlugs] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("orders")
      .select("id,status,total,currency,created_at,tracking_number,carrier,payment_status,order_items(name,quantity,image,product_slug)")
      .order("created_at", { ascending: false })
      .then(({ data }) => { if (!cancelled) setOrders((data as Order[]) ?? []); });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    try { setRecents(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]")); } catch { /* ignore */ }
    fetchPersonalizedSlugs(6).then(setRecSlugs);
    fetchTrendingSlugs(6).then(setTrendSlugs);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (searchOpen) setTimeout(() => searchRef.current?.focus(), 60);
  }, [searchOpen]);

  function commitSearch(value: string) {
    const v = value.trim();
    if (!v) return;
    const next = [v, ...recents.filter((r) => r.toLowerCase() !== v.toLowerCase())].slice(0, 6);
    setRecents(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  function startVoice() {
    const SR = (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognition; SpeechRecognition?: new () => SpeechRecognition })
      .SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognition }).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = "en-US";
    r.onresult = (e: SpeechRecognitionEvent) => {
      const t = e.results[0]?.[0]?.transcript ?? "";
      setQ(t); commitSearch(t);
    };
    r.start();
  }

  const dateRange = useMemo<[Date | null, Date | null]>(() => {
    const now = new Date();
    if (datePreset === "any") return [null, null];
    if (datePreset === "30d") return [new Date(now.getTime() - 30 * 864e5), now];
    if (datePreset === "3m") { const d = new Date(now); d.setMonth(d.getMonth() - 3); return [d, now]; }
    if (datePreset === "6m") { const d = new Date(now); d.setMonth(d.getMonth() - 6); return [d, now]; }
    if (datePreset === "year") return [new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear(), 11, 31, 23, 59, 59)];
    if (datePreset === "custom") return [customFrom ? new Date(customFrom) : null, customTo ? new Date(customTo + "T23:59:59") : null];
    return [null, null];
  }, [datePreset, customFrom, customTo]);

  const filtered = useMemo(() => {
    const list = orders ?? [];
    const [from, to] = dateRange;
    return list.filter((o) => {
      const s = String(o.status).toLowerCase();
      if (filter === "active" && ["delivered", "cancelled", "refunded", "returning"].includes(s)) return false;
      if (filter === "delivered" && s !== "delivered") return false;
      if (filter === "cancelled" && s !== "cancelled") return false;
      if (filter === "refunded" && s !== "refunded") return false;
      if (filter === "returning" && s !== "returning") return false;
      const created = new Date(o.created_at);
      if (from && created < from) return false;
      if (to && created > to) return false;
      if (q) {
        const n = q.toLowerCase();
        if (!o.id.toLowerCase().includes(n) && !o.order_items.some((i) => i.name.toLowerCase().includes(n))) return false;
      }
      return true;
    });
  }, [orders, q, filter, dateRange]);

  const activity = useMemo(() => {
    const list = orders ?? [];
    const out: { id: string; icon: typeof Truck; tone: string; title: string; sub: string }[] = [];
    for (const o of list.slice(0, 6)) {
      const s = String(o.status).toLowerCase();
      const first = o.order_items[0]?.name ?? "Order";
      if (s === "out_for_delivery") out.push({ id: o.id, icon: Truck, tone: "text-accent", title: "Arriving today", sub: `${first} · #${o.id.slice(0, 8)}` });
      else if (s === "shipped" || s === "in_transit") out.push({ id: o.id, icon: Truck, tone: "text-sky-400", title: "On the way", sub: `${first} · #${o.id.slice(0, 8)}` });
      else if (s === "delivered") out.push({ id: o.id, icon: CheckCircle2, tone: "text-emerald-400", title: "Delivered", sub: `${first} · rate your purchase` });
      else if (s === "refunded") out.push({ id: o.id, icon: RefreshCw, tone: "text-emerald-400", title: "Refund completed", sub: `#${o.id.slice(0, 8)}` });
    }
    return out.slice(0, 3);
  }, [orders]);

  if (loading || !user) {
    return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }

  const cartCount = cart.items.reduce((n, i) => n + i.qty, 0);
  const dateLabel = DATE_PRESETS.find((d) => d.id === datePreset)?.label ?? "Anytime";

  return (
    <div className="min-h-screen bg-background relative">
      {/* ambient depth */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 h-[520px] -z-10 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(255,122,0,0.12),transparent_70%)]" />
      <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0 h-[360px] -z-10 bg-[radial-gradient(50%_50%_at_50%_100%,rgba(255,122,0,0.06),transparent_70%)]" />
      <div aria-hidden className="pointer-events-none fixed -left-24 top-1/3 size-72 -z-10 rounded-full bg-accent/5 blur-3xl" />
      <div aria-hidden className="pointer-events-none fixed -right-24 top-2/3 size-72 -z-10 rounded-full bg-amber-300/5 blur-3xl" />

      {/* Sticky smart header */}
      <header className={`sticky top-0 z-40 transition-all duration-300 ${scrolled ? "backdrop-blur-xl bg-background/75 border-b border-border/60 shadow-[0_8px_30px_-12px_rgba(255,122,0,0.18)]" : "bg-transparent"}`}>
        <div className={`container-page max-w-5xl flex items-center gap-2 transition-all ${scrolled ? "py-2" : "py-3"}`}>
          <Link to="/account" aria-label="Back" className="size-10 grid place-items-center rounded-full border border-border/60 hover:border-accent/50 active:scale-95 transition">
            <ArrowLeft className="size-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-mono uppercase tracking-[0.3em] text-accent/80 leading-none">Account</p>
            <h1 className={`font-display font-semibold tracking-tight truncate transition-all ${scrolled ? "text-base" : "text-lg"}`}>Your orders</h1>
          </div>
          <button onClick={() => setSearchOpen((s) => !s)} aria-label="Search orders"
            className={`size-10 grid place-items-center rounded-full border transition active:scale-95 ${searchOpen ? "border-accent text-accent bg-accent/10" : "border-border/60 hover:border-accent/50"}`}>
            <Search className="size-4" />
          </button>
          <Link to="/account/notifications" aria-label="Notifications" className="size-10 grid place-items-center rounded-full border border-border/60 hover:border-accent/50 active:scale-95 transition">
            <Bell className="size-4" />
          </Link>
          <Link to="/cart" aria-label="Cart" className="relative size-10 grid place-items-center rounded-full border border-border/60 hover:border-accent/50 active:scale-95 transition">
            <ShoppingBag className="size-4" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-accent text-accent-foreground text-[9px] font-bold grid place-items-center shadow-[0_0_10px_rgba(255,122,0,0.6)]">
                {cartCount}
              </span>
            )}
          </Link>
        </div>

        {/* Inline smart search panel */}
        <AnimatePresence>
          {searchOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="container-page max-w-5xl overflow-hidden"
            >
              <div className="pb-3">
                <div className={`relative rounded-2xl border transition-all ${searchFocus ? "border-accent shadow-[0_0_0_4px_rgba(255,122,0,0.12)]" : "border-border/60"} bg-card/60 backdrop-blur`}>
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <input
                    ref={searchRef}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onFocus={() => setSearchFocus(true)}
                    onBlur={() => setSearchFocus(false)}
                    onKeyDown={(e) => { if (e.key === "Enter") commitSearch(q); }}
                    placeholder="Search order ID, product, seller…"
                    className="w-full bg-transparent pl-11 pr-24 py-3.5 text-sm outline-none"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {q && (
                      <button onClick={() => setQ("")} className="size-8 grid place-items-center rounded-full hover:bg-muted/40" aria-label="Clear">
                        <X className="size-3.5 text-muted-foreground" />
                      </button>
                    )}
                    <button onClick={startVoice} className="size-8 grid place-items-center rounded-full hover:bg-accent/10 text-accent" aria-label="Voice search">
                      <Mic className="size-4" />
                    </button>
                  </div>
                </div>
                {recents.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mr-1 self-center">Recent</span>
                    {recents.map((r) => (
                      <button key={r} onClick={() => { setQ(r); commitSearch(r); }}
                        className="px-3 py-1 rounded-full text-[11px] bg-card/60 border border-border/60 hover:border-accent/50 hover:text-accent transition">
                        {r}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <div className="container-page max-w-5xl pb-16 pt-3">
        {/* Sticky filter + date rail */}
        <div className={`sticky z-30 -mx-4 px-4 pt-2 pb-2 mb-3 transition-all ${scrolled ? "top-[52px] bg-background/85 backdrop-blur-xl border-b border-border/40" : "top-[64px] bg-background/60 backdrop-blur-md"}`}>
          <div className="overflow-x-auto no-scrollbar snap-x snap-mandatory">
            <div className="flex gap-1.5 w-max">
              {FILTERS.map((f) => {
                const Icon = f.icon;
                const active = filter === f.id;
                return (
                  <motion.button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    whileTap={{ scale: 0.94 }}
                    className={`relative snap-start inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[11px] uppercase tracking-widest font-mono whitespace-nowrap transition-all ${
                      active
                        ? "bg-accent text-accent-foreground shadow-[0_0_18px_rgba(255,122,0,0.5)]"
                        : "bg-card/60 border border-border/60 text-muted-foreground hover:text-foreground hover:border-accent/40"
                    }`}
                  >
                    {active && (
                      <motion.span layoutId="orders-filter-pill" aria-hidden
                        className="absolute inset-0 rounded-full ring-1 ring-accent/40" transition={{ type: "spring", stiffness: 380, damping: 30 }} />
                    )}
                    <Icon className="size-3 relative" />
                    <span className="relative">{f.label}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>
          <div className="overflow-x-auto no-scrollbar mt-2">
            <div className="flex items-center gap-1.5 w-max">
              <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground mr-1">
                <Calendar className="size-3 text-accent" /> Date
              </span>
              {DATE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setDatePreset(p.id)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-mono transition-all whitespace-nowrap active:scale-95 ${
                    datePreset === p.id ? "bg-accent/15 text-accent border border-accent/40" : "bg-card/40 border border-border/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {datePreset === "custom" && (
          <div className="flex flex-col sm:flex-row gap-2 mb-5">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl bg-card/60 border border-border/60 text-sm focus:border-accent outline-none" />
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl bg-card/60 border border-border/60 text-sm focus:border-accent outline-none" />
          </div>
        )}

        {/* Quick actions — premium glass tiles */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-5">
          {[
            { icon: Truck, label: "Track", to: "/track" as const, tint: "from-sky-500/20 to-sky-500/0" },
            { icon: RotateCcw, label: "Return", to: "/returns" as const, tint: "from-amber-500/20 to-amber-500/0" },
            { icon: HelpCircle, label: "Support", to: "/help" as const, tint: "from-violet-500/20 to-violet-500/0" },
            { icon: FileText, label: "Invoices", to: "/account/history" as const, tint: "from-emerald-500/20 to-emerald-500/0" },
            { icon: RefreshCw, label: "Reorder", to: "/cart" as const, tint: "from-accent/25 to-accent/0" },
            { icon: ShieldCheck, label: "Protection", to: "/returns" as const, tint: "from-rose-500/20 to-rose-500/0" },
          ].map((a, i) => {
            const Icon = a.icon;
            return (
              <motion.div key={a.label}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * i, duration: 0.3 }}>
                <Link to={a.to}
                  className="group relative flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl bg-card/50 border border-border/50 backdrop-blur-md hover:border-accent/40 hover:bg-card/70 active:scale-95 transition-all overflow-hidden">
                  <span aria-hidden className={`absolute inset-0 -z-10 opacity-60 bg-gradient-to-b ${a.tint}`} />
                  <span aria-hidden className="absolute -top-6 left-1/2 -translate-x-1/2 size-12 rounded-full bg-accent/10 blur-xl opacity-0 group-hover:opacity-100 transition" />
                  <motion.span whileHover={{ y: -2, rotate: -4 }} transition={{ type: "spring", stiffness: 400, damping: 18 }}
                    className="size-9 grid place-items-center rounded-xl bg-gradient-to-br from-accent/25 to-accent/5 text-accent ring-1 ring-accent/20 group-hover:shadow-[0_0_18px_rgba(255,122,0,0.45)] transition">
                    <Icon className="size-4" />
                  </motion.span>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground group-hover:text-foreground">{a.label}</span>
                </Link>
              </motion.div>
            );
          })}
        </div>

        {/* Smart insights — engagement & conversion feed */}
        <SmartInsights />


        {/* Recent activity */}
        {activity.length > 0 && (
          <div className="mb-5 space-y-2">
            {activity.map((a, i) => {
              const Icon = a.icon;
              return (
                <motion.div key={a.id + i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-card/50 border border-border/50 backdrop-blur">
                  <span className={`size-8 grid place-items-center rounded-full bg-background/60 border border-border/60 ${a.tone}`}>
                    <Icon className="size-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{a.title}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{a.sub}</p>
                  </div>
                  <Link to="/orders/$id" params={{ id: a.id }} className="text-[10px] font-mono uppercase tracking-widest text-accent">View</Link>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Results summary */}
        {(orders?.length ?? 0) > 0 && (
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">
            {filtered.length} order{filtered.length !== 1 ? "s" : ""} · {dateLabel}
          </p>
        )}

        {/* List / loading / empty */}
        {orders === null ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-36 rounded-2xl bg-card/40 border border-border/40 relative overflow-hidden">
                <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            isFiltered={!!q || filter !== "all" || datePreset !== "any"}
            recSlugs={recSlugs}
            trendSlugs={trendSlugs}
            onClearFilters={() => { setQ(""); setFilter("all"); setDatePreset("any"); }}
          />
        ) : (
          <ul className="space-y-3">
            {filtered.map((o, i) => (
              <OrderCard key={o.id} order={o} index={i} format={format} />
            ))}
          </ul>
        )}

        {/* Trust strip — compact */}
        <div className="mt-7 grid grid-cols-4 gap-1.5 sm:gap-2">
          {[
            { icon: ShieldCheck, label: "Buyer Protection" },
            { icon: CheckCircle2, label: "Verified Sellers" },
            { icon: RotateCcw, label: "Easy Returns" },
            { icon: Truck, label: "Tracked Shipping" },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <div key={t.label} className="flex flex-col items-center text-center gap-1 px-2 py-2 rounded-xl bg-card/40 border border-border/40 backdrop-blur">
                <Icon className="size-3.5 text-accent shrink-0" />
                <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground leading-tight truncate w-full">{t.label}</span>
              </div>
            );
          })}
        </div>

        {/* Curated bottom rails — keep the experience alive */}
        {(orders?.length ?? 0) > 0 && (
          <div className="mt-2 space-y-2">
            <CategoryRail categories={categories} />
            {recentlyViewed.length > 0 && (
              <RecommendationStrip title="Continue shopping" subtitle="Pick up where you left off" slugs={recentlyViewed.slice(0, 8)} icon={<Clock className="size-3" />} />
            )}
            {recSlugs.length > 0 && (
              <RecommendationStrip title="Recommended for you" subtitle="Curated from your taste" slugs={recSlugs} icon={<Sparkles className="size-3" />} />
            )}
            {trendSlugs.length > 0 && (
              <RecommendationStrip title="Trending now" subtitle="What everyone is loving" slugs={trendSlugs} icon={<Flame className="size-3" />} />
            )}
          </div>
        )}
      </div>


      <style>{`
        @keyframes shimmer { 100% { transform: translateX(100%); } }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { scrollbar-width: none; }
      `}</style>
    </div>
  );
}

function OrderCard({ order, index, format }: { order: Order; index: number; format: (n: number) => string }) {
  const s = String(order.status).toLowerCase();
  const meta = STATUS_META[s] ?? { step: 50, label: order.status, color: "text-muted-foreground" };
  const first = order.order_items[0];
  const more = order.order_items.length - 1;
  const delivered = s === "delivered";
  const cancelled = s === "cancelled" || s === "refunded";

  return (
    <motion.li
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35, ease: [0.22, 0.9, 0.3, 1] }}
    >
      <div className="group relative rounded-2xl border border-border/60 bg-card/50 backdrop-blur p-4 sm:p-5 hover:border-accent/40 hover:shadow-[0_10px_40px_-15px_rgba(255,122,0,0.35)] transition-all">
        {/* header row */}
        <div className="flex items-center gap-3 mb-3">
          <Link to="/orders/$id" params={{ id: order.id }} className="relative shrink-0">
            {first?.image ? (
              <img src={first.image} alt="" loading="lazy" className="size-16 rounded-xl object-cover border border-border/60" />
            ) : (
              <div className="size-16 rounded-xl border border-border/60 bg-muted grid place-items-center">
                <Package className="size-5 text-muted-foreground" />
              </div>
            )}
            {more > 0 && (
              <span className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-full bg-background border border-border text-[9px] font-mono">
                +{more}
              </span>
            )}
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full bg-background/60 border border-border/60 ${meta.color}`}>
                <span className={`size-1.5 rounded-full ${delivered ? "bg-emerald-400" : cancelled ? "bg-rose-400" : "bg-accent animate-pulse"}`} />
                {meta.label}
              </span>
              <span className="inline-flex items-center gap-1 text-[9px] font-mono text-emerald-400/90">
                <ShieldCheck className="size-2.5" /> Verified
              </span>
            </div>
            <Link to="/orders/$id" params={{ id: order.id }} className="block">
              <p className="text-sm font-medium truncate group-hover:text-accent transition">{first?.name ?? "Order"}</p>
              <p className="text-[11px] text-muted-foreground truncate font-mono">
                #{order.id.slice(0, 8)} · {new Date(order.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </Link>
          </div>
          <div className="text-right shrink-0">
            <p className="font-mono text-sm font-semibold">{format(Number(order.total))}</p>
            <p className="text-[10px] text-muted-foreground">{order.order_items.length} item{order.order_items.length !== 1 ? "s" : ""}</p>
          </div>
        </div>

        {/* timeline */}
        {!cancelled && (
          <div className="relative mb-3">
            <div className="absolute left-0 right-0 top-3 h-px bg-border/60" />
            <div
              className="absolute left-0 top-3 h-px bg-gradient-to-r from-accent to-amber-300 shadow-[0_0_8px_rgba(255,122,0,0.6)] transition-all duration-700"
              style={{ width: `${meta.step}%` }}
            />
            <ol className="relative grid grid-cols-5 gap-1">
              {TIMELINE.map((t) => {
                const done = meta.step >= t.at;
                const active = meta.step >= t.at && meta.step < (TIMELINE[TIMELINE.indexOf(t) + 1]?.at ?? 101);
                const Icon = t.icon;
                return (
                  <li key={t.key} className="flex flex-col items-center text-center">
                    <span className={`size-6 grid place-items-center rounded-full border-2 bg-card transition-all ${
                      done ? "border-accent text-accent" : "border-border/60 text-muted-foreground"
                    } ${active ? "shadow-[0_0_12px_rgba(255,122,0,0.6)] scale-110" : ""}`}>
                      <Icon className="size-2.5" />
                    </span>
                    <span className={`mt-1 text-[8px] font-mono uppercase tracking-wider leading-tight ${done ? "text-foreground" : "text-muted-foreground"}`}>
                      {t.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {/* meta row */}
        <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground mb-3">
          {order.carrier && (
            <span className="inline-flex items-center gap-1"><Truck className="size-3" /> {order.carrier}</span>
          )}
          {order.tracking_number && (
            <span className="inline-flex items-center gap-1 truncate"><Clock className="size-3" /> {order.tracking_number}</span>
          )}
          {!order.tracking_number && !order.carrier && !cancelled && (
            <span className="inline-flex items-center gap-1"><Clock className="size-3" /> ETA in 3–5 days</span>
          )}
        </div>

        {/* actions */}
        <div className="flex flex-wrap gap-1.5">
          <Link to="/orders/$id" params={{ id: order.id }}
            className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full bg-accent text-accent-foreground hover:shadow-[0_0_14px_rgba(255,122,0,0.5)] active:scale-95 transition">
            Track <ArrowRight className="size-3" />
          </Link>
          {first?.product_slug && (
            <Link to="/products/$slug" params={{ slug: first.product_slug }}
              className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full border border-border/60 hover:border-accent/40 hover:text-accent active:scale-95 transition">
              Buy again
            </Link>
          )}
          {delivered && (
            <>
              <Link to="/returns"
                className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full border border-border/60 hover:border-accent/40 hover:text-accent active:scale-95 transition">
                <RotateCcw className="size-3" /> Return
              </Link>
              {first?.product_slug && (
                <Link to="/products/$slug" params={{ slug: first.product_slug }} hash="reviews"
                  className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full border border-border/60 hover:border-accent/40 hover:text-accent active:scale-95 transition">
                  <Star className="size-3" /> Rate
                </Link>
              )}
            </>
          )}
          <Link to="/help"
            className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full border border-border/60 hover:border-accent/40 hover:text-accent active:scale-95 transition">
            <HelpCircle className="size-3" /> Support
          </Link>
        </div>
      </div>
    </motion.li>
  );
}

function EmptyState({
  isFiltered, recSlugs, trendSlugs, onClearFilters,
}: { isFiltered: boolean; recSlugs: string[]; trendSlugs: string[]; onClearFilters: () => void }) {
  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-b from-card/70 to-card/30 backdrop-blur p-8 sm:p-12 text-center"
      >
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(50%_60%_at_50%_0%,rgba(255,122,0,0.15),transparent_70%)]" />
        <div aria-hidden className="absolute top-6 left-1/2 -translate-x-1/2 size-32 rounded-full bg-accent/10 blur-3xl" />
        <motion.div
          animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="relative mx-auto mb-5 size-20 rounded-2xl bg-gradient-to-br from-accent/30 to-amber-300/10 border border-accent/30 grid place-items-center shadow-[0_10px_40px_-10px_rgba(255,122,0,0.5)]"
        >
          <Package className="size-9 text-accent" />
          <motion.span
            animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 2, repeat: Infinity }}
            className="absolute -top-1 -right-1"
          >
            <Sparkles className="size-4 text-amber-300" />
          </motion.span>
        </motion.div>
        <h2 className="text-xl sm:text-2xl font-display font-semibold tracking-tight">
          {isFiltered ? "No matching orders" : "Your shopping journey starts here ✨"}
        </h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
          {isFiltered
            ? "Try a different filter or clear them to see every order."
            : "Discover curated products, premium drops and unbeatable deals — all in one place."}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {isFiltered ? (
            <button onClick={onClearFilters}
              className="inline-flex items-center gap-1.5 bg-accent text-accent-foreground px-5 py-2.5 rounded-full text-xs uppercase tracking-widest font-bold shadow-[0_0_20px_rgba(255,122,0,0.45)] active:scale-95 transition">
              Clear filters
            </button>
          ) : (
            <>
              <Link to="/" className="inline-flex items-center gap-1.5 bg-accent text-accent-foreground px-5 py-2.5 rounded-full text-xs uppercase tracking-widest font-bold shadow-[0_0_20px_rgba(255,122,0,0.45)] active:scale-95 transition">
                Shop now <ArrowRight className="size-3" />
              </Link>
              <Link to="/search" className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-xs uppercase tracking-widest font-bold border border-border/60 hover:border-accent/40 hover:text-accent active:scale-95 transition">
                Explore deals
              </Link>
            </>
          )}
        </div>
      </motion.div>

      {recSlugs.length > 0 && (
        <RecommendationStrip title="Recommended for you" subtitle="Curated from your taste" slugs={recSlugs} />
      )}
      {trendSlugs.length > 0 && (
        <RecommendationStrip title="Trending now" subtitle="What everyone is loving" slugs={trendSlugs} />
      )}
    </div>
  );
}

function SmartInsights() {
  const items = [
    { icon: Zap, tone: "text-amber-300", ring: "ring-amber-300/30", title: "Flash sale ending soon", sub: "Up to 40% off curated picks", to: "/search" as const, cta: "Shop" },
    { icon: Tag, tone: "text-emerald-400", ring: "ring-emerald-400/30", title: "Price dropped on a saved item", sub: "Tap to see your new price", to: "/wishlist" as const, cta: "View" },
    { icon: Gift, tone: "text-accent", ring: "ring-accent/30", title: "Bundle & save 15%", sub: "Recommended bundle ready", to: "/" as const, cta: "Open" },
    { icon: TrendingUp, tone: "text-sky-400", ring: "ring-sky-400/30", title: "New arrivals match your taste", sub: "Fresh drops just landed", to: "/search" as const, cta: "Explore" },
  ];
  return (
    <div className="-mx-4 px-4 mb-5">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.3em] text-accent">
          <Sparkles className="size-3" /> For you
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
        </span>
      </div>
      <div className="overflow-x-auto no-scrollbar snap-x snap-mandatory">
        <div className="flex gap-2 w-max pr-4">
          {items.map((it, i) => {
            const Icon = it.icon;
            return (
              <motion.div key={it.title}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.32 }}
                className="snap-start shrink-0 w-[72%] sm:w-[44%] md:w-[28%]">
                <Link to={it.to}
                  className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-card/80 to-card/40 border border-border/50 backdrop-blur p-3 hover:border-accent/40 active:scale-[0.98] transition-all">
                  <span className={`size-10 grid place-items-center rounded-xl bg-background/60 ring-1 ${it.ring} ${it.tone} shrink-0`}>
                    <Icon className="size-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate leading-tight">{it.title}</p>
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">{it.sub}</p>
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-accent shrink-0 inline-flex items-center gap-0.5">
                    {it.cta} <ArrowRight className="size-3" />
                  </span>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CategoryRail({ categories }: { categories: { slug: string; name: string; image: string | null }[] }) {
  if (!categories?.length) return null;
  const list = categories.slice(0, 8);
  return (
    <section className="py-6 scroll-mt-24">
      <div className="flex items-end justify-between mb-3 px-1">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-1">
            <Sparkles className="size-3" /> Curated
          </div>
          <h2 className="text-lg sm:text-xl font-display font-semibold tracking-tight">Shop by category</h2>
        </div>
        <Link to="/search" className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-accent inline-flex items-center gap-1">
          All <ArrowRight className="size-3" />
        </Link>
      </div>
      <div className="-mx-4 px-4 overflow-x-auto no-scrollbar snap-x snap-mandatory">
        <div className="flex gap-2 w-max">
          {list.map((c, i) => (
            <motion.div key={c.slug}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * i }}
              className="snap-start shrink-0">
              <Link to="/category/$slug" params={{ slug: c.slug }}
                className="relative block w-28 h-32 rounded-2xl overflow-hidden border border-border/50 bg-card/40 group active:scale-95 transition">
                {c.image && <img src={c.image} alt="" loading="lazy" className="absolute inset-0 size-full object-cover opacity-70 group-hover:opacity-100 group-hover:scale-105 transition duration-500" />}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                <span className="absolute bottom-2 left-2 right-2 text-[11px] font-semibold truncate">{c.name}</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// minimal SpeechRecognition types (browser-only)
type SpeechRecognition = { lang: string; start: () => void; onresult: (e: SpeechRecognitionEvent) => void };
type SpeechRecognitionEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
