import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Users, UserPlus, UserCheck, Crown, Moon, AlertTriangle, Gem, Loader2, RefreshCw,
  Download, Search, TrendingUp, TrendingDown, Minus, Sparkles, Globe, ShoppingBag,
  LifeBuoy, Tag, Heart, MessageSquare, Star, ChevronRight, Lightbulb, Mail, Filter,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { KpiCard } from "@/components/admin/KpiCard";
import { logActivity } from "@/components/admin/AdminShell";
import { downloadCSV } from "@/lib/admin-queries";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchCustomerIntel, buildCustomerIntel, computeHealth, segmentStats, regionalStats,
  vipLists, detectAlerts, buildRecommendations, growthSeries, repeatPurchaseRate,
  fmtCurrency, SEGMENT_COLOR, churnColor,
  type CustomerIntel, type CustomerSegment, type Region,
} from "@/lib/customer-intelligence";

export const Route = createFileRoute("/admin-customer-intelligence")({
  head: () => ({ meta: [{ title: "Customer Intelligence — Admin" }] }),
  component: CustomerIntelPage,
});

const fmtNum = (n: number) => new Intl.NumberFormat().format(Math.round(n));
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

function trendIcon(t: CustomerIntel["trend"]) {
  if (t === "up") return <TrendingUp className="size-3 text-emerald-400" />;
  if (t === "down") return <TrendingDown className="size-3 text-destructive" />;
  return <Minus className="size-3 text-muted-foreground" />;
}

const SEGMENTS: CustomerSegment[] = [
  "Champions", "Loyal Customers", "Potential Loyalists", "New Customers",
  "Promising", "Needs Attention", "At Risk", "Lost Customers",
];

