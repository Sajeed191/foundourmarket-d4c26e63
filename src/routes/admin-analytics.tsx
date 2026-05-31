import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import {
  TrendingUp, TrendingDown, ShoppingBag, DollarSign, Percent, Repeat, Download,
  Wifi, WifiOff, Sparkles, AlertTriangle, Package, RotateCcw, Activity, Truck,
  Gauge, Users, CreditCard, LifeBuoy, ShieldAlert, Boxes, Globe, FileSpreadsheet,
  FileText, Loader2, Crown, Eye, Heart,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { downloadCSV } from "@/lib/admin-queries";
import {
  getExecutiveAnalyticsFn, logAnalyticsExportFn, type ExecutiveAnalytics,
} from "@/lib/executive-analytics.functions";

export const Route = createFileRoute("/admin-analytics")({
  head: () => ({
    meta: [
      { title: "Executive Analytics — Business Intelligence" },
      { name: "description", content: "Enterprise executive business intelligence: live revenue, profit, product, customer, payment, shipping and support analytics." },
    ],
  }),
  component: AnalyticsPage,
});

const EASE = [0.16, 1, 0.3, 1] as const;
const STAFF: ("admin" | "super_admin" | "manager")[] = ["admin", "super_admin", "manager"];
type ConnState = "connecting" | "live" | "error";

const money = (n: number) =>
  `$${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const pct = (n: number) => `${(Number(n) || 0).toFixed(1)}%`;

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

function AnimatedNumber({ value, prefix = "", suffix = "", decimals = 0 }: { value: number; prefix?: string; suffix?: string; decimals?: number }) {
  const mv = useMotionValue(value);
  const spring = useSpring(mv, { stiffness: 90, damping: 20, mass: 0.6 });
  const text = useTransform(spring, (v) =>
    `${prefix}${v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`,
  );
  useEffect(() => { mv.set(value); }, [value, mv]);
  return <motion.span>{text}</motion.span>;
}

function Kpi({ label, value, icon, prefix = "", suffix = "", decimals = 0, i = 0, accent }: {
  label: string; value: number; icon: React.ReactNode; prefix?: string; suffix?: string; decimals?: number; i?: number; accent?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE, delay: i * 0.03 }} whileHover={{ y: -2 }}
      className={`card-premium relative overflow-hidden rounded-2xl p-4 will-change-transform ${accent ? "ring-1 ring-accent/30" : ""}`}
    >
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em]">{label}</span>
        <span className={accent ? "text-accent" : "text-muted-foreground/70"}>{icon}</span>
      </div>
      <p className={`mt-2 font-display font-semibold tabular-nums text-lg sm:text-xl ${accent ? "text-gradient-ember" : "text-foreground"}`}>
        <AnimatedNumber value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
      </p>
    </motion.div>
  );
}

function GlowTooltip({ active, payload, label, isMoney }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-background/90 backdrop-blur-md px-3 py-2 text-xs shadow-2xl">
      <p className="font-mono uppercase tracking-widest text-[10px] text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2 tabular-nums">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground capitalize">{p.dataKey}</span>
          <span className="ml-auto font-medium text-foreground">{isMoney ? money(Number(p.value)) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

function Section({ title, icon, children, span = false }: { title: string; icon: React.ReactNode; children: React.ReactNode; span?: boolean }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
      className={`card-ambient noise-layer rounded-2xl p-4 sm:p-5 ${span ? "lg:col-span-2" : ""}`}
    >
      <div className="flex items-center gap-2 mb-3 text-accent">
        {icon}
        <h2 className="text-[11px] font-mono uppercase tracking-[0.25em]">{title}</h2>
      </div>
      {children}
    </motion.section>
  );
}

/** Compact ranked list row. */
function RankRow({ rank, name, value, sub }: { rank: number; name: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="size-5 shrink-0 grid place-items-center rounded-md bg-white/5 text-[10px] font-mono text-muted-foreground">{rank}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-foreground">{name}</p>
        {sub && <p className="truncate text-[10px] font-mono text-muted-foreground">{sub}</p>}
      </div>
      <span className="shrink-0 text-xs font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function StatPill({ label, value, tone = "default" }: { label: string; value: number | string; tone?: "default" | "good" | "warn" | "bad" }) {
  const toneCls = tone === "good" ? "text-emerald-400" : tone === "warn" ? "text-amber-400" : tone === "bad" ? "text-rose-400" : "text-foreground";
  return (
    <div className="rounded-xl border border-border/50 bg-white/[0.02] p-3">
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display font-semibold tabular-nums text-base ${toneCls}`}>{value}</p>
    </div>
  );
}

