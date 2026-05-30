import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import {
  TrendingUp, TrendingDown, ShoppingBag, DollarSign, Percent, Repeat,
  Download, Wifi, WifiOff, Sparkles, AlertTriangle, Package, RotateCcw,
  Activity, Truck, Gauge, Users, Zap,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchOrders, fetchProducts, bucketByDay, downloadCSV,
  type OrderRow, type ProductRow,
} from "@/lib/admin-queries";
import { SectionAnalyticsPanel } from "@/components/admin/SectionAnalyticsPanel";

export const Route = createFileRoute("/admin-analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Commerce Intelligence" },
      { name: "description", content: "Realtime backend-connected commerce intelligence: revenue, profit, conversion and fulfillment." },
    ],
  }),
  component: AnalyticsPage,
});

const EASE = [0.16, 1, 0.3, 1] as const;
type ConnState = "connecting" | "live" | "error";

/* ---------- Atmosphere ---------- */
function Atmosphere() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="orb animate-mesh" style={{ top: "-12%", left: "-6%", width: "46vw", height: "46vw", background: "var(--gradient-ember-soft)" }} />
      <div className="orb animate-mesh" style={{ bottom: "-16%", right: "-10%", width: "52vw", height: "52vw", background: "var(--gradient-violet)", animationDelay: "-6s" }} />
      <div className="absolute inset-0 grid-texture opacity-40" />
      <div className="absolute inset-0" style={{ background: "radial-gradient(120% 80% at 50% -10%, transparent 60%, oklch(0 0 0 / 0.55) 100%)" }} />
    </div>
  );
}

/* ---------- Animated number ---------- */
function AnimatedNumber({ value, prefix = "", suffix = "", decimals = 0 }: { value: number; prefix?: string; suffix?: string; decimals?: number }) {
  const mv = useMotionValue(value);
  const spring = useSpring(mv, { stiffness: 90, damping: 20, mass: 0.6 });
  const text = useTransform(spring, (v) =>
    `${prefix}${v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`
  );
  useEffect(() => { mv.set(value); }, [value, mv]);
  return <motion.span>{text}</motion.span>;
}

