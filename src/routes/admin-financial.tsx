import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Wallet, TrendingUp, TrendingDown, Receipt, Truck, Download, FileText,
  Search, Bell, RotateCcw, Percent, Banknote, PiggyBank, AlertTriangle,
  RefreshCw, Sparkles, ShoppingCart, Globe, Radio, Loader2,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchFinancialData, computeSummary, monthlyBreakdown, revenueSeries,
  expenseBreakdown, refundReasons, salesSources, countryRevenue,
  detectAnomalies, forecastNext, extendedMetrics, productProfitability,
  taxReport, cohortRetention, type FinancialData, type Granularity,
} from "@/lib/financial-metrics";

export const Route = createFileRoute("/admin-financial")({
  head: () => ({
    meta: [
      { title: "Financial Dashboard — FoundOurMarket™" },
      { name: "description", content: "Profit & loss, refunds, taxes, shipping and operational earnings — real-time commerce intelligence." },
    ],
  }),
  component: FinancialPage,
});

const EASE = [0.16, 1, 0.3, 1] as const;
const fmt = (n: number, c = "USD") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: c, maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0);
const fmt2 = (n: number, c = "USD") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: c, maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0);

/* ---------- atmosphere ---------- */
function Atmosphere() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="orb animate-mesh" style={{ top: "-12%", left: "-6%", width: "46vw", height: "46vw", background: "var(--gradient-ember-soft)" }} />
      <div className="orb animate-mesh" style={{ bottom: "-16%", right: "-10%", width: "52vw", height: "52vw", background: "var(--gradient-ember-soft)", animationDelay: "-7s" }} />
      <div className="absolute inset-0 grid-texture opacity-30" />
      <div className="absolute inset-0" style={{ background: "radial-gradient(120% 80% at 50% -10%, transparent 60%, oklch(0 0 0 / 0.55) 100%)" }} />
    </div>
  );
}

/* ---------- animated number ---------- */
function AnimatedMoney({ value, currency, decimals = false }: { value: number; currency: string; decimals?: boolean }) {
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 90, damping: 20 });
  const [txt, setTxt] = useState(decimals ? fmt2(0, currency) : fmt(0, currency));
  useEffect(() => { mv.set(value); }, [value, mv]);
  useEffect(() => spring.on("change", (v) => setTxt(decimals ? fmt2(v, currency) : fmt(v, currency))), [spring, currency, decimals]);
  return <span className="tabular-nums">{txt}</span>;
}

