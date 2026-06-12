import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, Package, Search, ArrowRight, ArrowLeft, ShoppingBag, Bell,
  Truck, CheckCircle2, X, HelpCircle, RefreshCw, MapPin, ChevronDown,
  AlertCircle, Wallet, Sparkles, RotateCcw, Repeat, Wallet2, Check,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRegion } from "@/lib/region";
import { useCart } from "@/lib/cart";
import { RecommendationStrip } from "@/components/site/RecommendationStrip";
import { RecentlyViewed } from "@/components/site/RecentlyViewed";
import { OrderDetailsDrawer } from "@/components/account/OrderDetailsDrawer";
import { fetchPersonalizedSlugs, fetchTrendingSlugs } from "@/lib/personalization";

export const Route = createFileRoute("/account_/orders")({
  head: () => ({ meta: [{ title: "Your Orders — FoundOurMarket™" }] }),
  component: OrdersPage,
});

type Item = { name: string; quantity: number; image: string | null; unit_price: number | null; product_slug: string };
type ReturnRec = {
  status: string;
  refund_status: string;
  resolution_type: string;
  replacement_status: string;
  created_at: string;
};
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
  returnRec: ReturnRec | null;
};

// ---- Returns / Replacements synchronization ----
type ReturnView = {
  label: string;
  badge: string;
  /** "return" | "replacement" | "refund" */
  kind: "return" | "replacement" | "refund";
  /** 0..4 index into the customer timeline (Requested→…→Delivered). -1 = rejected. */
  stage: number;
  /** Active = still being processed (not terminal). */
  active: boolean;
};

const RV_AMBER = "bg-amber-500/10 text-amber-300 border-amber-500/30";
const RV_SKY = "bg-sky-500/10 text-sky-300 border-sky-500/30";
const RV_ORANGE = "bg-orange-500/10 text-orange-300 border-orange-500/30";
const RV_EMERALD = "bg-emerald-500/10 text-emerald-300 border-emerald-500/30";
const RV_FUCHSIA = "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30";
const RV_ROSE = "bg-rose-500/10 text-rose-300 border-rose-500/30";

// Map a return record to a customer-facing status per the FoundOurMarket spec.
function returnView(r: ReturnRec): ReturnView {
  const st = (r.status ?? "").toLowerCase();
  const res = (r.resolution_type ?? "").toLowerCase();
  const refund = (r.refund_status ?? "").toLowerCase();
  const repl = (r.replacement_status ?? "").toLowerCase();

  if (st === "rejected")
    return { label: "Return Rejected", badge: RV_ROSE, kind: "return", stage: -1, active: false };
  if (st === "requested" || (!st && !res))
    return { label: "Return Requested", badge: RV_AMBER, kind: "return", stage: 0, active: true };

  if (res === "replacement") {
    if (repl === "delivered")
      return { label: "Replacement Completed", badge: RV_EMERALD, kind: "replacement", stage: 4, active: false };
    if (repl === "shipped")
      return { label: "Replacement Shipped", badge: RV_ORANGE, kind: "replacement", stage: 3, active: true };
    if (repl === "processing" || st === "received")
      return { label: "Replacement Processing", badge: RV_SKY, kind: "replacement", stage: 2, active: true };
    if (repl === "approved")
      return { label: "Replacement Approved", badge: RV_SKY, kind: "replacement", stage: 1, active: true };
    return { label: "Return Approved", badge: RV_SKY, kind: "replacement", stage: 1, active: true };
  }

  if (res === "refund") {
    if (refund === "issued" || st === "completed")
      return { label: "Refunded", badge: RV_FUCHSIA, kind: "refund", stage: 4, active: false };
    if (st === "received" || refund === "processing")
      return { label: "Refund Processing", badge: RV_SKY, kind: "refund", stage: 2, active: true };
    return { label: "Refund Approved", badge: RV_SKY, kind: "refund", stage: 1, active: true };
  }

  if (st === "approved")
    return { label: "Return Approved", badge: RV_SKY, kind: "return", stage: 1, active: true };
  if (st === "completed")
    return { label: "Completed", badge: RV_EMERALD, kind: "return", stage: 4, active: false };
  return { label: "Return Requested", badge: RV_AMBER, kind: "return", stage: 0, active: true };
}

function getReturnView(o: Order): ReturnView | null {
  return o.returnRec ? returnView(o.returnRec) : null;
}

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
  return ["paid", "processing", "shipped", "in_transit", "out_for_delivery", "delivered", "returning", "returned", "refunded"].includes(s);
}

