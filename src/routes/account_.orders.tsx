import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, Package, Search, ArrowRight, ArrowLeft, ShoppingBag, Bell,
  Truck, CheckCircle2, Clock, RotateCcw,
  X, HelpCircle, RefreshCw, MapPin, ChevronDown, AlertCircle, Wallet, CreditCard, Boxes,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRegion } from "@/lib/region";
import { useCart } from "@/lib/cart";
import { RecommendationStrip } from "@/components/site/RecommendationStrip";
import { fetchPersonalizedSlugs, fetchTrendingSlugs } from "@/lib/personalization";

export const Route = createFileRoute("/account_/orders")({
  head: () => ({ meta: [{ title: "Your Orders — FoundOurMarket™" }] }),
  component: OrdersPage,
});

type Item = { name: string; quantity: number; image: string | null; unit_price: number | null; product_slug: string };
type Order = {
  id: string;
  status: string;
  total: number;
  currency: string;
  created_at: string;
  tracking_number: string | null;
  carrier: string | null;
  payment_status: string | null;
  fulfillment_status: string | null;
  razorpay_order_id: string | null;
  order_items: Item[];
  // derived
  failed: boolean;
  succeeded: boolean;
  failReason: string | null;
  failAt: string | null;
  returnStatus: string | null;
  refundStatus: string | null;
};

const PAGE = 10;

// Payment classification (real data, no mock)
function isFailed(o: { payment_status: string | null; status: string }) {
  const p = (o.payment_status ?? "").toLowerCase();
  const s = (o.status ?? "").toLowerCase();
  return p === "failed" || s === "payment_failed" || p === "abandoned" || p === "expired";
}
function isSucceeded(o: { payment_status: string | null; status: string }) {
  if (isFailed(o)) return false;
  const p = (o.payment_status ?? "").toLowerCase();
  const s = (o.status ?? "").toLowerCase();
  if (p === "succeeded" || p === "paid" || p === "captured") return true;
  // Any order that progressed past payment is considered paid
  return ["paid", "processing", "shipped", "in_transit", "out_for_delivery", "delivered", "returning", "returned", "refunded"].includes(s);
}

type DisplayStatus = { key: string; label: string; emoji: string; color: string; step: number };
function displayStatus(o: Order): DisplayStatus {
  if (o.failed) return { key: "failed", label: "Payment Failed", emoji: "❌", color: "text-rose-400", step: 0 };
  const s = (o.status ?? "").toLowerCase();
  if (o.refundStatus && ["processed", "completed", "refunded", "succeeded"].includes(o.refundStatus.toLowerCase()))
    return { key: "refunded", label: "Refunded", emoji: "💸", color: "text-fuchsia-400", step: 0 };
  if (s === "refunded") return { key: "refunded", label: "Refunded", emoji: "💸", color: "text-fuchsia-400", step: 0 };
  if (o.returnStatus && ["approved", "received", "returned", "completed"].includes(o.returnStatus.toLowerCase()))
    return { key: "returned", label: "Returned", emoji: "↩", color: "text-amber-400", step: 0 };
  if (s === "returning" || s === "returned") return { key: "returned", label: "Returned", emoji: "↩", color: "text-amber-400", step: 0 };
  if (s === "cancelled") return { key: "cancelled", label: "Cancelled", emoji: "🚫", color: "text-rose-400", step: 0 };
  if (s === "delivered") return { key: "delivered", label: "Delivered", emoji: "✅", color: "text-emerald-400", step: 100 };
  if (s === "out_for_delivery") return { key: "ofd", label: "Out For Delivery", emoji: "📍", color: "text-accent", step: 90 };
  if (s === "shipped" || s === "in_transit") return { key: "shipped", label: "Shipped", emoji: "🚚", color: "text-sky-400", step: 60 };
  if (s === "processing") return { key: "processing", label: "Processing", emoji: "🟡", color: "text-amber-400", step: 35 };
  return { key: "confirmed", label: "Confirmed", emoji: "🟢", color: "text-emerald-400", step: 15 };
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "successful", label: "Successful" },
  { id: "failed", label: "Failed Payments" },
  { id: "processing", label: "Processing" },
  { id: "shipped", label: "Shipped" },
  { id: "delivered", label: "Delivered" },
  { id: "returned", label: "Returned" },
  { id: "refunded", label: "Refunded" },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];

