import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { TrendingUp, ShoppingBag, Users, DollarSign, Percent, Repeat, Download } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { KpiCard } from "@/components/admin/KpiCard";
import { fetchOrders, fetchProducts, bucketByDay, downloadCSV, type OrderRow, type ProductRow } from "@/lib/admin-queries";

export const Route = createFileRoute("/admin-analytics")({
  head: () => ({ meta: [{ title: "Analytics — Admin" }] }),
  component: AnalyticsPage,
});

const COLORS = ["#a3e635", "#22d3ee", "#f59e0b", "#f43f5e", "#a78bfa", "#34d399"];

function AnalyticsPage() {
  const [days, setDays] = useState<7 | 14 | 30 | 90>(30);
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [products, setProducts] = useState<ProductRow[] | null>(null);

  useEffect(() => {
    fetchOrders(days).then(setOrders);
    fetchProducts().then(setProducts);
  }, [days]);

  const stats = useMemo(() => {
    const list = orders ?? [];
    const ps = products ?? [];
    const costMap = new Map(ps.map((p) => [p.slug, Number(p.cost) || 0]));
    let revenue = 0, cost = 0, units = 0, refunds = 0, shipping = 0, tax = 0, discount = 0;
    const statusCounts: Record<string, number> = {};
    const productSales = new Map<string, { name: string; slug: string; units: number; revenue: number; cost: number }>();
    const customerOrders = new Map<string, number>();

    for (const o of list) {
      revenue += Number(o.total) || 0;
      shipping += Number(o.shipping) || 0;
      tax += Number(o.tax) || 0;
      discount += Number(o.discount) || 0;
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
    const conv = ps.reduce((s, p) => s + p.views_count, 0);
    const convRate = conv > 0 ? (list.length / conv) * 100 : 0;

    const daily = bucketByDay(list, days, (o) => Number(o.total) || 0).map((d) => {
      const costForDay = list.filter((o) => o.created_at.startsWith(d.date))
        .reduce((s, o) => s + o.order_items.reduce((ss, it) => ss + (costMap.get(it.product_slug ?? "") ?? 0) * it.quantity, 0), 0);
      return { ...d, revenue: d.value, profit: d.value - costForDay, cost: costForDay };
    });
    const dailyOrders = bucketByDay(list, days, () => 1);
    const top = [...productSales.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    const statusData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

    const half = Math.floor(days / 2);
    const lastHalf = daily.slice(-half).reduce((s, d) => s + d.revenue, 0);
    const prevHalf = daily.slice(0, half).reduce((s, d) => s + d.revenue, 0);
    const delta = prevHalf === 0 ? (lastHalf > 0 ? 100 : 0) : ((lastHalf - prevHalf) / prevHalf) * 100;

    return { revenue, cost, grossProfit, netProfit, refunds, units, aov, daily, dailyOrders, top, statusData, delta, repeatBuyers, convRate };
  }, [orders, products, days]);

  return (
    <AdminShell title="Analytics" subtitle="Realtime sales, profit and product performance" actions={
      <>
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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <KpiCard label="Revenue" value={`$${stats.revenue.toFixed(0)}`} icon={<TrendingUp className="size-4" />} delta={stats.delta} />
        <KpiCard label="Gross Profit" value={`$${stats.grossProfit.toFixed(0)}`} icon={<DollarSign className="size-4" />} />
        <KpiCard label="Net Profit" value={`$${stats.netProfit.toFixed(0)}`} icon={<DollarSign className="size-4" />} />
        <KpiCard label="Orders" value={(orders?.length ?? 0).toString()} icon={<ShoppingBag className="size-4" />} sub={<p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">AOV ${stats.aov.toFixed(2)}</p>} />
        <KpiCard label="Conversion" value={`${stats.convRate.toFixed(2)}%`} icon={<Percent className="size-4" />} />
        <KpiCard label="Repeat Buyers" value={stats.repeatBuyers.toString()} icon={<Repeat className="size-4" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-5">
          <h2 className="text-sm font-medium mb-4">Revenue vs profit</h2>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={stats.daily}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a3e635" stopOpacity={0.4} /><stop offset="100%" stopColor="#a3e635" stopOpacity={0} /></linearGradient>
                <linearGradient id="prof" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22d3ee" stopOpacity={0.4} /><stop offset="100%" stopColor="#22d3ee" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="label" stroke="rgba(255,255,255,0.4)" fontSize={10} />
              <YAxis stroke="rgba(255,255,255,0.4)" fontSize={10} />
              <Tooltip contentStyle={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
              <Area type="monotone" dataKey="revenue" stroke="#a3e635" fill="url(#rev)" />
              <Area type="monotone" dataKey="profit" stroke="#22d3ee" fill="url(#prof)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="text-sm font-medium mb-4">Order status</h2>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={stats.statusData} dataKey="value" nameKey="name" outerRadius={90} innerRadius={50} paddingAngle={3}>
                {stats.statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)" }} />
              <Legend wrapperStyle={{ fontSize: 10, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: 2 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="text-sm font-medium mb-4">Orders per day</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.dailyOrders}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="label" stroke="rgba(255,255,255,0.4)" fontSize={10} />
              <YAxis stroke="rgba(255,255,255,0.4)" fontSize={10} />
              <Tooltip contentStyle={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)" }} />
              <Bar dataKey="value" fill="#a78bfa" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="text-sm font-medium mb-4">Cost trend</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={stats.daily}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="label" stroke="rgba(255,255,255,0.4)" fontSize={10} />
              <YAxis stroke="rgba(255,255,255,0.4)" fontSize={10} />
              <Tooltip contentStyle={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)" }} />
              <Line type="monotone" dataKey="cost" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium">Top products</h2>
          <Users className="size-4 text-muted-foreground" />
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
                  <tr key={p.slug} className="border-b border-border/40 last:border-0">
                    <td className="py-2 text-xs">{p.name}</td>
                    <td className="py-2 text-right font-mono text-xs">{p.units}</td>
                    <td className="py-2 text-right font-mono text-accent">${p.revenue.toFixed(2)}</td>
                    <td className="py-2 text-right font-mono text-xs text-muted-foreground">${p.cost.toFixed(2)}</td>
                    <td className="py-2 text-right font-mono">${(p.revenue - p.cost).toFixed(2)}</td>
                    <td className="py-2 text-right font-mono text-xs">{margin.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