type DisplayStatus = { key: string; label: string; badge: string; step: number };
// Status colors per spec: Pending=Yellow, Processing=Blue, Shipped=Orange, Delivered=Green, Refunded=Purple, Failed=Red
function displayStatus(o: Order): DisplayStatus {
  if (o.failed) return { key: "failed", label: "Payment Failed", badge: "bg-rose-500/10 text-rose-300 border-rose-500/30", step: 0 };
  const s = (o.status ?? "").toLowerCase();

  // Returns / replacements take precedence so the order card never shows
  // "Delivered" while a return or replacement is in flight or resolved.
  const rv = getReturnView(o);
  if (rv) {
    const key = rv.kind === "replacement" ? "replacement" : rv.kind === "refund" ? "refunded" : "returned";
    return { key, label: rv.label, badge: rv.badge, step: 0 };
  }

  if (o.refundStatus && ["processed", "completed", "refunded", "succeeded"].includes(o.refundStatus.toLowerCase()))
    return { key: "refunded", label: "Refunded", badge: "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30", step: 0 };
  if (s === "refunded") return { key: "refunded", label: "Refunded", badge: "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30", step: 0 };
  if (o.returnStatus && ["approved", "received", "returned", "completed"].includes(o.returnStatus.toLowerCase()))
    return { key: "returned", label: "Returned", badge: "bg-amber-500/10 text-amber-300 border-amber-500/30", step: 0 };
  if (s === "returning" || s === "returned") return { key: "returned", label: "Returned", badge: "bg-amber-500/10 text-amber-300 border-amber-500/30", step: 0 };
  if (s === "cancelled") return { key: "cancelled", label: "Cancelled", badge: "bg-rose-500/10 text-rose-300 border-rose-500/30", step: 0 };
  if (s === "delivered") return { key: "delivered", label: "Delivered", badge: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30", step: 100 };
  if (s === "out_for_delivery") return { key: "ofd", label: "Out For Delivery", badge: "bg-orange-500/10 text-orange-300 border-orange-500/30", step: 90 };
  if (s === "shipped" || s === "in_transit") return { key: "shipped", label: "Shipped", badge: "bg-orange-500/10 text-orange-300 border-orange-500/30", step: 60 };
  if (s === "processing") return { key: "processing", label: "Processing", badge: "bg-sky-500/10 text-sky-300 border-sky-500/30", step: 35 };
  return { key: "confirmed", label: "Pending", badge: "bg-yellow-500/10 text-yellow-300 border-yellow-500/30", step: 15 };
}

const ACTIVE_KEYS = ["confirmed", "processing", "shipped", "ofd"];

// An order has an active (in-progress) return/replacement/refund.
function hasActiveReturn(o: Order): boolean {
  const rv = getReturnView(o);
  return !!rv && rv.active;
}

function classify(o: Order, id: string): boolean {
  const k = displayStatus(o).key;
  const rv = getReturnView(o);
  switch (id) {
    case "all": return true;
    case "active": return ACTIVE_KEYS.includes(k);
    case "delivered": return k === "delivered";
    case "in_transit": return k === "shipped" || k === "ofd";
    case "pending": return k === "confirmed" || k === "processing";
    case "refunded": return k === "refunded";
    case "returns": return !!rv;
    case "replacements": return rv?.kind === "replacement";
    default: return true;
  }
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "delivered", label: "Delivered" },
  { id: "in_transit", label: "In Transit" },
  { id: "pending", label: "Pending" },
  { id: "returns", label: "Returns" },
  { id: "replacements", label: "Replacements" },
  { id: "refunded", label: "Refunded" },
  { id: "failed", label: "Failed Payments" },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];