function ItemImage({ item, size = "size-16" }: { item: Item; size?: string }) {
  const [err, setErr] = useState(false);
  if (item.image && !err) {
    return <img src={item.image} alt={item.name} loading="lazy" onError={() => setErr(true)} className={`${size} rounded-xl object-cover border border-border/60 bg-muted`} />;
  }
  return (
    <div className={`${size} rounded-xl border border-border/60 bg-muted grid place-items-center`}>
      <Package className="size-5 text-muted-foreground" />
    </div>
  );
}

function OrdersPage() {
  const { user, loading } = useAuth();
  const { format } = useRegion();
  const cart = useCart();
  const nav = useNavigate();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState<FilterId>("all");
  const [visible, setVisible] = useState(PAGE);
  const [recSlugs, setRecSlugs] = useState<string[]>([]);
  const [trendSlugs, setTrendSlugs] = useState<string[]>([]);
  const [reordering, setReordering] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  async function load() {
    if (!user) return;
    const [{ data: rawOrders }, { data: pays }, { data: rets }, { data: refs }] = await Promise.all([
      supabase.from("orders")
        .select("id,status,total,currency,created_at,tracking_number,carrier,payment_status,fulfillment_status,razorpay_order_id,order_items(name,quantity,image,unit_price,product_slug)")
        .order("created_at", { ascending: false }),
      supabase.from("payments").select("order_id,status,meta,created_at").order("created_at", { ascending: false }),
      supabase.from("returns").select("order_id,status,refund_status"),
      supabase.from("refunds").select("order_id,status"),
    ]);

    const failMap = new Map<string, { reason: string | null; at: string | null }>();
    for (const p of pays ?? []) {
      if (String(p.status).toLowerCase() === "failed" && p.order_id && !failMap.has(p.order_id)) {
        const meta = (p.meta ?? {}) as { error_description?: string; description?: string };
        failMap.set(p.order_id, { reason: meta.error_description ?? meta.description ?? null, at: p.created_at });
      }
    }
    const retMap = new Map<string, string>();
    for (const r of rets ?? []) if (r.order_id) retMap.set(r.order_id, String(r.status));
    const refMap = new Map<string, string>();
    for (const r of refs ?? []) if (r.order_id) refMap.set(r.order_id, String(r.status));

    const built: Order[] = ((rawOrders as Omit<Order, "failed" | "succeeded" | "failReason" | "failAt" | "returnStatus" | "refundStatus">[]) ?? []).map((o) => {
      const failed = isFailed(o);
      const fail = failMap.get(o.id);
      return {
        ...o,
        failed,
        succeeded: isSucceeded(o),
        failReason: fail?.reason ?? null,
        failAt: fail?.at ?? null,
        returnStatus: retMap.get(o.id) ?? null,
        refundStatus: refMap.get(o.id) ?? null,
      };
    });
    setOrders(built);
  }

  useEffect(() => {
    if (!user) return;
    load();
    fetchPersonalizedSlugs(6).then(setRecSlugs);
    fetchTrendingSlugs(6).then(setTrendSlugs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Realtime: payment success/failure, shipment + delivery updates, refund + return changes
  useEffect(() => {
    if (!user) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => { if (t) clearTimeout(t); t = setTimeout(load, 400); };
    const channel = supabase
      .channel("orders-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${user.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments", filter: `user_id=eq.${user.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "returns", filter: `user_id=eq.${user.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "refunds" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "shipments" }, refresh)
      .subscribe();
    return () => { if (t) clearTimeout(t); supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const successful = useMemo(() => (orders ?? []).filter((o) => !o.failed), [orders]);
  const failedOrders = useMemo(() => (orders ?? []).filter((o) => o.failed), [orders]);

  // Overview metrics — only successfully paid orders
  const stats = useMemo(() => {
    const paid = (orders ?? []).filter((o) => o.succeeded);
    const totalSpent = paid.reduce((n, o) => n + Number(o.total || 0), 0);
    const delivered = paid.filter((o) => displayStatus(o).key === "delivered").length;
    const refunded = paid.filter((o) => displayStatus(o).key === "refunded").length;
    const pending = paid.filter((o) => { const k = displayStatus(o).key; return !["delivered", "refunded", "returned", "cancelled"].includes(k); }).length;
    return { total: paid.length, totalSpent, delivered, refunded, pending };
  }, [orders]);

  const filtered = useMemo(() => {
    let list = successful;
    if (filter === "failed") list = failedOrders;
    else if (filter !== "all") {
      list = successful.filter((o) => {
        const k = displayStatus(o).key;
        if (filter === "successful") return o.succeeded;
        if (filter === "processing") return k === "processing" || k === "confirmed";
        if (filter === "shipped") return k === "shipped" || k === "ofd";
        if (filter === "delivered") return k === "delivered";
        if (filter === "returned") return k === "returned";
        if (filter === "refunded") return k === "refunded";
        return true;
      });
    }
    if (q) {
      const n = q.toLowerCase();
      list = list.filter((o) =>
        o.id.toLowerCase().includes(n) ||
        (o.tracking_number ?? "").toLowerCase().includes(n) ||
        o.order_items.some((i) => i.name.toLowerCase().includes(n))
      );
    }
    return list;
  }, [successful, failedOrders, filter, q]);

  useEffect(() => { setVisible(PAGE); }, [filter, q]);

  async function reorder(o: Order) {
    setReordering(o.id);
    try {
      for (const it of o.order_items) {
        if (it.product_slug) await cart.add(it.product_slug, it.quantity);
      }
      nav({ to: "/cart" });
    } finally { setReordering(null); }
  }

  function retryPayment() {
    nav({ to: "/checkout" });
  }

  if (loading || !user) {
    return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }

  const cartCount = cart.items.reduce((n, i) => n + i.qty, 0);
  const showFailedSection = filter === "all" && failedOrders.length > 0;

  return (
    <div className="min-h-screen bg-background relative">
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 h-[420px] -z-10 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(255,122,0,0.10),transparent_70%)]" />

      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/80 border-b border-border/50">
        <div className="container-page max-w-3xl flex items-center gap-2 py-2.5">
          <Link to="/account" aria-label="Back" className="size-9 grid place-items-center rounded-full border border-border/60 hover:border-accent/50 active:scale-95 transition">
            <ArrowLeft className="size-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-mono uppercase tracking-[0.3em] text-accent/80 leading-none">Account</p>
            <h1 className="font-display font-semibold tracking-tight text-base">Your orders</h1>
          </div>
          <button onClick={() => setSearchOpen((s) => !s)} aria-label="Search orders"
            className={`size-9 grid place-items-center rounded-full border transition active:scale-95 ${searchOpen ? "border-accent text-accent bg-accent/10" : "border-border/60 hover:border-accent/50"}`}>
            <Search className="size-4" />
          </button>
          <Link to="/account/notifications" aria-label="Notifications" className="size-9 grid place-items-center rounded-full border border-border/60 hover:border-accent/50 active:scale-95 transition">
            <Bell className="size-4" />
          </Link>
          <Link to="/cart" aria-label="Cart" className="relative size-9 grid place-items-center rounded-full border border-border/60 hover:border-accent/50 active:scale-95 transition">
            <ShoppingBag className="size-4" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-accent text-accent-foreground text-[9px] font-bold grid place-items-center">{cartCount}</span>
            )}
          </Link>
        </div>

        <AnimatePresence>
          {searchOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
              className="container-page max-w-3xl overflow-hidden">
              <div className="pb-3">
                <div className="relative rounded-2xl border border-border/60 bg-card/60 backdrop-blur">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <input value={q} autoFocus onChange={(e) => setQ(e.target.value)}
                    placeholder="Search Order ID, product, tracking number…"
                    className="w-full bg-transparent pl-11 pr-12 py-3 text-sm outline-none" />
                  {q && (
                    <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 size-7 grid place-items-center rounded-full hover:bg-muted/40" aria-label="Clear">
                      <X className="size-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <div className="container-page max-w-3xl pb-16 pt-4">
        {/* Overview cards — successful paid only */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
          <StatCard icon={ShoppingBag} label="Total Orders" value={String(stats.total)} tone="text-accent" />
          <StatCard icon={Wallet} label="Total Spent" value={format(stats.totalSpent)} tone="text-emerald-400" />
          <StatCard icon={Clock} label="Pending" value={String(stats.pending)} tone="text-amber-400" />
          <StatCard icon={CheckCircle2} label="Delivered" value={String(stats.delivered)} tone="text-sky-400" />
          <StatCard icon={RefreshCw} label="Refunded" value={String(stats.refunded)} tone="text-fuchsia-400" />
        </div>

        {/* Filters */}
        <div className="-mx-4 px-4 overflow-x-auto no-scrollbar mb-4">
          <div className="flex gap-1.5 w-max">
            {FILTERS.map((f) => {
              const active = filter === f.id;
              const count = f.id === "failed" ? failedOrders.length : undefined;
              return (
                <button key={f.id} onClick={() => setFilter(f.id)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[11px] uppercase tracking-widest font-mono whitespace-nowrap transition-all ${
                    active ? "bg-accent text-accent-foreground" : "bg-card/60 border border-border/60 text-muted-foreground hover:text-foreground hover:border-accent/40"
                  }`}>
                  {f.label}
                  {count ? <span className={`px-1.5 rounded-full text-[9px] ${active ? "bg-accent-foreground/20" : "bg-rose-500/20 text-rose-300"}`}>{count}</span> : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Failed payment attempts (shown on All) */}
        {showFailedSection && (
          <section className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="size-3.5 text-rose-400" />
              <h2 className="text-[11px] font-mono uppercase tracking-[0.25em] text-rose-300">Failed Payment Attempts</h2>
            </div>
            <ul className="space-y-2">
              {failedOrders.slice(0, 5).map((o) => (
                <FailedCard key={o.id} order={o} format={format} onRetry={() => retryPayment()} />
              ))}
            </ul>
          </section>
        )}

        {/* Results count */}
        {(orders?.length ?? 0) > 0 && (
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
            {filtered.length} {filter === "failed" ? "failed attempt" : "order"}{filtered.length !== 1 ? "s" : ""}
          </p>
        )}

        {/* List */}
        {orders === null ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 rounded-2xl bg-card/40 border border-border/40 relative overflow-hidden">
                <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState isFiltered={!!q || filter !== "all"} recSlugs={recSlugs} trendSlugs={trendSlugs}
            onClear={() => { setQ(""); setFilter("all"); }} />
        ) : (
          <>
            <ul className="space-y-2.5">
              {filtered.slice(0, visible).map((o, i) =>
                filter === "failed"
                  ? <FailedCard key={o.id} order={o} format={format} onRetry={() => retryPayment()} listItem />
                  : <OrderCard key={o.id} order={o} index={i} format={format} onReorder={() => reorder(o)} reordering={reordering === o.id} />
              )}
            </ul>
            {visible < filtered.length && (
              <div className="mt-5 grid place-items-center">
                <button onClick={() => setVisible((v) => v + PAGE)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-border/60 bg-card/50 text-xs font-mono uppercase tracking-widest hover:border-accent/50 hover:text-accent active:scale-95 transition">
                  Load more <ChevronDown className="size-3.5" />
                </button>
              </div>
            )}
          </>
        )}

        {/* Recommendations only when there is history */}
        {(orders?.length ?? 0) > 0 && recSlugs.length > 0 && (
          <div className="mt-8">
            <RecommendationStrip title="Recommended for you" subtitle="Curated from your taste" slugs={recSlugs} />
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

function StatCard({ icon: Icon, label, value, tone }: { icon: typeof ShoppingBag; label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur p-3 flex flex-col gap-1">
      <Icon className={`size-4 ${tone}`} />
      <p className="text-lg font-display font-semibold leading-none truncate">{value}</p>
      <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground truncate">{label}</p>
    </div>
  );
}

function OrderCard({ order, index, format, onReorder, reordering }: {
  order: Order; index: number; format: (n: number) => string; onReorder: () => void; reordering: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = displayStatus(order);
  const items = order.order_items;
  const visibleItems = items.slice(0, 2);
  const more = items.length - visibleItems.length;
  const itemCount = items.reduce((n, i) => n + i.quantity, 0);
  const tracking = order.tracking_number ? `${order.carrier ? order.carrier + " · " : ""}${order.tracking_number}` : null;

  return (
    <motion.li initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 8) * 0.03, duration: 0.3 }}>
      <div className="group rounded-2xl border border-border/60 bg-card/50 backdrop-blur p-3 hover:border-accent/40 transition-all">
        {/* top: image left, info right */}
        <div className="flex gap-3">
          <div className="relative shrink-0">
            <ItemImage item={visibleItems[0] ?? { name: "", quantity: 0, image: null, unit_price: 0, product_slug: "" }} />
            {more > 0 && (
              <span className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-full bg-background border border-border text-[9px] font-mono">+{more}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <span className={`inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full bg-background/60 border border-border/60 ${meta.color}`}>
                <span>{meta.emoji}</span>{meta.label}
              </span>
              {order.succeeded && (
                <span className="inline-flex items-center gap-1 text-[9px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CreditCard className="size-2.5" /> Paid
                </span>
              )}
            </div>
            <p className="text-sm font-medium truncate">{visibleItems[0]?.name ?? "Order"}</p>
            {visibleItems[1] && <p className="text-[11px] text-muted-foreground truncate">+ {visibleItems[1].name}</p>}
            <p className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">
              #{order.id.slice(0, 8)} · {new Date(order.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-mono text-sm font-semibold">{format(Number(order.total))}</p>
            <p className="text-[10px] text-muted-foreground">{itemCount} item{itemCount !== 1 ? "s" : ""}</p>
          </div>
        </div>

        {/* progress */}
        {meta.step > 0 && (
          <div className="mt-3 h-1 rounded-full bg-border/50 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-accent to-amber-300 transition-all duration-700" style={{ width: `${meta.step}%` }} />
          </div>
        )}

        {/* tracking line */}
        {tracking && (
          <div className="mt-2 flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
            <Truck className="size-3" /> <span className="truncate">{tracking}</span>
          </div>
        )}

        {/* expand all products */}
        {items.length > 0 && (
          <button onClick={() => setExpanded((e) => !e)}
            className="mt-2 inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-accent hover:underline">
            <Boxes className="size-3" /> {expanded ? "Hide products" : `View all products (${items.length})`}
            <ChevronDown className={`size-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        )}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }}
              className="overflow-hidden mt-2 space-y-2">
              {items.map((it, idx) => (
                <li key={idx} className="flex items-center gap-2.5 rounded-xl bg-background/40 border border-border/40 p-2">
                  <ItemImage item={it} size="size-11" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{it.name}</p>
                    <p className="text-[10px] text-muted-foreground">Qty {it.quantity}</p>
                  </div>
                  {it.unit_price != null && <p className="text-[11px] font-mono shrink-0">{format(Number(it.unit_price))}</p>}
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>

        {/* actions */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Link to="/orders/$id" params={{ id: order.id }}
            className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full bg-accent text-accent-foreground active:scale-95 transition">
            View Details <ArrowRight className="size-3" />
          </Link>
          <button onClick={onReorder} disabled={reordering}
            className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full border border-border/60 hover:border-accent/40 hover:text-accent active:scale-95 transition disabled:opacity-50">
            {reordering ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />} Reorder
          </button>
          {meta.key === "delivered" && (
            <Link to="/returns" className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full border border-border/60 hover:border-accent/40 hover:text-accent active:scale-95 transition">
              <RotateCcw className="size-3" /> Return
            </Link>
          )}
          <Link to="/track" className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full border border-border/60 hover:border-accent/40 hover:text-accent active:scale-95 transition">
            <MapPin className="size-3" /> Track
          </Link>
        </div>
      </div>
    </motion.li>
  );
}

function FailedCard({ order, format, onRetry, listItem }: {
  order: Order; format: (n: number) => string; onRetry: () => void; listItem?: boolean;
}) {
  const first = order.order_items[0];
  return (
    <motion.li initial={listItem ? { opacity: 0, y: 8 } : false} animate={{ opacity: 1, y: 0 }}>
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/[0.04] backdrop-blur p-3">
        <div className="flex gap-3">
          <div className="opacity-70 grayscale">
            <ItemImage item={first ?? { name: "", quantity: 0, image: null, unit_price: 0, product_slug: "" }} />
          </div>
          <div className="flex-1 min-w-0">
            <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/30">
              ❌ Payment Failed
            </span>
            <p className="text-sm font-medium truncate mt-1">{first?.name ?? "Order"}</p>
            <p className="text-[10px] text-muted-foreground font-mono truncate">#{order.id.slice(0, 8)}</p>
            {order.failReason && <p className="text-[11px] text-rose-300/90 mt-1 line-clamp-2">{order.failReason}</p>}
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Attempted {new Date(order.failAt ?? order.created_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          <p className="font-mono text-sm font-semibold shrink-0">{format(Number(order.total))}</p>
        </div>
        <div className="mt-2.5 flex gap-1.5">
          <button onClick={onRetry}
            className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full bg-rose-500 text-white active:scale-95 transition">
            <RefreshCw className="size-3" /> Retry Payment
          </button>
          <Link to="/help" className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full border border-border/60 hover:border-accent/40 hover:text-accent active:scale-95 transition">
            <HelpCircle className="size-3" /> Support
          </Link>
        </div>
      </div>
    </motion.li>
  );
}

function EmptyState({ isFiltered, recSlugs, trendSlugs, onClear }: {
  isFiltered: boolean; recSlugs: string[]; trendSlugs: string[]; onClear: () => void;
}) {
  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-b from-card/70 to-card/30 backdrop-blur p-8 text-center">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(50%_60%_at_50%_0%,rgba(255,122,0,0.12),transparent_70%)]" />
        <div className="mx-auto mb-4 size-16 rounded-2xl bg-gradient-to-br from-accent/30 to-amber-300/10 border border-accent/30 grid place-items-center">
          <Package className="size-7 text-accent" />
        </div>
        <h2 className="text-lg font-display font-semibold tracking-tight">
          {isFiltered ? "No matching orders" : "No orders yet"}
        </h2>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto">
          {isFiltered ? "Try a different filter or clear them." : "Discover curated products and premium drops — all in one place."}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {isFiltered ? (
            <button onClick={onClear} className="inline-flex items-center gap-1.5 bg-accent text-accent-foreground px-5 py-2.5 rounded-full text-xs uppercase tracking-widest font-bold active:scale-95 transition">
              Clear filters
            </button>
          ) : (
            <Link to="/" className="inline-flex items-center gap-1.5 bg-accent text-accent-foreground px-5 py-2.5 rounded-full text-xs uppercase tracking-widest font-bold active:scale-95 transition">
              Shop now <ArrowRight className="size-3" />
            </Link>
          )}
        </div>
      </div>
      {!isFiltered && recSlugs.length > 0 && <RecommendationStrip title="Recommended for you" subtitle="Curated from your taste" slugs={recSlugs} />}
      {!isFiltered && trendSlugs.length > 0 && <RecommendationStrip title="Trending now" subtitle="What everyone is loving" slugs={trendSlugs} />}
    </div>
  );
}