/* ---------- KPI tile ---------- */
function StatTile({ label, value, icon, accent = "amber", delta, sub, big = false, delay = 0 }: {
  label: string; value: ReactNode; icon: ReactNode; accent?: "amber" | "teal" | "violet" | "rose" | "emerald";
  delta?: number | null; sub?: ReactNode; big?: boolean; delay?: number;
}) {
  const tones: Record<string, string> = {
    amber: "text-accent", teal: "text-teal-300", violet: "text-violet-300", rose: "text-rose-300", emerald: "text-emerald-300",
  };
  const positive = (delta ?? 0) >= 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: EASE }} whileHover={{ y: -3 }}
      className={`group relative overflow-hidden rounded-2xl glass glass-reflect p-4 ${big ? "sm:col-span-2" : ""}`}
      style={{ boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.06), 0 18px 40px -28px oklch(0 0 0 / 0.8)" }}
    >
      <div className="pointer-events-none absolute -top-10 -right-8 size-24 rounded-full opacity-25 group-hover:opacity-45 transition-opacity duration-500" style={{ background: "var(--gradient-ember-soft)", filter: "blur(22px)" }} />
      <div className="relative flex items-center gap-2 mb-2.5">
        <span className={tones[accent]}>{icon}</span>
        <span className="text-[9px] font-mono uppercase tracking-[0.26em] text-muted-foreground/80">{label}</span>
      </div>
      <p className={`relative font-display font-semibold leading-none ${big ? "text-3xl" : "text-xl"}`}>{value}</p>
      <div className="relative mt-2 flex items-center gap-2 flex-wrap">
        {delta != null && (
          <span className={`inline-flex items-center gap-0.5 text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${positive ? "text-emerald-300 border-emerald-400/30 bg-emerald-400/10" : "text-rose-300 border-rose-400/30 bg-rose-400/10"}`}>
            {positive ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {sub && <span className="text-[10px] text-muted-foreground/80">{sub}</span>}
      </div>
    </motion.div>
  );
}

function SkeletonTile() {
  return <div className="rounded-2xl glass p-4 animate-pulse h-[104px]"><div className="h-2.5 w-16 bg-white/10 rounded mb-4" /><div className="h-6 w-24 bg-white/10 rounded" /></div>;
}

function Panel({ title, icon, actions, children, delay = 0 }: { title: string; icon?: ReactNode; actions?: ReactNode; children: ReactNode; delay?: number }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay, ease: EASE }}
      className="relative overflow-hidden rounded-2xl glass glass-reflect"
      style={{ boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.05), 0 22px 50px -32px oklch(0 0 0 / 0.85)" }}
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="text-accent shrink-0">{icon}</span>}
          <h2 className="text-[13px] font-medium truncate">{title}</h2>
        </div>
        {actions}
      </div>
      <div className="px-2 pb-3 sm:px-4 sm:pb-4">{children}</div>
    </motion.section>
  );
}

const glassTooltip = { background: "oklch(0.16 0.01 260 / 0.92)", border: "1px solid oklch(1 0 0 / 0.1)", borderRadius: 12, fontSize: 11, backdropFilter: "blur(10px)" };