function ItemImage({ item, size = "size-14" }: { item: Item; size?: string }) {
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

// Stacked product preview: 1 → image, 2 → 2 stacked, 3+ → stack + "+N"
function ProductStack({ items }: { items: Item[] }) {
  const shown = items.slice(0, 2);
  const more = items.length - shown.length;
  return (
    <div className="relative shrink-0 flex items-center">
      <div className="flex -space-x-3">
        {shown.map((it, i) => (
          <div key={i} className="ring-2 ring-card rounded-xl" style={{ zIndex: shown.length - i }}>
            <ItemImage item={it} />
          </div>
        ))}
        {more > 0 && (
          <div className="size-14 rounded-xl border border-border/60 bg-background/80 backdrop-blur grid place-items-center ring-2 ring-card">
            <span className="text-xs font-mono font-semibold text-accent">+{more}</span>
          </div>
        )}
      </div>
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
  const [recOpen, setRecOpen] = useState(false);
  const [reordering, setReordering] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showAllFailed, setShowAllFailed] = useState(false);
  const [showAllActive, setShowAllActive] = useState(false);
  const [showAllRest, setShowAllRest] = useState(false);


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
      supabase.from("returns").select("order_id,status,refund_status,resolution_type,replacement_status,created_at").order("created_at", { ascending: false }),
      supabase.from("refunds").select("order_id,status"),
    ]);

    const failMap = new Map<string, { reason: string | null; at: string | null }>();
    for (const p of pays ?? []) {
      if (String(p.status).toLowerCase() === "failed" && p.order_id && !failMap.has(p.order_id)) {
        const meta = (p.meta ?? {}) as { error_description?: string; description?: string };
        failMap.set(p.order_id, { reason: meta.error_description ?? meta.description ?? null, at: p.created_at });
      }
    }
    // Keep the most recent return per order (rets ordered desc by created_at).
    const retMap = new Map<string, ReturnRec>();
    for (const r of rets ?? []) {
      if (r.order_id && !retMap.has(r.order_id)) {
        retMap.set(r.order_id, {
          status: String(r.status ?? ""),
          refund_status: String(r.refund_status ?? ""),
          resolution_type: String(r.resolution_type ?? ""),
          replacement_status: String(r.replacement_status ?? ""),
          created_at: String(r.created_at ?? ""),
        });
      }
    }
    const refMap = new Map<string, string>();
    for (const r of refs ?? []) if (r.order_id) refMap.set(r.order_id, String(r.status));

    const built: Order[] = ((rawOrders as Omit<Order, "failed" | "succeeded" | "failReason" | "failAt" | "returnStatus" | "refundStatus" | "returnRec">[]) ?? []).map((o) => {
      const failed = isFailed(o);
      const fail = failMap.get(o.id);
      const rec = retMap.get(o.id) ?? null;
      return {
        ...o,
        failed,
        succeeded: isSucceeded(o),
        failReason: fail?.reason ?? null,
        failAt: fail?.at ?? null,
        returnStatus: rec?.status ?? null,
        refundStatus: refMap.get(o.id) ?? null,
        returnRec: rec,
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
    const inTransit = paid.filter((o) => { const k = displayStatus(o).key; return k === "shipped" || k === "ofd"; }).length;
    const returnsInProgress = paid.filter((o) => hasActiveReturn(o)).length;
    return { total: paid.length, totalSpent, delivered, refunded, inTransit, returnsInProgress };
  }, [orders]);

  // Per-filter counts
  const counts = useMemo(() => {
    const c: Record<FilterId, number> = { all: 0, active: 0, delivered: 0, in_transit: 0, pending: 0, returns: 0, replacements: 0, refunded: 0, failed: failedOrders.length };
    for (const o of successful) {
      for (const f of FILTERS) {
        if (f.id === "failed") continue;
        if (classify(o, f.id)) c[f.id]++;
      }
    }
    return c;
  }, [successful, failedOrders]);

  const filtered = useMemo(() => {
    let list = filter === "failed" ? failedOrders : successful.filter((o) => classify(o, filter));
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

  // On "all" view (no search): split active vs delivered/other for grouped sections
  const grouped = useMemo(() => {
    if (filter !== "all" || q) return null;
    const active = filtered.filter((o) => ACTIVE_KEYS.includes(displayStatus(o).key));
    const rest = filtered.filter((o) => !ACTIVE_KEYS.includes(displayStatus(o).key));
    return { active, rest };
  }, [filtered, filter, q]);

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
  const showFailedSection = filter === "all" && !q && failedOrders.length > 0;

  const renderCard = (o: Order, i: number) =>
    o.failed
      ? <FailedCard key={o.id} order={o} format={format} onRetry={() => retryPayment()} listItem />
      : <OrderCard key={o.id} order={o} index={i} format={format} onReorder={() => reorder(o)} reordering={reordering === o.id} onOpenDetails={() => setDetailId(o.id)} />;

  return (
    <div className="min-h-dvh bg-background relative">
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

      <div className="container-page max-w-3xl mobile-page-clearance pt-4 md:pb-16">
        {/* Overview cards — successful paid only — compact */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
          <StatCard icon={ShoppingBag} label="Total" value={String(stats.total)} tone="text-accent" />
          <StatCard icon={CheckCircle2} label="Delivered" value={String(stats.delivered)} tone="text-emerald-400" />
          <StatCard icon={Truck} label="In Transit" value={String(stats.inTransit)} tone="text-orange-400" />
          <StatCard icon={RotateCcw} label="Returns" value={String(stats.returnsInProgress)} tone="text-amber-400" onClick={() => setFilter("returns")} />
          <StatCard icon={RefreshCw} label="Refunded" value={String(stats.refunded)} tone="text-fuchsia-400" />
          <StatCard icon={Wallet} label="Total Spent" value={format(stats.totalSpent)} tone="text-sky-400" />
        </div>


        {/* Filter pills with counts */}
        <div className="-mx-4 px-4 overflow-x-auto no-scrollbar mb-4">
          <div className="flex gap-1.5 w-max">
            {FILTERS.map((f) => {
              const active = filter === f.id;
              const count = counts[f.id];
              if (f.id === "failed" && count === 0) return null;
              return (
                <button key={f.id} onClick={() => setFilter(f.id)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[11px] uppercase tracking-widest font-mono whitespace-nowrap transition-all ${
                    active ? "bg-accent text-accent-foreground" : f.id === "failed" ? "bg-rose-500/[0.06] border border-rose-500/30 text-rose-300 hover:border-rose-500/50" : "bg-card/60 border border-border/60 text-muted-foreground hover:text-foreground hover:border-accent/40"
                  }`}>
                  {f.label}
                  <span className={`px-1.5 rounded-full text-[9px] ${active ? "bg-accent-foreground/20" : f.id === "failed" ? "bg-rose-500/20 text-rose-300" : "bg-muted/60"}`}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>




        {/* List */}
        {orders === null ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-2xl bg-card/40 border border-border/40 relative overflow-hidden">
                <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 && !showFailedSection ? (
          <EmptyState isFiltered={!!q || filter !== "all"} recSlugs={recSlugs} trendSlugs={trendSlugs}
            onClear={() => { setQ(""); setFilter("all"); }} />
        ) : grouped ? (
          <>
            {/* Active Orders first */}
            {grouped.active.length > 0 && (
              <section className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <Truck className="size-3.5 text-accent" />
                  <h2 className="text-[11px] font-mono uppercase tracking-[0.25em] text-foreground">Active Orders</h2>
                  <span className="text-[10px] font-mono text-muted-foreground">({grouped.active.length})</span>
                </div>
                <ul className="space-y-2.5">
                  {(showAllActive ? grouped.active : grouped.active.slice(0, 2)).map((o, i) => renderCard(o, i))}
                </ul>
                {grouped.active.length > 2 && (
                  <button onClick={() => setShowAllActive((s) => !s)}
                    className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full border border-border/60 bg-card/50 text-[10px] font-mono uppercase tracking-widest hover:border-accent/50 hover:text-accent active:scale-95 transition">
                    {showAllActive ? "Show less" : `View all active orders (${grouped.active.length})`}
                    <ChevronDown className={`size-3.5 transition-transform ${showAllActive ? "rotate-180" : ""}`} />
                  </button>
                )}
              </section>
            )}
            {/* Delivered & past orders */}
            {grouped.rest.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="size-3.5 text-emerald-400" />
                  <h2 className="text-[11px] font-mono uppercase tracking-[0.25em] text-foreground">Delivered &amp; Past</h2>
                  <span className="text-[10px] font-mono text-muted-foreground">({grouped.rest.length})</span>
                </div>
                <ul className="space-y-2.5">
                  {(showAllRest ? grouped.rest : grouped.rest.slice(0, 2)).map((o, i) => renderCard(o, i))}
                </ul>
                {grouped.rest.length > 2 && (
                  <button onClick={() => setShowAllRest((s) => !s)}
                    className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full border border-border/60 bg-card/50 text-[10px] font-mono uppercase tracking-widest hover:border-accent/50 hover:text-accent active:scale-95 transition">
                    {showAllRest ? "Show less" : `View all past orders (${grouped.rest.length})`}
                    <ChevronDown className={`size-3.5 transition-transform ${showAllRest ? "rotate-180" : ""}`} />
                  </button>
                )}
              </section>
            )}

          </>
        ) : (
          <>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
              {filtered.length} {filter === "failed" ? "failed attempt" : "order"}{filtered.length !== 1 ? "s" : ""}
            </p>
            <ul className="space-y-2.5">
              {filtered.slice(0, visible).map((o, i) => renderCard(o, i))}
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

        {/* Failed payment attempts (shown on All) — after Active and Delivered & Past */}
        {showFailedSection && (
          <section className="mt-6 mb-5">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="size-3.5 text-rose-400" />
              <h2 className="text-[11px] font-mono uppercase tracking-[0.25em] text-rose-300">Failed Payments</h2>
              <span className="text-[10px] font-mono text-muted-foreground">({failedOrders.length})</span>
            </div>
            <ul className="space-y-2">
              {(showAllFailed ? failedOrders : failedOrders.slice(0, 2)).map((o) => (
                <FailedCard key={o.id} order={o} format={format} onRetry={() => retryPayment()} />
              ))}
            </ul>
            {failedOrders.length > 2 && (
              <button onClick={() => setShowAllFailed((s) => !s)}
                className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full border border-rose-500/30 bg-rose-500/[0.04] text-[10px] font-mono uppercase tracking-widest text-rose-300 hover:border-rose-500/50 active:scale-95 transition">
                {showAllFailed ? "Show less" : `View all failed payments (${failedOrders.length})`}
                <ChevronDown className={`size-3.5 transition-transform ${showAllFailed ? "rotate-180" : ""}`} />
              </button>
            )}
          </section>
        )}



        {/* Recently viewed — compact carousel, max 6 */}
        {(orders?.length ?? 0) > 0 && (
          <div className="mt-8 -mx-4">
            <RecentlyViewed title="Recently Viewed" eyebrow="Continue Browsing" limit={6} />
          </div>
        )}

        {/* Recommendations — collapsible, default collapsed */}
        {(orders?.length ?? 0) > 0 && recSlugs.length > 0 && (
          <div className="mt-6 rounded-2xl border border-border/60 bg-card/40 backdrop-blur overflow-hidden">
            <button onClick={() => setRecOpen((s) => !s)}
              className="w-full flex items-center gap-2 px-4 py-3.5 text-left active:scale-[0.99] transition">
              <Sparkles className="size-4 text-accent" />
              <span className="flex-1 text-sm font-medium">Recommended For You</span>
              <ChevronDown className={`size-4 text-muted-foreground transition-transform ${recOpen ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence initial={false}>
              {recOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}
                  className="overflow-hidden">
                  <div className="px-1 pb-2">
                    <RecommendationStrip title="" subtitle="" slugs={recSlugs} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      <style>{`
        @keyframes shimmer { 100% { transform: translateX(100%); } }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { scrollbar-width: none; }
      `}</style>

      <OrderDetailsDrawer orderId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone, onClick }: { icon: typeof ShoppingBag; label: string; value: string; tone: string; onClick?: () => void }) {
  const inner = (
    <>
      <Icon className={`size-3.5 ${tone}`} />
      <p className="text-base font-display font-semibold leading-none truncate">{value}</p>
      <p className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground truncate">{label}</p>
    </>
  );
  if (onClick) {
    return (
      <button onClick={onClick} className="text-left rounded-xl border border-border/60 bg-card/50 backdrop-blur px-2.5 py-2 flex flex-col gap-0.5 hover:border-accent/40 active:scale-[0.97] transition">
        {inner}
      </button>
    );
  }
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 backdrop-blur px-2.5 py-2 flex flex-col gap-0.5">
      {inner}
    </div>
  );
}

// Compact horizontal tracking bar (6 dots)
const TRACK = ["placed", "packed", "shipped", "in_transit", "ofd", "delivered"];
function CompactTrack({ step }: { step: number }) {
  // map step% to number of completed dots
  const completed = step >= 100 ? 6 : step >= 90 ? 5 : step >= 60 ? 4 : step >= 35 ? 2 : 1;
  return (
    <div className="mt-2.5 flex items-center gap-1">
      {TRACK.map((_, i) => (
        <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i < completed ? "bg-gradient-to-r from-accent to-amber-300" : "bg-border/50"}`} />
      ))}
    </div>
  );
}

// Customer-facing return / replacement / refund timeline (highlights current stage).
function ReturnMiniTimeline({ rv }: { rv: ReturnView }) {
  if (rv.stage < 0) return null;
  const steps =
    rv.kind === "refund"
      ? ["Requested", "Approved", "Refund Processing", "Refund Done", "Refunded"]
      : rv.kind === "replacement"
        ? ["Requested", "Approved", "Processing", "Shipped", "Delivered"]
        : ["Requested", "Approved", "Processing", "Shipped", "Completed"];
  return (
    <div className="mt-3 rounded-xl border border-border/50 bg-background/40 p-2.5">
      <div className="flex items-center">
        {steps.map((label, i) => {
          const done = i <= rv.stage;
          const current = i === rv.stage;
          return (
            <div key={label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1 shrink-0">
                <div className={`grid place-items-center size-5 rounded-full border text-[8px] transition-colors ${done ? "bg-accent/20 border-accent text-accent" : "bg-background border-border text-muted-foreground"} ${current ? "ring-2 ring-accent/40" : ""}`}>
                  {done ? <Check className="size-2.5" /> : i + 1}
                </div>
                <span className={`text-[7px] sm:text-[8px] font-mono uppercase tracking-wide text-center leading-tight w-10 sm:w-12 ${current ? "text-accent font-semibold" : done ? "text-foreground" : "text-muted-foreground"}`}>
                  {label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={`h-px flex-1 mx-0.5 -mt-3 ${i < rv.stage ? "bg-accent/60" : "bg-border/60"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OrderCard({ order, index, format, onReorder, reordering, onOpenDetails }: {
  order: Order; index: number; format: (n: number) => string; onReorder: () => void; reordering: boolean; onOpenDetails: () => void;
}) {
  const meta = displayStatus(order);
  const items = order.order_items;
  const itemCount = items.reduce((n, i) => n + i.quantity, 0);
  const isActive = ACTIVE_KEYS.includes(meta.key);
  const isDelivered = meta.key === "delivered";
  const rv = getReturnView(order);
  const activeReturn = !!rv && rv.active;

  return (
    <motion.li initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 8) * 0.03, duration: 0.3 }}>
      <div
        role="button"
        tabIndex={0}
        onClick={onOpenDetails}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenDetails(); } }}
        className="w-full text-left group rounded-2xl border border-border/60 bg-card/50 backdrop-blur p-3 hover:border-accent/40 transition-all active:scale-[0.995] cursor-pointer"
      >
        <div className="flex gap-3 items-center">
          <ProductStack items={items} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{items[0]?.name ?? "Order"}</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {itemCount} item{itemCount !== 1 ? "s" : ""}{items.length > 1 ? ` · ${items.length} products` : ""}
            </p>
            <p className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">
              #{order.id.slice(0, 8)} · {new Date(order.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
            </p>
            {rv && (
              <p className="text-[10px] font-mono mt-0.5 truncate flex items-center gap-1 text-muted-foreground">
                {rv.kind === "replacement" ? <Repeat className="size-2.5 text-accent" /> : <RotateCcw className="size-2.5 text-accent" />}
                Requested {new Date(order.returnRec!.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="font-mono text-sm font-semibold">{format(Number(order.total))}</p>
            <span className={`mt-1 inline-flex items-center text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border ${meta.badge}`}>
              {meta.label}
            </span>
          </div>
        </div>

        {/* Return / replacement timeline takes priority over order tracking */}
        {rv ? <ReturnMiniTimeline rv={rv} /> : isActive ? <CompactTrack step={meta.step} /> : null}

        {/* actions */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenDetails(); }}
            className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full bg-accent text-accent-foreground active:scale-95 transition">
            View Details <ArrowRight className="size-3" />
          </button>
          {rv && (
            <Link to="/account/returns" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full border border-accent/40 text-accent hover:bg-accent/10 active:scale-95 transition">
              <RotateCcw className="size-3" /> View Return Status
            </Link>
          )}
          {isActive && !rv && (
            <Link to="/track" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full border border-border/60 hover:border-accent/40 hover:text-accent active:scale-95 transition">
              <MapPin className="size-3" /> Track
            </Link>
          )}
          {/* Buy Again hidden while a return/replacement is being processed */}
          {isDelivered && !activeReturn && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onReorder(); }} disabled={reordering}
              className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full border border-border/60 hover:border-accent/40 hover:text-accent active:scale-95 transition disabled:opacity-50">
              {reordering ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />} Buy Again
            </button>
          )}
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
        <div className="flex gap-3 items-center">
          <div className="opacity-70 grayscale shrink-0">
            <ItemImage item={first ?? { name: "", quantity: 0, image: null, unit_price: 0, product_slug: "" }} />
          </div>
          <div className="flex-1 min-w-0">
            <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/30">
              Payment Failed
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
            <HelpCircle className="size-3" /> Contact Support
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