function DeltaBadge({ delta }: { delta: number }) {
  if (!isFinite(delta) || Math.abs(delta) < 0.05) {
    return <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">flat</span>;
  }
  const up = delta > 0;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-mono font-medium tabular-nums ${up ? "text-emerald-400" : "text-rose-400"}`}>
      {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {up ? "+" : ""}{delta.toFixed(1)}%
    </span>
  );
}

/* ---------- Stat cards ---------- */
function FeaturedRevenue({ value, delta, sub }: { value: number; delta: number; sub: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }} whileHover={{ y: -3 }}
      className="card-ambient glass-reflect noise-layer relative overflow-hidden rounded-3xl p-6 sm:p-7 sm:row-span-2 flex flex-col justify-between min-h-[180px] will-change-transform"
    >
      <div className="absolute -top-20 -right-16 size-56 rounded-full bg-accent/15 blur-3xl animate-ambient" />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2 text-accent">
          <DollarSign className="size-4" />
          <span className="text-[10px] font-mono uppercase tracking-[0.3em]">Revenue</span>
        </div>
        <DeltaBadge delta={delta} />
      </div>
      <div className="relative mt-4">
        <p className="font-display font-semibold tabular-nums leading-none text-[clamp(2.25rem,8vw,3.25rem)] text-gradient-ember">
          <AnimatedNumber value={value} prefix="$" decimals={0} />
        </p>
        <p className="mt-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">{sub}</p>
      </div>
    </motion.div>
  );
}

function MiniStat({ label, value, icon, i, prefix = "", suffix = "", decimals = 0, delta }: {
  label: string; value: number; icon: React.ReactNode; i: number;
  prefix?: string; suffix?: string; decimals?: number; delta?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE, delay: i * 0.05 }} whileHover={{ y: -2 }}
      className="card-premium relative overflow-hidden rounded-2xl p-4 will-change-transform"
    >
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em]">{label}</span>
        <span className="text-muted-foreground/70">{icon}</span>
      </div>
      <p className="mt-2 font-display font-semibold tabular-nums text-xl sm:text-2xl text-foreground">
        <AnimatedNumber value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
      </p>
      {delta !== undefined && <div className="mt-1"><DeltaBadge delta={delta} /></div>}
    </motion.div>
  );
}

/* ---------- Tooltip ---------- */
function GlowTooltip({ active, payload, label, money }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-background/90 backdrop-blur-md px-3 py-2 text-xs shadow-2xl">
      <p className="font-mono uppercase tracking-widest text-[10px] text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2 tabular-nums">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground capitalize">{p.dataKey}</span>
          <span className="ml-auto font-medium text-foreground">{money ? `$${Number(p.value).toFixed(0)}` : p.value}</span>
        </p>
      ))}
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  pending: "oklch(0.78 0.15 70)", processing: "oklch(0.78 0.12 195)",
  shipped: "oklch(0.7 0.13 230)", delivered: "oklch(0.7 0.16 150)",
  completed: "oklch(0.7 0.16 150)", cancelled: "oklch(0.65 0.2 25)",
  refunded: "oklch(0.65 0.16 15)", returned: "oklch(0.6 0.16 290)",
};

function AnalyticsPage() {
  const [days, setDays] = useState<7 | 14 | 30 | 90>(30);
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [products, setProducts] = useState<ProductRow[] | null>(null);
  const [conn, setConn] = useState<ConnState>("connecting");
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    fetchOrders(days).then(setOrders);
    fetchProducts().then(setProducts);
  }, [days]);

  useEffect(() => { load(); }, [load]);

  // Realtime: refetch (debounced) when orders/products change in the backend.
  useEffect(() => {
    const scheduleRefetch = () => {
      
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      refetchTimer.current = setTimeout(load, 1200);
    };
    const channel = supabase
      .channel("analytics-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, scheduleRefetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, scheduleRefetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, scheduleRefetch)
      .subscribe((status) => {
        setConn(status === "SUBSCRIBED" ? "live" : status === "CHANNEL_ERROR" ? "error" : "connecting");
      });
    const poll = setInterval(load, 30_000);
    return () => { supabase.removeChannel(channel); clearInterval(poll); if (refetchTimer.current) clearTimeout(refetchTimer.current); };
  }, [load]);

  const stats = useMemo(() => {
    const list = orders ?? [];
    const ps = products ?? [];
    const costMap = new Map(ps.map((p) => [p.slug, Number(p.cost) || 0]));
    let revenue = 0, cost = 0, units = 0, refunds = 0, shipping = 0;
    const statusCounts: Record<string, number> = {};
    const productSales = new Map<string, { name: string; slug: string; units: number; revenue: number; cost: number }>();
    const customerOrders = new Map<string, number>();

    for (const o of list) {
      revenue += Number(o.total) || 0;
      shipping += Number(o.shipping) || 0;
      statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;
      customerOrders.set(o.user_id, (customerOrders.get(o.user_id) ?? 0) + 1);
      if (o.status === "refunded" || o.status === "returned") refunds += Number(o.total) || 0;
      for (const it of o.order_items ?? []) {
        units += it.quantity;
        const slug = it.product_slug ?? it.name;
        const c = (costMap.get(slug) ?? 0) * it.quantity;
        cost += c;
        const prev = productSales.get(slug) ?? { name: it.name, slug, units: 0, revenue: 0, cost: 0 };
        prev.units += it.quantity;
        prev.revenue += Number(it.line_total ?? (it.unit_price ?? 0) * it.quantity) || 0;
        prev.cost += c;
        productSales.set(slug, prev);
      }
    }

    const grossProfit = revenue - cost;
    const netProfit = grossProfit - refunds - shipping;
    const aov = list.length ? revenue / list.length : 0;
    const repeatBuyers = [...customerOrders.values()].filter((n) => n > 1).length;
    const totalViews = ps.reduce((s, p) => s + p.views_count, 0);
    const convRate = totalViews > 0 ? (list.length / totalViews) * 100 : 0;
    const lowStock = ps.filter((p) => p.stock_quantity <= (p.low_stock_threshold ?? 5));

    const daily = bucketByDay(list, days, (o) => Number(o.total) || 0).map((d) => {
      const dayOrders = list.filter((o) => o.created_at.startsWith(d.date));
      const costForDay = dayOrders.reduce((s, o) => s + o.order_items.reduce((ss, it) => ss + (costMap.get(it.product_slug ?? "") ?? 0) * it.quantity, 0), 0);
      return { ...d, revenue: d.value, profit: d.value - costForDay, cost: costForDay };
    });
    const dailyOrders = bucketByDay(list, days, () => 1);
    const top = [...productSales.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8);
    const statusData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

    const half = Math.max(1, Math.floor(days / 2));
    const lastRev = daily.slice(-half).reduce((s, d) => s + d.revenue, 0);
    const prevRev = daily.slice(0, half).reduce((s, d) => s + d.revenue, 0);
    const revDelta = prevRev === 0 ? (lastRev > 0 ? 100 : 0) : ((lastRev - prevRev) / prevRev) * 100;
    const lastOrders = dailyOrders.slice(-half).reduce((s, d) => s + d.value, 0);
    const prevOrders = dailyOrders.slice(0, half).reduce((s, d) => s + d.value, 0);
    const ordersDelta = prevOrders === 0 ? (lastOrders > 0 ? 100 : 0) : ((lastOrders - prevOrders) / prevOrders) * 100;

    // Fulfillment pipeline (real statuses)
    const pipelineStages = ["pending", "processing", "shipped", "delivered"] as const;
    const pipeline = pipelineStages.map((s) => ({ stage: s, count: statusCounts[s] ?? 0 }));
    const cancelled = (statusCounts.cancelled ?? 0);
    const returned = (statusCounts.returned ?? 0) + (statusCounts.refunded ?? 0);

    return {
      revenue, cost, grossProfit, netProfit, refunds, units, aov, daily, dailyOrders, top,
      statusData, revDelta, ordersDelta, repeatBuyers, convRate, lowStock, pipeline, cancelled, returned,
      orderCount: list.length, margin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
    };
  }, [orders, products, days]);

  // ---- Intelligence layer (derived from real data, never fabricated) ----
  const insights = useMemo(() => {
    const out: { tone: "good" | "warn" | "bad" | "info"; icon: React.ReactNode; text: string }[] = [];
    if (orders === null) return out;
    if (stats.revDelta > 5) out.push({ tone: "good", icon: <TrendingUp className="size-3.5" />, text: `Revenue momentum up ${stats.revDelta.toFixed(0)}% in the recent half of this range.` });
    else if (stats.revDelta < -5) out.push({ tone: "bad", icon: <TrendingDown className="size-3.5" />, text: `Revenue cooled ${Math.abs(stats.revDelta).toFixed(0)}% — review traffic and pricing.` });
    if (stats.lowStock.length) {
      const top = stats.lowStock.sort((a, b) => b.views_count - a.views_count)[0];
      out.push({ tone: "warn", icon: <Package className="size-3.5" />, text: `Low-stock risk on ${stats.lowStock.length} product${stats.lowStock.length > 1 ? "s" : ""}${top ? ` — restock “${top.name}” (high demand)` : ""}.` });
    }
    if (stats.orderCount > 0) {
      const repeatPct = (stats.repeatBuyers / stats.orderCount) * 100;
      if (repeatPct >= 20) out.push({ tone: "good", icon: <Repeat className="size-3.5" />, text: `Strong retention — ${repeatPct.toFixed(0)}% of orders come from repeat buyers.` });
      else out.push({ tone: "info", icon: <Users className="size-3.5" />, text: `Repeat-buyer share is ${repeatPct.toFixed(0)}% — opportunity to grow loyalty.` });
    }
    if (stats.returned > 0 && stats.orderCount > 0) {
      const rRate = (stats.returned / stats.orderCount) * 100;
      if (rRate > 8) out.push({ tone: "bad", icon: <RotateCcw className="size-3.5" />, text: `Return/refund rate at ${rRate.toFixed(0)}% — investigate product quality.` });
    }
    if (stats.margin > 0) out.push({ tone: "info", icon: <Gauge className="size-3.5" />, text: `Gross margin holding at ${stats.margin.toFixed(0)}% across ${stats.orderCount} orders.` });
    if (!out.length) out.push({ tone: "info", icon: <Sparkles className="size-3.5" />, text: "Collecting signals — insights surface as orders flow in." });
    return out;
  }, [orders, stats]);

  const loading = orders === null || products === null;

  return (
    <AdminShell title="Analytics" subtitle="Realtime commerce intelligence" actions={
      <>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 backdrop-blur px-2.5 py-1">
          <span className={`relative flex size-1.5 ${conn === "live" ? "" : "opacity-60"}`}>
            <span className={`absolute inline-flex h-full w-full rounded-full ${conn === "live" ? "bg-emerald-400 animate-ping" : conn === "error" ? "bg-rose-400" : "bg-amber-400"} opacity-60`} />
            <span className={`relative inline-flex size-1.5 rounded-full ${conn === "live" ? "bg-emerald-400" : conn === "error" ? "bg-rose-400" : "bg-amber-400"}`} />
          </span>
          {conn === "error" ? <WifiOff className="size-3 text-rose-400" /> : <Wifi className="size-3 text-muted-foreground" />}
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{conn === "live" ? "Live" : conn === "error" ? "Offline" : "Sync"}</span>
        </div>
        <div className="inline-flex rounded-full border border-border bg-card p-0.5">
          {([7, 14, 30, 90] as const).map((p) => (
            <button key={p} onClick={() => setDays(p)}
              className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest rounded-full transition-colors ${days === p ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {p}d
            </button>
          ))}
        </div>
        <button onClick={() => downloadCSV(`analytics-${days}d.csv`, stats.daily.map((d) => ({ date: d.date, revenue: d.revenue, cost: d.cost, profit: d.profit })))}
          className="inline-flex items-center gap-2 border border-border px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-mono hover:bg-white/5">
          <Download className="size-3" /> Export
        </button>
      </>
    }>
      <Atmosphere />

      {/* KPI grid — asymmetric, revenue featured */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
        <div className="col-span-2 sm:col-span-1 sm:row-span-2">
          <FeaturedRevenue value={stats.revenue} delta={stats.revDelta} sub={`${stats.orderCount} orders · ${stats.margin.toFixed(0)}% margin`} />
        </div>
        <MiniStat i={0} label="Gross Profit" value={stats.grossProfit} icon={<DollarSign className="size-3.5" />} prefix="$" />
        <MiniStat i={1} label="Net Profit" value={stats.netProfit} icon={<DollarSign className="size-3.5" />} prefix="$" />
        <MiniStat i={2} label="Orders" value={stats.orderCount} icon={<ShoppingBag className="size-3.5" />} delta={stats.ordersDelta} />
        <MiniStat i={3} label="Avg Order" value={stats.aov} icon={<TrendingUp className="size-3.5" />} prefix="$" decimals={2} />
        <MiniStat i={4} label="Conversion" value={stats.convRate} icon={<Percent className="size-3.5" />} suffix="%" decimals={2} />
        <MiniStat i={5} label="Repeat Buyers" value={stats.repeatBuyers} icon={<Repeat className="size-3.5" />} />
      </div>

      {/* Intelligence layer */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
        className="card-ambient noise-layer rounded-2xl p-4 sm:p-5 mb-6"
      >
        <div className="flex items-center gap-2 mb-3 text-accent">
          <Sparkles className="size-4" />
          <h2 className="text-[11px] font-mono uppercase tracking-[0.25em]">Commerce Intelligence</h2>
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            <Activity className="size-3" /> derived live
          </span>
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          <AnimatePresence mode="popLayout">
            {insights.map((ins, idx) => (
              <motion.div
                key={ins.text}
                layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: EASE, delay: idx * 0.04 }}
                className="flex items-start gap-2.5 rounded-xl border border-border/40 bg-background/30 px-3 py-2.5"
              >
                <span className={`mt-0.5 shrink-0 ${
                  ins.tone === "good" ? "text-emerald-400" : ins.tone === "bad" ? "text-rose-400" : ins.tone === "warn" ? "text-amber-400" : "text-sky-400"
                }`}>{ins.icon}</span>
                <p className="text-xs leading-relaxed text-foreground/90">{ins.text}</p>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Primary graph — revenue vs profit */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}
          className="lg:col-span-2 card-ambient glass-reflect rounded-2xl p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium">Revenue vs profit</h2>
            <DeltaBadge delta={stats.revDelta} />
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={stats.daily}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="oklch(0.74 0.19 49)" stopOpacity={0.45} /><stop offset="100%" stopColor="oklch(0.74 0.19 49)" stopOpacity={0} /></linearGradient>
                <linearGradient id="prof" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="oklch(0.78 0.12 195)" stopOpacity={0.4} /><stop offset="100%" stopColor="oklch(0.78 0.12 195)" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="label" stroke="rgba(255,255,255,0.35)" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="rgba(255,255,255,0.35)" fontSize={10} tickLine={false} axisLine={false} width={32} />
              <Tooltip content={<GlowTooltip money />} />
              <Area type="monotone" dataKey="revenue" stroke="oklch(0.74 0.19 49)" strokeWidth={2} fill="url(#rev)" isAnimationActive animationDuration={700} />
              <Area type="monotone" dataKey="profit" stroke="oklch(0.78 0.12 195)" strokeWidth={2} fill="url(#prof)" isAnimationActive animationDuration={900} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Fulfillment pipeline (real order statuses) */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE, delay: 0.05 }}
          className="card-ambient rounded-2xl p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Truck className="size-4 text-accent" />
            <h2 className="text-sm font-medium">Fulfillment pipeline</h2>
          </div>
          <div className="space-y-3">
            {stats.pipeline.map((s, i) => {
              const max = Math.max(1, ...stats.pipeline.map((p) => p.count));
              return (
                <div key={s.stage}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="capitalize text-muted-foreground">{s.stage}</span>
                    <span className="font-mono tabular-nums">{s.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }} animate={{ width: `${(s.count / max) * 100}%` }}
                      transition={{ duration: 0.8, ease: EASE, delay: i * 0.08 }}
                      className="h-full rounded-full" style={{ background: STATUS_TONE[s.stage] }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/40">
              <div className="rounded-xl bg-background/30 px-3 py-2">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-1"><AlertTriangle className="size-3 text-rose-400" /> Cancelled</p>
                <p className="font-display font-semibold tabular-nums"><AnimatedNumber value={stats.cancelled} /></p>
              </div>
              <div className="rounded-xl bg-background/30 px-3 py-2">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-1"><RotateCcw className="size-3 text-violet-400" /> Returns</p>
                <p className="font-display font-semibold tabular-nums"><AnimatedNumber value={stats.returned} /></p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Homepage section analytics */}
      <SectionAnalyticsPanel days={days} />

      {/* Secondary charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}
          className="card-ambient rounded-2xl p-5"
        >
          <h2 className="text-sm font-medium mb-4">Orders per day</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.dailyOrders}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="label" stroke="rgba(255,255,255,0.35)" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="rgba(255,255,255,0.35)" fontSize={10} tickLine={false} axisLine={false} width={28} />
              <Tooltip content={<GlowTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar dataKey="value" fill="oklch(0.6 0.18 290)" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={700} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE, delay: 0.05 }}
          className="card-ambient rounded-2xl p-5"
        >
          <h2 className="text-sm font-medium mb-4">Cost trend</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={stats.daily}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="label" stroke="rgba(255,255,255,0.35)" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="rgba(255,255,255,0.35)" fontSize={10} tickLine={false} axisLine={false} width={32} />
              <Tooltip content={<GlowTooltip money />} />
              <Line type="monotone" dataKey="cost" stroke="oklch(0.78 0.15 70)" strokeWidth={2} dot={false} isAnimationActive animationDuration={900} />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Top products */}
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}
        className="card-ambient rounded-2xl p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium flex items-center gap-2"><Zap className="size-4 text-accent" /> Top products</h2>
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{stats.top.length} ranked</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border">
              <tr><th className="text-left py-2">Product</th><th className="text-right py-2">Units</th><th className="text-right py-2">Revenue</th><th className="text-right py-2">Cost</th><th className="text-right py-2">Profit</th><th className="text-right py-2">Margin</th></tr>
            </thead>
            <tbody>
              {stats.top.map((p) => {
                const margin = p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue) * 100 : 0;
                return (
                  <tr key={p.slug} className="border-b border-border/40 last:border-0 hover:bg-white/[0.02] transition-colors">
                    <td className="py-2 text-xs">{p.name}</td>
                    <td className="py-2 text-right font-mono text-xs">{p.units}</td>
                    <td className="py-2 text-right font-mono text-accent">${p.revenue.toFixed(2)}</td>
                    <td className="py-2 text-right font-mono text-xs text-muted-foreground">${p.cost.toFixed(2)}</td>
                    <td className="py-2 text-right font-mono">${(p.revenue - p.cost).toFixed(2)}</td>
                    <td className="py-2 text-right font-mono text-xs">{margin.toFixed(1)}%</td>
                  </tr>
                );
              })}
              {!stats.top.length && !loading && (
                <tr><td colSpan={6} className="py-8 text-center text-xs text-muted-foreground">No sales recorded in this range yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </AdminShell>
  );
}