function EmptyState({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="h-[200px] grid place-items-center text-center">
      <div>
        <div className="size-10 mx-auto mb-3 grid place-items-center rounded-full border border-white/10 bg-white/[0.03] text-muted-foreground">{icon}</div>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

/* ================= PAGE ================= */
function FinancialPage() {
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [granularity, setGranularity] = useState<Granularity>("month");
  const [range, setRange] = useState(365);
  const [live, setLive] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const d = await fetchFinancialData(range);
      setData(d);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  // Realtime — refetch (debounced) when financial tables change
  useEffect(() => {
    const trigger = () => {
      clearTimeout(debounce.current);
      debounce.current = setTimeout(() => load(true), 900);
    };
    const ch = supabase
      .channel("financial-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, trigger)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, trigger)
      .on("postgres_changes", { event: "*", schema: "public", table: "returns" }, trigger)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, trigger)
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    const poll = setInterval(() => load(true), 45_000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); clearTimeout(debounce.current); };
  }, [load]);

  const m = useMemo(() => {
    if (!data) return null;
    const summary = computeSummary(data);
    const months = monthlyBreakdown(data);
    return {
      summary, months,
      series: revenueSeries(data, granularity),
      expenses: expenseBreakdown(summary),
      reasons: refundReasons(data),
      sources: salesSources(data),
      countries: countryRevenue(data),
      anomalies: detectAnomalies(data, summary, months),
      forecast: forecastNext(months),
    };
  }, [data, granularity]);

  const cur = data?.currency ?? "USD";

  /* ---- exports ---- */
  const exportCSV = useCallback(() => {
    if (!m) return;
    const rows = m.months.map((r) => ({
      Month: r.month, Orders: r.orders, Revenue: r.revenue.toFixed(2), Cost: r.cost.toFixed(2),
      Refunds: r.refunds.toFixed(2), Shipping: r.shipping.toFixed(2), Tax: r.tax.toFixed(2),
      NetProfit: r.net.toFixed(2), MarginPct: r.margin.toFixed(1),
    }));
    const headers = Object.keys(rows[0] ?? { Month: "" });
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => esc((r as Record<string, unknown>)[h])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `foundourmarket-financial-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }, [m]);

  const exportPDF = useCallback(() => window.print(), []);

  const navActions = (
    <>
      <button aria-label="Search" className="size-8 grid place-items-center rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-accent/30 hover:bg-white/[0.06] transition-all active:scale-95"><Search className="size-4" /></button>
      <NotifBell />
      <Link to="/admin" aria-label="Orders" className="relative size-8 grid place-items-center rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-accent/30 hover:bg-white/[0.06] transition-all active:scale-95">
        <ShoppingCart className="size-4" />
        {m && m.summary.paidOrders > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 grid place-items-center rounded-full bg-accent text-accent-foreground text-[9px] font-mono">{m.summary.paidOrders > 99 ? "99+" : m.summary.paidOrders}</span>
        )}
      </Link>
      <span className="size-8 grid place-items-center rounded-xl bg-gradient-to-br from-accent/25 to-primary/10 ring-1 ring-inset ring-white/10 text-[11px] font-display text-accent uppercase">F</span>
    </>
  );

  return (
    <AdminShell
      title="Financial Dashboard"
      subtitle="Profit & loss, refunds, taxes, shipping and operational earnings."
      allow={["admin", "super_admin", "manager"]}
      actions={navActions}
    >
      <Atmosphere />

      {/* sticky filter bar */}
      <div className="sticky top-[3.25rem] lg:top-2 z-10 -mx-1 mb-5 px-1">
        <div className="flex items-center gap-2 overflow-x-auto rounded-2xl glass px-3 py-2.5 no-scrollbar" style={{ boxShadow: "0 14px 36px -26px oklch(0 0 0 / 0.8)" }}>
          <span className="inline-flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.22em] shrink-0 pr-1">
            <span className={`size-1.5 rounded-full ${live ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground/40"}`} />
            <Radio className="size-3 text-accent" /> {live ? "Live" : "Sync"}
          </span>
          <div className="h-4 w-px bg-white/10 shrink-0" />
          {/* range */}
          {[{ d: 30, l: "30D" }, { d: 90, l: "90D" }, { d: 365, l: "1Y" }].map((r) => (
            <button key={r.d} onClick={() => setRange(r.d)} className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest transition-all ${range === r.d ? "bg-accent/15 text-accent ring-1 ring-inset ring-accent/30" : "text-muted-foreground hover:text-foreground"}`}>{r.l}</button>
          ))}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <button onClick={() => load(true)} disabled={refreshing} className="size-7 grid place-items-center rounded-lg bg-white/[0.03] border border-white/[0.08] hover:border-accent/30 transition-all active:scale-95"><RefreshCw className={`size-3.5 ${refreshing ? "animate-spin text-accent" : ""}`} /></button>
            <button onClick={exportCSV} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-widest bg-white/[0.04] border border-white/[0.08] hover:border-accent/30 transition-all active:scale-95"><Download className="size-3" /> CSV</button>
            <button onClick={exportPDF} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-widest bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 transition-all active:scale-95"><FileText className="size-3" /> PDF</button>
          </div>
        </div>
      </div>

      {/* anomaly intelligence */}
      {m && m.anomalies.length > 0 && (
        <div className="mb-5 grid gap-2 sm:grid-cols-2">
          {m.anomalies.map((a, i) => (
            <motion.div key={a.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05, ease: EASE }}
              className={`flex items-start gap-2.5 rounded-xl glass px-3 py-2.5 border-l-2 ${a.severity === "critical" ? "border-rose-400" : a.severity === "warning" ? "border-amber-400" : "border-sky-400"}`}>
              <AlertTriangle className={`size-3.5 mt-0.5 shrink-0 ${a.severity === "critical" ? "text-rose-300" : a.severity === "warning" ? "text-amber-300" : "text-sky-300"}`} />
              <div className="min-w-0">
                <p className="text-xs font-medium">{a.title}</p>
                <p className="text-[11px] text-muted-foreground leading-snug">{a.detail}</p>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {loading || !m ? (
          Array.from({ length: 10 }).map((_, i) => <SkeletonTile key={i} />)
        ) : (
          <>
            <StatTile big label="Total Revenue" accent="amber" icon={<TrendingUp className="size-4" />} value={<AnimatedMoney value={m.summary.revenue} currency={cur} />} sub={`${m.summary.paidOrders} paid orders`} delay={0} />
            <StatTile label="Cost of Goods" accent="rose" icon={<TrendingDown className="size-4" />} value={<AnimatedMoney value={m.summary.cogs} currency={cur} />} delay={0.04} />
            <StatTile label="Gross Profit" accent="teal" icon={<Wallet className="size-4" />} value={<AnimatedMoney value={m.summary.grossProfit} currency={cur} />} delay={0.08} />
            <StatTile label="Net Earnings" accent="emerald" icon={<PiggyBank className="size-4" />} value={<AnimatedMoney value={m.summary.netEarnings} currency={cur} />} delay={0.12} />
            <StatTile label="Profit Margin" accent="violet" icon={<Percent className="size-4" />} value={<span className="tabular-nums">{m.summary.margin.toFixed(1)}%</span>} delay={0.16} />
            <StatTile label="Refunds" accent="rose" icon={<RotateCcw className="size-4" />} value={<AnimatedMoney value={m.summary.refunds} currency={cur} />} delay={0.2} />
            <StatTile label="Shipping" accent="teal" icon={<Truck className="size-4" />} value={<AnimatedMoney value={m.summary.shipping} currency={cur} />} delay={0.24} />
            <StatTile label="Tax Collected" accent="violet" icon={<Receipt className="size-4" />} value={<AnimatedMoney value={m.summary.tax} currency={cur} />} delay={0.28} />
            <StatTile label="Pending Payouts" accent="amber" icon={<Banknote className="size-4" />} value={<AnimatedMoney value={m.summary.pendingPayouts} currency={cur} />} delay={0.32} />
            <StatTile label="Avg Order Value" accent="emerald" icon={<ShoppingCart className="size-4" />} value={<AnimatedMoney value={m.summary.aov} currency={cur} decimals />} delay={0.36} />
          </>
        )}
      </div>

      {/* charts */}
      <div className="grid gap-4 lg:grid-cols-2 mb-4">
        {/* Revenue growth with toggle */}
        <Panel title="Revenue Growth" icon={<TrendingUp className="size-4" />} delay={0.05}
          actions={
            <div className="flex items-center gap-1 rounded-full bg-white/[0.03] border border-white/[0.08] p-0.5">
              {(["day", "week", "month"] as Granularity[]).map((g) => (
                <button key={g} onClick={() => setGranularity(g)} className={`px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-widest transition-all ${granularity === g ? "bg-accent/20 text-accent" : "text-muted-foreground"}`}>{g[0].toUpperCase()}{g.slice(1, 1)}{g === "day" ? "D" : g === "week" ? "W" : "M"}</button>
              ))}
            </div>
          }>
          {!m ? <EmptyState icon={<Loader2 className="size-4 animate-spin" />} label="Loading…" /> : m.series.every((s) => s.revenue === 0) ? <EmptyState icon={<TrendingUp className="size-4" />} label="No revenue recorded for this range yet." /> : (
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={m.series}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f59e0b" stopOpacity={0.5} /><stop offset="100%" stopColor="#f59e0b" stopOpacity={0} /></linearGradient>
                  <linearGradient id="netA" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34d399" stopOpacity={0.35} /><stop offset="100%" stopColor="#34d399" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid stroke="oklch(1 0 0 / 0.05)" vertical={false} />
                <XAxis dataKey="label" stroke="oklch(0.7 0.02 260 / 0.5)" fontSize={9} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis stroke="oklch(0.7 0.02 260 / 0.5)" fontSize={9} tickLine={false} axisLine={false} width={34} />
                <Tooltip contentStyle={glassTooltip} formatter={(v: number, n) => [fmt(v, cur), n === "revenue" ? "Revenue" : "Net"]} />
                <Area type="monotone" dataKey="revenue" stroke="#f59e0b" strokeWidth={2} fill="url(#rev)" />
                <Area type="monotone" dataKey="net" stroke="#34d399" strokeWidth={2} fill="url(#netA)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Panel>

        {/* Monthly P&L */}
        <Panel title="Monthly P&L" icon={<BarChart3Icon />} delay={0.1}>
          {!m ? <EmptyState icon={<Loader2 className="size-4 animate-spin" />} label="Loading…" /> : m.months.length === 0 ? <EmptyState icon={<Receipt className="size-4" />} label="No monthly data yet." /> : (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={m.months}>
                <CartesianGrid stroke="oklch(1 0 0 / 0.05)" vertical={false} />
                <XAxis dataKey="label" stroke="oklch(0.7 0.02 260 / 0.5)" fontSize={9} tickLine={false} axisLine={false} />
                <YAxis stroke="oklch(0.7 0.02 260 / 0.5)" fontSize={9} tickLine={false} axisLine={false} width={34} />
                <Tooltip contentStyle={glassTooltip} formatter={(v: number, n) => [fmt(v, cur), String(n)]} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="revenue" name="Revenue" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                <Bar dataKey="net" name="Net" fill="#34d399" radius={[3, 3, 0, 0]} />
                <Bar dataKey="refunds" name="Refunds" fill="#f43f5e" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        {/* Expense breakdown pie */}
        <Panel title="Expense Breakdown" icon={<PieIcon />} delay={0.15}>
          {!m || m.expenses.length === 0 ? <EmptyState icon={<Wallet className="size-4" />} label="No expenses recorded yet." /> : (
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={m.expenses} dataKey="value" nameKey="name" innerRadius={52} outerRadius={84} paddingAngle={3} stroke="none">
                  {m.expenses.map((e) => <Cell key={e.name} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={glassTooltip} formatter={(v: number, n) => [fmt(v, cur), String(n)]} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>

        {/* Sales source breakdown */}
        <Panel title="Sales Source" icon={<Globe className="size-4" />} delay={0.2}>
          {!m || m.sources.length === 0 ? <EmptyState icon={<Globe className="size-4" />} label="No traffic attribution yet." /> : (
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={m.sources} dataKey="value" nameKey="name" innerRadius={52} outerRadius={84} paddingAngle={3} stroke="none">
                  {m.sources.map((e) => <Cell key={e.name} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={glassTooltip} formatter={(v: number, n) => [`${v} visits`, String(n)]} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>

        {/* Refund analytics */}
        <Panel title="Refund Reasons" icon={<RotateCcw className="size-4" />} delay={0.25}>
          {!m || m.reasons.length === 0 ? <EmptyState icon={<RotateCcw className="size-4" />} label="No refund requests yet." /> : (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={m.reasons} layout="vertical">
                <CartesianGrid stroke="oklch(1 0 0 / 0.05)" horizontal={false} />
                <XAxis type="number" stroke="oklch(0.7 0.02 260 / 0.5)" fontSize={9} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="reason" stroke="oklch(0.7 0.02 260 / 0.5)" fontSize={9} tickLine={false} axisLine={false} width={92} />
                <Tooltip contentStyle={glassTooltip} formatter={(v: number) => [fmt(v, cur), "Refunded"]} />
                <Bar dataKey="amount" fill="#f43f5e" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        {/* Country revenue */}
        <Panel title="Revenue by Country" icon={<Globe className="size-4" />} delay={0.3}>
          {!m || m.countries.length === 0 ? <EmptyState icon={<Globe className="size-4" />} label="No geographic revenue yet." /> : (
            <div className="space-y-2 px-2 py-2">
              {m.countries.map((c, i) => {
                const max = m.countries[0].revenue || 1;
                return (
                  <div key={c.country} className="flex items-center gap-3">
                    <span className="w-20 text-[11px] truncate text-muted-foreground">{c.country}</span>
                    <div className="flex-1 h-5 rounded-md bg-white/[0.04] overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${(c.revenue / max) * 100}%` }} transition={{ delay: i * 0.05, ease: EASE }} className="h-full rounded-md bg-gradient-to-r from-accent/80 to-accent/30" />
                    </div>
                    <span className="w-16 text-right text-[11px] font-mono tabular-nums">{fmt(c.revenue, cur)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* AI forecast */}
      {m?.forecast && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: EASE }}
          className="mb-4 flex items-center gap-3 rounded-2xl glass px-4 py-3.5 border border-accent/15">
          <Sparkles className="size-4 text-accent shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground">Forecast · {m.forecast.label}</p>
            <p className="text-sm">Projected revenue <span className="text-accent font-medium">{fmt(m.forecast.revenue, cur)}</span> · net <span className={m.forecast.net >= 0 ? "text-emerald-300" : "text-rose-300"}>{fmt(m.forecast.net, cur)}</span></p>
          </div>
          <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/70 shrink-0">Linear trend</span>
        </motion.div>
      )}

      {/* Monthly breakdown table */}
      <Panel title="Monthly Breakdown" icon={<Receipt className="size-4" />} delay={0.1}>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-sm min-w-[680px]">
            <thead className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground/80 border-b border-white/[0.07]">
              <tr>
                {["Month", "Orders", "Revenue", "Costs", "Refunds", "Net", "Margin"].map((h, i) => (
                  <th key={h} className={`py-2.5 px-3 ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m?.months.slice().reverse().map((r) => (
                <tr key={r.month} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                  <td className="px-3 py-2 font-mono text-xs">{r.label}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{r.orders}</td>
                  <td className="px-3 py-2 text-right font-mono text-accent text-xs">{fmt(r.revenue, cur)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">{fmt(r.cost, cur)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-rose-300">{fmt(r.refunds, cur)}</td>
                  <td className={`px-3 py-2 text-right font-mono text-xs ${r.net >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{fmt(r.net, cur)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{r.margin.toFixed(1)}%</td>
                </tr>
              ))}
              {(!m || m.months.length === 0) && <tr><td colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No financial data for this range.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2 mt-4 pb-24 lg:pb-8">
        {/* Recent transactions */}
        <Panel title="Recent Transactions" icon={<Banknote className="size-4" />} delay={0.12}>
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-sm min-w-[420px]">
              <thead className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground/80 border-b border-white/[0.07]">
                <tr><th className="py-2.5 px-3 text-left">Txn</th><th className="px-3 text-right">Amount</th><th className="px-3 text-left">Gateway</th><th className="px-3 text-right">Status</th></tr>
              </thead>
              <tbody>
                {data?.payments.slice(0, 8).map((p) => (
                  <tr key={p.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                    <td className="px-3 py-2 font-mono text-[11px] truncate max-w-[120px]">{p.transaction_id || p.id.slice(0, 8)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{fmt2(Number(p.amount), p.currency || cur)}</td>
                    <td className="px-3 py-2 text-[11px] capitalize">{p.method || "—"}</td>
                    <td className="px-3 py-2 text-right"><StatusPill status={p.status} /></td>
                  </tr>
                ))}
                {(!data || data.payments.length === 0) && <tr><td colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No transactions yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Refund requests */}
        <Panel title="Refund Requests" icon={<RotateCcw className="size-4" />} delay={0.14}>
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-sm min-w-[420px]">
              <thead className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground/80 border-b border-white/[0.07]">
                <tr><th className="py-2.5 px-3 text-left">Order</th><th className="px-3 text-left">Reason</th><th className="px-3 text-right">Amount</th><th className="px-3 text-right">Status</th></tr>
              </thead>
              <tbody>
                {data?.returns.slice(0, 8).map((r) => (
                  <tr key={r.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                    <td className="px-3 py-2 font-mono text-[11px]">#{r.order_id.slice(0, 8)}</td>
                    <td className="px-3 py-2 text-[11px] truncate max-w-[120px] capitalize">{r.reason || "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-rose-300">{fmt2(Number(r.refund_amount), cur)}</td>
                    <td className="px-3 py-2 text-right"><StatusPill status={r.status} /></td>
                  </tr>
                ))}
                {(!data || data.returns.length === 0) && <tr><td colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No refund requests.</td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      {/* Mobile quick-action dock */}
      <FinanceDock onRefresh={() => load(true)} onCSV={exportCSV} onPDF={exportPDF} refreshing={refreshing} />
    </AdminShell>
  );
}

/* ---------- small components ---------- */
function StatusPill({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  const tone =
    /paid|captured|succeeded|completed|approved|delivered/.test(s) ? "text-emerald-300 border-emerald-400/30 bg-emerald-400/10"
    : /pending|processing|requested|requires/.test(s) ? "text-amber-300 border-amber-400/30 bg-amber-400/10"
    : /failed|rejected|cancelled|refunded/.test(s) ? "text-rose-300 border-rose-400/30 bg-rose-400/10"
    : "text-muted-foreground border-white/10 bg-white/[0.03]";
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-widest border ${tone}`}>{status || "—"}</span>;
}

function NotifBell() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", u.user.id).is("read_at", null);
      if (active) setCount(count ?? 0);
    };
    load();
    const ch = supabase.channel("fin-notif").on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, load).subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, []);
  return (
    <Link to="/account/notifications" aria-label="Notifications" className="relative size-8 grid place-items-center rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-accent/30 hover:bg-white/[0.06] transition-all active:scale-95">
      <Bell className="size-4" />
      {count > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 grid place-items-center rounded-full bg-rose-500 text-white text-[9px] font-mono">{count > 99 ? "99+" : count}</span>}
    </Link>
  );
}

function FinanceDock({ onRefresh, onCSV, onPDF, refreshing }: { onRefresh: () => void; onCSV: () => void; onPDF: () => void; refreshing: boolean }) {
  return (
    <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 print:hidden">
      <div className="mx-auto max-w-sm flex items-center justify-around rounded-2xl glass-strong px-2 py-2" style={{ boxShadow: "0 -8px 30px -16px oklch(0 0 0 / 0.8), inset 0 1px 0 oklch(1 0 0 / 0.06)" }}>
        <DockBtn icon={<RefreshCw className={`size-4 ${refreshing ? "animate-spin text-accent" : ""}`} />} label="Sync" onClick={onRefresh} />
        <DockBtn icon={<Download className="size-4" />} label="CSV" onClick={onCSV} />
        <DockBtn icon={<FileText className="size-4" />} label="PDF" onClick={onPDF} />
        <Link to="/admin" className="flex flex-col items-center gap-0.5 px-3 py-1 text-muted-foreground hover:text-foreground transition-colors">
          <Wallet className="size-4" />
          <span className="text-[9px] font-mono uppercase tracking-widest">Admin</span>
        </Link>
      </div>
    </div>
  );
}
function DockBtn({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-0.5 px-3 py-1 text-muted-foreground hover:text-accent transition-colors active:scale-95">
      {icon}
      <span className="text-[9px] font-mono uppercase tracking-widest">{label}</span>
    </button>
  );
}

/* tiny inline icons to avoid extra imports clutter */
function BarChart3Icon() { return <Receipt className="size-4" />; }
function PieIcon() { return <Wallet className="size-4" />; }