/* ---------- Export helpers ---------- */
function exportExcel(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const body = rows.map((r) => `<tr>${headers.map((h) => `<td>${esc(r[h])}</td>`).join("")}</tr>`).join("");
  const html = `<table><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>${body}</table>`;
  const blob = new Blob([`<html><head><meta charset="utf-8"></head><body>${html}</body></html>`], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function AnalyticsPage() {
  const [conn, setConn] = useState<ConnState>("connecting");
  const [exporting, setExporting] = useState(false);
  const getAnalytics = useServerFn(getExecutiveAnalyticsFn);
  const logExport = useServerFn(logAnalyticsExportFn);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading, refetch, error } = useQuery({
    queryKey: ["executive-analytics"],
    queryFn: () => getAnalytics(),
    staleTime: 20_000,
  });

  // Realtime: refetch (debounced) on changes to any core operational table.
  useEffect(() => {
    const schedule = () => {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => refetch(), 1500);
    };
    const tables = ["orders", "payments", "shipments", "refunds", "returns", "support_tickets", "notifications"];
    const channel = supabase.channel("exec-analytics-live");
    for (const t of tables) channel.on("postgres_changes", { event: "*", schema: "public", table: t }, schedule);
    channel.subscribe((status) => {
      setConn(status === "SUBSCRIBED" ? "live" : status === "CHANNEL_ERROR" ? "error" : "connecting");
    });
    const poll = setInterval(() => refetch(), 45_000);
    return () => { supabase.removeChannel(channel); clearInterval(poll); if (debounce.current) clearTimeout(debounce.current); };
  }, [refetch]);

  const a = data as ExecutiveAnalytics | undefined;

  // ---- Insights engine (derived strictly from live data) ----
  const insights = useMemo(() => {
    const out: { tone: "good" | "warn" | "bad" | "info"; icon: React.ReactNode; text: string }[] = [];
    if (!a) return out;
    const lastWeek = a.daily.slice(-7).reduce((s, d) => s + d.revenue, 0);
    const prevWeek = a.daily.slice(-14, -7).reduce((s, d) => s + d.revenue, 0);
    if (prevWeek > 0) {
      const delta = ((lastWeek - prevWeek) / prevWeek) * 100;
      if (delta > 5) out.push({ tone: "good", icon: <TrendingUp className="size-3.5" />, text: `Revenue up ${delta.toFixed(0)}% week-over-week — momentum building.` });
      else if (delta < -5) out.push({ tone: "bad", icon: <TrendingDown className="size-3.5" />, text: `Revenue down ${Math.abs(delta).toFixed(0)}% week-over-week — review traffic & pricing.` });
    }
    if (a.profit.net_profit < 0) out.push({ tone: "bad", icon: <DollarSign className="size-3.5" />, text: `Net profit is negative — cost of goods + refunds exceed item revenue.` });
    if (a.inventory.out_of_stock > 0) out.push({ tone: "warn", icon: <Package className="size-3.5" />, text: `${a.inventory.out_of_stock} product(s) out of stock — restock to recover sales.` });
    if (a.inventory.dead_stock > 0) out.push({ tone: "info", icon: <Boxes className="size-3.5" />, text: `${a.inventory.dead_stock} dead-stock item(s) (no sales in 60d) — consider clearance.` });
    if (a.profit.refund_rate > 8) out.push({ tone: "bad", icon: <RotateCcw className="size-3.5" />, text: `Refund rate at ${pct(a.profit.refund_rate)} — investigate product quality / fulfilment.` });
    if (a.payment_analytics.total > 0) {
      const fr = (a.payment_analytics.failed / a.payment_analytics.total) * 100;
      if (fr > 20) out.push({ tone: "warn", icon: <CreditCard className="size-3.5" />, text: `Payment failure rate ${fr.toFixed(0)}% — review gateway / checkout friction.` });
    }
    if (a.fraud_analytics.open_alerts > 0) out.push({ tone: "bad", icon: <ShieldAlert className="size-3.5" />, text: `${a.fraud_analytics.open_alerts} open fraud alert(s) require review.` });
    if (a.support_analytics.open + a.support_analytics.pending > 0) out.push({ tone: "info", icon: <LifeBuoy className="size-3.5" />, text: `${a.support_analytics.open + a.support_analytics.pending} support ticket(s) awaiting response.` });
    if (a.profit.repeat_rate >= 20) out.push({ tone: "good", icon: <Repeat className="size-3.5" />, text: `Strong retention — ${pct(a.profit.repeat_rate)} repeat-customer rate.` });
    if (!out.length) out.push({ tone: "info", icon: <Sparkles className="size-3.5" />, text: "Collecting signals — insights surface as orders flow in." });
    return out;
  }, [a]);

  const doExport = useCallback(async (format: "csv" | "excel" | "pdf", report: string) => {
    if (!a) return;
    setExporting(true);
    try {
      await logExport({ data: { format, report } });
      if (format === "pdf") { window.print(); return; }
      const rows: Record<string, unknown>[] = a.daily.map((d) => ({ date: d.date, revenue: d.revenue, orders: d.orders }));
      const fname = `executive-${report}-${new Date().toISOString().slice(0, 10)}`;
      if (format === "csv") downloadCSV(`${fname}.csv`, rows);
      else exportExcel(`${fname}.xls`, rows);
    } finally {
      setExporting(false);
    }
  }, [a, logExport]);

  if (error) {
    return (
      <AdminShell title="Executive Analytics" subtitle="Business intelligence" allow={STAFF}>
        <div className="min-h-[40vh] grid place-items-center text-center">
          <div>
            <AlertTriangle className="size-6 mx-auto mb-3 text-destructive" />
            <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
          </div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Executive Analytics" subtitle="Real-time business intelligence center" allow={STAFF} actions={
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
          <button disabled={exporting || !a} onClick={() => doExport("csv", "revenue")} className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest rounded-full text-muted-foreground hover:text-foreground disabled:opacity-40"><Download className="size-3" />CSV</button>
          <button disabled={exporting || !a} onClick={() => doExport("excel", "revenue")} className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest rounded-full text-muted-foreground hover:text-foreground disabled:opacity-40"><FileSpreadsheet className="size-3" />Excel</button>
          <button disabled={exporting || !a} onClick={() => doExport("pdf", "dashboard")} className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest rounded-full text-muted-foreground hover:text-foreground disabled:opacity-40"><FileText className="size-3" />PDF</button>
        </div>
      </>
    }>
      <Atmosphere />

      {isLoading || !a ? (
        <div className="min-h-[50vh] grid place-items-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-5 animate-spin text-accent" />
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Aggregating live data…</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ===== KPI BAR ===== */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            <Kpi i={0} accent label="Revenue Today" value={a.kpis.rev_today} icon={<DollarSign className="size-3.5" />} prefix="$" />
            <Kpi i={1} label="Revenue Week" value={a.kpis.rev_week} icon={<DollarSign className="size-3.5" />} prefix="$" />
            <Kpi i={2} label="Revenue Month" value={a.kpis.rev_month} icon={<DollarSign className="size-3.5" />} prefix="$" />
            <Kpi i={3} label="Revenue Year" value={a.kpis.rev_year} icon={<DollarSign className="size-3.5" />} prefix="$" />
            <Kpi i={4} label="Orders Today" value={a.kpis.ord_today} icon={<ShoppingBag className="size-3.5" />} />
            <Kpi i={5} label="Orders Week" value={a.kpis.ord_week} icon={<ShoppingBag className="size-3.5" />} />
            <Kpi i={6} label="Orders Month" value={a.kpis.ord_month} icon={<ShoppingBag className="size-3.5" />} />
            <Kpi i={7} label="Avg Order Value" value={a.profit.aov} icon={<TrendingUp className="size-3.5" />} prefix="$" decimals={2} />
            <Kpi i={8} accent label="Gross Profit" value={a.profit.gross_profit} icon={<Gauge className="size-3.5" />} prefix="$" />
            <Kpi i={9} accent label="Net Profit" value={a.profit.net_profit} icon={<Gauge className="size-3.5" />} prefix="$" />
            <Kpi i={10} label="Refund Rate" value={a.profit.refund_rate} icon={<RotateCcw className="size-3.5" />} suffix="%" decimals={1} />
            <Kpi i={11} label="Return Rate" value={a.profit.return_rate} icon={<RotateCcw className="size-3.5" />} suffix="%" decimals={1} />
            <Kpi i={12} label="Repeat Rate" value={a.profit.repeat_rate} icon={<Repeat className="size-3.5" />} suffix="%" decimals={1} />
            <Kpi i={13} label="New Customers" value={a.profit.new_customers} icon={<Users className="size-3.5" />} />
            <Kpi i={14} label="Active Customers" value={a.kpis.active_customers} icon={<Users className="size-3.5" />} />
            <Kpi i={15} label="Total Orders" value={a.kpis.ord_all} icon={<ShoppingBag className="size-3.5" />} />
          </div>

          {/* ===== AI BUSINESS INSIGHTS ===== */}
          <Section title="AI Business Insights" icon={<Sparkles className="size-4" />}>
            <div className="grid sm:grid-cols-2 gap-2">
              <AnimatePresence mode="popLayout">
                {insights.map((ins, idx) => (
                  <motion.div key={ins.text} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.35, ease: EASE, delay: idx * 0.03 }}
                    className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs ${
                      ins.tone === "good" ? "border-emerald-400/20 bg-emerald-400/5 text-emerald-200"
                      : ins.tone === "bad" ? "border-rose-400/20 bg-rose-400/5 text-rose-200"
                      : ins.tone === "warn" ? "border-amber-400/20 bg-amber-400/5 text-amber-200"
                      : "border-border/60 bg-white/[0.02] text-muted-foreground"}`}>
                    <span className="mt-0.5 shrink-0">{ins.icon}</span>
                    <span className="leading-relaxed">{ins.text}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </Section>

          {/* ===== REVENUE TREND ===== */}
          <Section title="Revenue & Orders — Last 30 Days" icon={<Activity className="size-4" />} span>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={a.daily} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.72 0.17 50)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="oklch(0.72 0.17 50)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.05)" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: "oklch(0.7 0 0)" }} tickFormatter={(d) => d.slice(5)} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: "oklch(0.7 0 0)" }} />
                  <Tooltip content={<GlowTooltip isMoney />} />
                  <Area type="monotone" dataKey="revenue" stroke="oklch(0.72 0.17 50)" strokeWidth={2} fill="url(#rev)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Section>

          {/* ===== REVENUE INTELLIGENCE GRID ===== */}
          <div className="grid lg:grid-cols-2 gap-4">
            <Section title="Top Revenue Products" icon={<Package className="size-4" />}>
              {a.top_products.length ? a.top_products.map((p, i) => (
                <RankRow key={p.slug ?? i} rank={i + 1} name={p.name} sub={`${p.units} units`} value={money(p.revenue)} />
              )) : <p className="text-xs text-muted-foreground">No sales yet.</p>}
            </Section>
            <Section title="Revenue by Category" icon={<Boxes className="size-4" />}>
              {a.revenue_by_category.length ? a.revenue_by_category.map((c, i) => (
                <RankRow key={c.k} rank={i + 1} name={c.k} sub={`${c.units} units`} value={money(c.v)} />
              )) : <p className="text-xs text-muted-foreground">No data.</p>}
            </Section>
            <Section title="Top Customers" icon={<Crown className="size-4" />}>
              {a.top_customers.length ? a.top_customers.map((c, i) => (
                <RankRow key={c.user_id} rank={i + 1} name={c.full_name || "Guest"} sub={`${c.orders} orders`} value={money(c.spend)} />
              )) : <p className="text-xs text-muted-foreground">No data.</p>}
            </Section>
            <Section title="Revenue by Country" icon={<Globe className="size-4" />}>
              {a.revenue_by_country.length ? a.revenue_by_country.map((c, i) => (
                <RankRow key={c.k} rank={i + 1} name={c.k} sub={`${c.n} orders`} value={money(c.v)} />
              )) : <p className="text-xs text-muted-foreground">No data.</p>}
            </Section>
          </div>

          {/* ===== PRODUCT ANALYTICS ===== */}
          <div className="grid lg:grid-cols-3 gap-4">
            <Section title="Most Viewed" icon={<Eye className="size-4" />}>
              {a.most_viewed.map((p, i) => (
                <RankRow key={p.slug} rank={i + 1} name={p.name} sub={`${p.sold} sold`} value={`${p.views}`} />
              ))}
            </Section>
            <Section title="Most Wishlisted" icon={<Heart className="size-4" />}>
              {a.most_wishlisted.map((p, i) => (
                <RankRow key={p.slug} rank={i + 1} name={p.name} value={`${p.wishlist}`} />
              ))}
            </Section>
            <Section title="Inventory Risk" icon={<Boxes className="size-4" />}>
              <div className="grid grid-cols-2 gap-2">
                <StatPill label="Low Stock" value={a.inventory.low_stock} tone="warn" />
                <StatPill label="Out of Stock" value={a.inventory.out_of_stock} tone="bad" />
                <StatPill label="Dead Stock" value={a.inventory.dead_stock} tone="warn" />
                <StatPill label="Products" value={a.inventory.total_products} />
              </div>
            </Section>
          </div>

          {/* ===== ORDER / PAYMENT / SHIPPING / SUPPORT ===== */}
          <div className="grid lg:grid-cols-2 gap-4">
            <Section title="Order Analytics" icon={<ShoppingBag className="size-4" />}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatPill label="Successful" value={a.order_analytics.successful} tone="good" />
                <StatPill label="Failed" value={a.order_analytics.failed} tone="bad" />
                <StatPill label="Cancelled" value={a.order_analytics.cancelled} />
                <StatPill label="Delivered" value={a.order_analytics.delivered} tone="good" />
                <StatPill label="COD" value={a.order_analytics.cod} />
                <StatPill label="Prepaid" value={a.order_analytics.prepaid} />
                <StatPill label="Returned" value={a.order_analytics.returned} tone="warn" />
                <StatPill label="Refunded" value={a.order_analytics.refunded} tone="warn" />
              </div>
            </Section>
            <Section title="Payment Analytics" icon={<CreditCard className="size-4" />}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatPill label="Total" value={a.payment_analytics.total} />
                <StatPill label="Succeeded" value={a.payment_analytics.succeeded} tone="good" />
                <StatPill label="Failed" value={a.payment_analytics.failed} tone="bad" />
                <StatPill label="Pending" value={a.payment_analytics.pending} tone="warn" />
                <StatPill label="Success Rate" value={pct(a.payment_analytics.total ? (a.payment_analytics.succeeded / a.payment_analytics.total) * 100 : 0)} tone="good" />
                <StatPill label="Failure Rate" value={pct(a.payment_analytics.total ? (a.payment_analytics.failed / a.payment_analytics.total) * 100 : 0)} tone="bad" />
                <StatPill label="Fraud Alerts" value={a.fraud_analytics.open_alerts} tone={a.fraud_analytics.open_alerts ? "bad" : "good"} />
                <StatPill label="Methods" value={a.revenue_by_method.length} />
              </div>
            </Section>
            <Section title="Shipping Analytics" icon={<Truck className="size-4" />}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                <StatPill label="Shipments" value={a.shipping_analytics.total} />
                <StatPill label="Delivered" value={a.shipping_analytics.delivered} tone="good" />
                <StatPill label="Returned/RTO" value={a.shipping_analytics.returned} tone="warn" />
                <StatPill label="Avg Delivery" value={a.shipping_analytics.avg_delivery_days != null ? `${a.shipping_analytics.avg_delivery_days.toFixed(1)}d` : "—"} />
              </div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Courier Ranking</p>
              {a.revenue_by_courier.length ? a.revenue_by_courier.map((c, i) => (
                <RankRow key={c.k} rank={i + 1} name={c.k} sub={`${c.delivered} delivered · ${c.returned} returned`} value={`${c.n}`} />
              )) : <p className="text-xs text-muted-foreground">No shipments.</p>}
            </Section>
            <Section title="Support Analytics" icon={<LifeBuoy className="size-4" />}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <StatPill label="Open" value={a.support_analytics.open} tone="warn" />
                <StatPill label="Pending" value={a.support_analytics.pending} tone="warn" />
                <StatPill label="Resolved" value={a.support_analytics.resolved} tone="good" />
                <StatPill label="Escalated" value={a.support_analytics.escalated} tone="bad" />
                <StatPill label="Avg Resolution" value={a.support_analytics.avg_resolution_hours != null ? `${a.support_analytics.avg_resolution_hours.toFixed(1)}h` : "—"} />
                <StatPill label="Campaigns" value={a.marketing_analytics.active_campaigns} />
              </div>
            </Section>
          </div>

          {/* ===== REVENUE BY PAYMENT METHOD CHART ===== */}
          <Section title="Revenue by Payment Method" icon={<CreditCard className="size-4" />} span>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={a.revenue_by_method} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.05)" />
                  <XAxis dataKey="k" tick={{ fontSize: 9, fill: "oklch(0.7 0 0)" }} />
                  <YAxis tick={{ fontSize: 9, fill: "oklch(0.7 0 0)" }} />
                  <Tooltip content={<GlowTooltip isMoney />} cursor={{ fill: "oklch(1 0 0 / 0.03)" }} />
                  <Bar dataKey="v" name="revenue" fill="oklch(0.72 0.17 50)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>

          <p className="text-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground pb-4">
            Generated {new Date(a.generated_at).toLocaleString()} · All metrics derived live from the database
          </p>
        </div>
      )}
    </AdminShell>
  );
}