function CustomerIntelPage() {
  const nav = useNavigate();
  const [rows, setRows] = useState<CustomerIntel[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");
  const [segment, setSegment] = useState<CustomerSegment | "all">("all");
  const [region, setRegion] = useState<Region | "all">("all");

  async function load() {
    const data = await fetchCustomerIntel();
    setRows(buildCustomerIntel(data));
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    load();
    const ch = supabase.channel("cust-intel-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = rows ?? [];
  const health = useMemo(() => computeHealth(data), [data]);
  const segStats = useMemo(() => segmentStats(data), [data]);
  const regStats = useMemo(() => regionalStats(data), [data]);
  const vips = useMemo(() => vipLists(data), [data]);
  const alerts = useMemo(() => detectAlerts(data), [data]);
  const recs = useMemo(() => buildRecommendations(data), [data]);
  const growth = useMemo(() => growthSeries(data), [data]);
  const repeatRate = useMemo(() => repeatPurchaseRate(data), [data]);
  const maxGrowth = Math.max(1, ...growth.map((g) => g.count));
  const maxSeg = Math.max(1, ...segStats.map((s) => s.count));

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data
      .filter((c) => segment === "all" || c.segment === segment)
      .filter((c) => region === "all" || c.region === region)
      .filter((c) => !term || c.name.toLowerCase().includes(term) || (c.email ?? "").toLowerCase().includes(term) || (c.phone ?? "").includes(term))
      .sort((a, b) => b.lifetimeSpend - a.lifetimeSpend)
      .slice(0, 200);
  }, [data, q, segment, region]);

  function exportRows(format: "csv" | "json") {
    const out = filtered.map((c) => ({
      name: c.name, email: c.email ?? "", phone: c.phone ?? "", region: c.region,
      segment: c.segment, lifetime_spend: Math.round(c.lifetimeSpend), orders: c.ordersCount,
      aov: Math.round(c.aov), profit: Math.round(c.profit), refund_rate: pct(c.refundRate),
      churn_risk: c.churnRisk, recency_days: c.recencyDays ?? "", favorite_category: c.favoriteCategory ?? "",
      tags: c.tags.join("|"),
    }));
    logActivity("customer_intel_export", "customer", undefined, { format, count: out.length });
    if (format === "csv") {
      downloadCSV(`customers-${Date.now()}.csv`, out);
    } else {
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `customers-${Date.now()}.json`; a.click();
      URL.revokeObjectURL(a.href);
    }
  }

  function openCustomer(id: string) {
    logActivity("customer_intel_open", "customer", id);
    (nav as (o: { to: string; search?: Record<string, string> }) => void)({ to: "/admin-customers", search: { id } });
  }

  if (loading) {
    return (
      <AdminShell title="Customer Intelligence" subtitle="Loading insights…" allow={["admin", "super_admin", "manager", "support"]}>
        <div className="min-h-[40vh] grid place-items-center">
          <Loader2 className="size-6 animate-spin text-accent" />
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      title="Customer Intelligence"
      subtitle="Real-time behavioural insights from every order, refund and interaction"
      allow={["admin", "super_admin", "manager", "support"]}
      actions={
        <div className="flex items-center gap-2">
          <button onClick={() => { setRefreshing(true); load(); }} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs hover:border-accent/40">
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button onClick={() => exportRows("csv")} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs hover:border-accent/40">
            <Download className="size-3.5" /> CSV
          </button>
          <button onClick={() => exportRows("json")} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs hover:border-accent/40">
            <Download className="size-3.5" /> JSON
          </button>
        </div>
      }
    >
      {/* HEALTH OVERVIEW */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total Customers" value={fmtNum(health.total)} icon={<Users className="size-4" />} />
        <KpiCard label="Active" value={fmtNum(health.active)} icon={<UserCheck className="size-4" />} sub={<span className="text-[10px] text-muted-foreground">{pct(health.total ? health.active / health.total : 0)} of base</span>} />
        <KpiCard label="New (30d)" value={fmtNum(health.newCustomers)} icon={<UserPlus className="size-4" />} />
        <KpiCard label="Returning" value={fmtNum(health.returning)} icon={<RefreshCw className="size-4" />} sub={<span className="text-[10px] text-muted-foreground">Repeat rate {pct(repeatRate)}</span>} />
        <KpiCard label="VIP" value={fmtNum(health.vip)} icon={<Crown className="size-4" />} />
        <KpiCard label="High Value" value={fmtNum(health.highValue)} icon={<Gem className="size-4" />} />
        <KpiCard label="Dormant" value={fmtNum(health.dormant)} icon={<Moon className="size-4" />} />
        <KpiCard label="At Risk" value={fmtNum(health.atRisk)} icon={<AlertTriangle className="size-4" />} />
      </div>

      {/* SEGMENTS + GROWTH */}
      <div className="mt-6 grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card-premium rounded-2xl p-5">
          <h2 className="text-sm font-display font-semibold mb-4 flex items-center gap-2"><Sparkles className="size-4 text-accent" /> RFM Segmentation</h2>
          <div className="space-y-2.5">
            {segStats.map((s) => (
              <button key={s.segment} onClick={() => setSegment(s.segment)} className="w-full group">
                <div className="flex items-center gap-3 text-xs">
                  <span className={`shrink-0 w-36 text-left rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ${SEGMENT_COLOR[s.segment]}`}>{s.segment}</span>
                  <div className="flex-1 h-2.5 rounded-full bg-white/[0.04] overflow-hidden">
                    <div className="h-full rounded-full bg-accent/60 group-hover:bg-accent transition-all" style={{ width: `${(s.count / maxSeg) * 100}%` }} />
                  </div>
                  <span className="w-10 text-right tabular-nums">{s.count}</span>
                  <span className="w-20 text-right tabular-nums text-muted-foreground">{fmtCurrency(s.revenue)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="card-premium rounded-2xl p-5">
          <h2 className="text-sm font-display font-semibold mb-4 flex items-center gap-2"><TrendingUp className="size-4 text-accent" /> Customer Growth</h2>
          <div className="flex items-end gap-1.5 h-40">
            {growth.map((g, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full rounded-t bg-accent/50 hover:bg-accent transition-all" style={{ height: `${(g.count / maxGrowth) * 100}%`, minHeight: g.count ? 4 : 0 }} title={`${g.count}`} />
                <span className="text-[8px] text-muted-foreground">{g.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* REGIONAL INTELLIGENCE */}
      <div className="mt-6 grid md:grid-cols-2 gap-4">
        {regStats.map((r) => (
          <div key={r.region} className="card-premium rounded-2xl p-5">
            <h3 className="text-sm font-display font-semibold mb-3 flex items-center gap-2 capitalize"><Globe className="size-4 text-accent" /> {r.region}</h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Customers</p><p className="text-lg font-display font-semibold tabular-nums">{fmtNum(r.customers)}</p></div>
              <div><p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Revenue</p><p className="text-lg font-display font-semibold tabular-nums">{fmtCurrency(r.revenue, r.region)}</p></div>
              <div><p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Orders</p><p className="text-lg font-display font-semibold tabular-nums">{fmtNum(r.orders)}</p></div>
              <div><p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Profit</p><p className="text-sm font-display font-semibold tabular-nums text-emerald-400">{fmtCurrency(r.profit, r.region)}</p></div>
              <div><p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Refunds</p><p className="text-sm font-display font-semibold tabular-nums text-destructive">{fmtCurrency(r.refunds, r.region)}</p></div>
              <div><p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">New</p><p className="text-sm font-display font-semibold tabular-nums">{fmtNum(r.newCustomers)}</p></div>
            </div>
          </div>
        ))}
      </div>

      {/* VIP DETECTION + ALERTS */}
      <div className="mt-6 grid lg:grid-cols-2 gap-4">
        <div className="card-premium rounded-2xl p-5">
          <h2 className="text-sm font-display font-semibold mb-4 flex items-center gap-2"><Crown className="size-4 text-accent" /> Top Spenders</h2>
          <div className="space-y-1.5">
            {vips.topSpenders.map((c) => (
              <button key={c.id} onClick={() => openCustomer(c.id)} className="w-full flex items-center gap-3 rounded-xl px-2 py-2 text-left text-xs hover:bg-white/[0.03]">
                <span className="flex-1 truncate">{c.name}</span>
                {trendIcon(c.trend)}
                <span className="tabular-nums text-muted-foreground">{c.ordersCount} ord</span>
                <span className="tabular-nums font-medium w-24 text-right">{fmtCurrency(c.lifetimeSpend, c.region)}</span>
                <ChevronRight className="size-3.5 text-muted-foreground" />
              </button>
            ))}
            {!vips.topSpenders.length && <p className="text-xs text-muted-foreground">No paid customers yet.</p>}
          </div>
        </div>
        <div className="card-premium rounded-2xl p-5">
          <h2 className="text-sm font-display font-semibold mb-4 flex items-center gap-2"><AlertTriangle className="size-4 text-accent" /> Alerts</h2>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {alerts.map((a) => (
              <button key={a.id} onClick={() => openCustomer(a.customerId)} className="w-full flex items-start gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-white/[0.03]">
                <span className={`mt-0.5 size-2 shrink-0 rounded-full ${a.severity === "high" ? "bg-destructive" : a.severity === "medium" ? "bg-amber-400" : "bg-emerald-400"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium truncate">{a.title}</span>
                  <span className="block text-[11px] text-muted-foreground truncate">{a.detail}</span>
                </span>
              </button>
            ))}
            {!alerts.length && <p className="text-xs text-muted-foreground">No alerts right now.</p>}
          </div>
        </div>
      </div>

      {/* SMART RECOMMENDATIONS */}
      <div className="mt-6 card-premium rounded-2xl p-5">
        <h2 className="text-sm font-display font-semibold mb-4 flex items-center gap-2"><Lightbulb className="size-4 text-accent" /> Smart Recommendations</h2>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {recs.map((r) => (
            <div key={r.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="text-xs font-semibold mb-1">{r.title}</p>
              <p className="text-[11px] text-muted-foreground mb-3">{r.reason}</p>
              <div className="space-y-1">
                {r.customers.slice(0, 4).map((c) => (
                  <button key={c.id} onClick={() => openCustomer(c.id)} className="w-full flex items-center gap-2 text-[11px] hover:text-accent">
                    <span className="flex-1 truncate text-left">{c.name}</span>
                    <span className="tabular-nums text-muted-foreground">{fmtCurrency(c.lifetimeSpend, c.region)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {!recs.length && <p className="text-xs text-muted-foreground">Not enough data for recommendations yet.</p>}
        </div>
      </div>

      {/* CUSTOMER EXPLORER */}
      <div className="mt-6 card-premium rounded-2xl p-5">
        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
          <h2 className="text-sm font-display font-semibold flex items-center gap-2 flex-1"><Users className="size-4 text-accent" /> Customer Explorer</h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone…" className="bg-white/[0.03] border border-white/[0.08] rounded-xl pl-8 pr-3 py-2 text-xs w-full md:w-64 focus:outline-none focus:border-accent/40" />
          </div>
          <select value={segment} onChange={(e) => setSegment(e.target.value as CustomerSegment | "all")} className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-accent/40">
            <option value="all">All segments</option>
            {SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={region} onChange={(e) => setRegion(e.target.value as Region | "all")} className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-accent/40">
            <option value="all">All regions</option>
            <option value="india">India</option>
            <option value="international">International</option>
          </select>
        </div>

        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-xs min-w-[760px]">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-white/[0.06]">
                <th className="text-left font-normal px-2 py-2">Customer</th>
                <th className="text-left font-normal px-2 py-2">Segment</th>
                <th className="text-right font-normal px-2 py-2">Spend</th>
                <th className="text-right font-normal px-2 py-2">Orders</th>
                <th className="text-right font-normal px-2 py-2">AOV</th>
                <th className="text-right font-normal px-2 py-2">Churn</th>
                <th className="text-left font-normal px-2 py-2">Tags</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="px-2 py-2.5">
                    <div className="flex flex-col">
                      <span className="font-medium truncate max-w-[180px]">{c.name}</span>
                      <span className="text-[10px] text-muted-foreground truncate max-w-[180px]">{c.email ?? c.phone ?? "—"} · {c.region}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2.5"><span className={`rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider ${SEGMENT_COLOR[c.segment]}`}>{c.segment}</span></td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{fmtCurrency(c.lifetimeSpend, c.region)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{c.ordersCount}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{fmtCurrency(c.aov, c.region)}</td>
                  <td className={`px-2 py-2.5 text-right tabular-nums font-medium ${churnColor(c.churnRisk)}`}>{c.churnRisk}</td>
                  <td className="px-2 py-2.5">
                    <div className="flex flex-wrap gap-1 max-w-[160px]">
                      {c.tags.slice(0, 3).map((t) => <span key={t} className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[9px]">{t}</span>)}
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <button onClick={() => openCustomer(c.id)} className="inline-flex items-center gap-1 text-accent hover:underline text-[11px]">Open <ChevronRight className="size-3" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <p className="text-xs text-muted-foreground py-6 text-center">No customers match these filters.</p>}
        </div>
      </div>
    </AdminShell>
  );
}
