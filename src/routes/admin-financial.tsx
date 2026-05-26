import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Wallet, TrendingUp, TrendingDown, Receipt, Truck, Download } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { KpiCard } from "@/components/admin/KpiCard";
import { fetchOrders, fetchProducts, downloadCSV, type OrderRow, type ProductRow } from "@/lib/admin-queries";

export const Route = createFileRoute("/admin-financial")({
  head: () => ({ meta: [{ title: "Financial — Admin" }] }),
  component: FinancialPage,
});

function monthKey(iso: string) { return iso.slice(0, 7); }

function FinancialPage() {
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [products, setProducts] = useState<ProductRow[] | null>(null);

  useEffect(() => { fetchOrders(365).then(setOrders); fetchProducts().then(setProducts); }, []);

  const f = useMemo(() => {
    const list = orders ?? [];
    const ps = products ?? [];
    const costMap = new Map(ps.map((p) => [p.slug, Number(p.cost) || 0]));
    const months = new Map<string, { month: string; revenue: number; cost: number; refunds: number; shipping: number; tax: number; profit: number; orders: number }>();

    let revenue = 0, cost = 0, refunds = 0, shipping = 0, tax = 0, discount = 0;
    for (const o of list) {
      const k = monthKey(o.created_at);
      const rec = months.get(k) ?? { month: k, revenue: 0, cost: 0, refunds: 0, shipping: 0, tax: 0, profit: 0, orders: 0 };
      const r = Number(o.total) || 0;
      const s = Number(o.shipping) || 0;
      const t = Number(o.tax) || 0;
      const d = Number(o.discount) || 0;
      const c = (o.order_items ?? []).reduce((sum, it) => sum + (costMap.get(it.product_slug ?? "") ?? 0) * it.quantity, 0);
      rec.revenue += r; rec.cost += c; rec.shipping += s; rec.tax += t; rec.orders += 1;
      if (o.status === "refunded" || o.status === "returned") rec.refunds += r;
      rec.profit = rec.revenue - rec.cost - rec.refunds - rec.shipping;
      months.set(k, rec);
      revenue += r; cost += c; shipping += s; tax += t; discount += d;
      if (o.status === "refunded" || o.status === "returned") refunds += r;
    }
    const sorted = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
    const gross = revenue - cost;
    const net = gross - refunds - shipping;
    return { rows: sorted, revenue, cost, refunds, shipping, tax, discount, gross, net };
  }, [orders, products]);

  return (
    <AdminShell title="Financial dashboard" subtitle="Profit & loss, refunds, shipping, taxes" allow={["admin","super_admin","manager"]} actions={
      <button onClick={() => downloadCSV("financial-by-month.csv", f.rows as unknown as Record<string, unknown>[])}
        className="inline-flex items-center gap-2 border border-border px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-mono hover:bg-white/5">
        <Download className="size-3" /> Export
      </button>
    }>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <KpiCard label="Revenue" value={`$${f.revenue.toFixed(0)}`} icon={<TrendingUp className="size-4" />} />
        <KpiCard label="Cost of goods" value={`$${f.cost.toFixed(0)}`} icon={<TrendingDown className="size-4" />} />
        <KpiCard label="Gross profit" value={`$${f.gross.toFixed(0)}`} icon={<Wallet className="size-4" />} />
        <KpiCard label="Refunds" value={`$${f.refunds.toFixed(0)}`} icon={<TrendingDown className="size-4" />} />
        <KpiCard label="Shipping" value={`$${f.shipping.toFixed(0)}`} icon={<Truck className="size-4" />} />
        <KpiCard label="Net earnings" value={`$${f.net.toFixed(0)}`} icon={<Wallet className="size-4" />} sub={<p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Tax collected ${f.tax.toFixed(0)}</p>} />
      </div>

      <div className="bg-card border border-border rounded-2xl p-5 mb-6">
        <h2 className="text-sm font-medium mb-4">Monthly P&amp;L</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={f.rows}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="month" stroke="rgba(255,255,255,0.4)" fontSize={10} />
            <YAxis stroke="rgba(255,255,255,0.4)" fontSize={10} />
            <Tooltip contentStyle={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)" }} />
            <Bar dataKey="revenue" stackId="a" fill="#a3e635" />
            <Bar dataKey="profit" stackId="b" fill="#22d3ee" />
            <Bar dataKey="refunds" stackId="c" fill="#f43f5e" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5 mb-6">
        <h2 className="text-sm font-medium mb-4">Cumulative net profit</h2>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={f.rows.reduce((acc, r, i) => { const prev = acc[i - 1]?.cumulative ?? 0; acc.push({ month: r.month, cumulative: prev + (r.revenue - r.cost - r.refunds - r.shipping) }); return acc; }, [] as { month: string; cumulative: number }[])}>
            <defs><linearGradient id="cum" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a78bfa" stopOpacity={0.4} /><stop offset="100%" stopColor="#a78bfa" stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="month" stroke="rgba(255,255,255,0.4)" fontSize={10} />
            <YAxis stroke="rgba(255,255,255,0.4)" fontSize={10} />
            <Tooltip contentStyle={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)" }} />
            <Area type="monotone" dataKey="cumulative" stroke="#a78bfa" fill="url(#cum)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-border flex items-center gap-2"><Receipt className="size-4 text-muted-foreground" /><h2 className="text-sm font-medium">Monthly breakdown</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border">
              <tr><th className="text-left px-5 py-3">Month</th><th className="text-right px-5 py-3">Orders</th><th className="text-right px-5 py-3">Revenue</th><th className="text-right px-5 py-3">Cost</th><th className="text-right px-5 py-3">Refunds</th><th className="text-right px-5 py-3">Shipping</th><th className="text-right px-5 py-3">Tax</th><th className="text-right px-5 py-3">Net</th></tr>
            </thead>
            <tbody>
              {f.rows.map((r) => (
                <tr key={r.month} className="border-b border-border/40 last:border-0">
                  <td className="px-5 py-2 font-mono text-xs">{r.month}</td>
                  <td className="px-5 py-2 text-right font-mono text-xs">{r.orders}</td>
                  <td className="px-5 py-2 text-right font-mono text-accent">${r.revenue.toFixed(2)}</td>
                  <td className="px-5 py-2 text-right font-mono text-xs text-muted-foreground">${r.cost.toFixed(2)}</td>
                  <td className="px-5 py-2 text-right font-mono text-xs text-destructive">${r.refunds.toFixed(2)}</td>
                  <td className="px-5 py-2 text-right font-mono text-xs">${r.shipping.toFixed(2)}</td>
                  <td className="px-5 py-2 text-right font-mono text-xs">${r.tax.toFixed(2)}</td>
                  <td className="px-5 py-2 text-right font-mono text-accent">${(r.revenue - r.cost - r.refunds - r.shipping).toFixed(2)}</td>
                </tr>
              ))}
              {f.rows.length === 0 && <tr><td colSpan={8} className="px-5 py-8 text-center text-sm text-muted-foreground">No data yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
