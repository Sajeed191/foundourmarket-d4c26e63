import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileText, Download } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { fetchOrders, fetchProducts, downloadCSV } from "@/lib/admin-queries";

export const Route = createFileRoute("/admin-reports")({
  head: () => ({ meta: [{ title: "Reports — Admin" }] }),
  component: ReportsPage,
});

const REPORTS = [
  { id: "revenue", label: "Revenue by day", desc: "Daily gross sales, orders, and average order value." },
  { id: "tax", label: "Tax collected", desc: "Tax totals per order with shipping context." },
  { id: "refunds", label: "Refunds & returns", desc: "All refunded or returned orders." },
  { id: "inventory", label: "Inventory snapshot", desc: "Current stock, value, and reorder alerts." },
  { id: "customers", label: "Customers", desc: "All customers with lifetime spend and orders." },
  { id: "products", label: "Product performance", desc: "Per-SKU units sold, revenue, and views." },
  { id: "subscribers", label: "Newsletter subscribers", desc: "Email list with subscription source and status." },
];

function ReportsPage() {
  const [busy, setBusy] = useState<string | null>(null);
  const [days, setDays] = useState<30 | 90 | 365>(90);
  const [history, setHistory] = useState<{ id: string; label: string; at: string }[]>([]);

  useEffect(() => {
    try { setHistory(JSON.parse(localStorage.getItem("fm-reports-history") ?? "[]")); } catch { /* ignore */ }
  }, []);

  function track(id: string, label: string) {
    const item = { id, label, at: new Date().toISOString() };
    const next = [item, ...history].slice(0, 20);
    setHistory(next);
    localStorage.setItem("fm-reports-history", JSON.stringify(next));
  }

  async function run(id: string) {
    setBusy(id);
    try {
      if (id === "revenue") {
        const orders = await fetchOrders(days);
        const m = new Map<string, { date: string; orders: number; revenue: number }>();
        for (const o of orders) {
          const k = o.created_at.slice(0, 10);
          const r = m.get(k) ?? { date: k, orders: 0, revenue: 0 };
          r.orders++; r.revenue += Number(o.total); m.set(k, r);
        }
        downloadCSV(`revenue-${days}d.csv`, [...m.values()].map((r) => ({ ...r, aov: (r.revenue / r.orders).toFixed(2) })));
      } else if (id === "tax") {
        const orders = await fetchOrders(days);
        downloadCSV(`tax-${days}d.csv`, orders.map((o) => ({ order_id: o.id, date: o.created_at, subtotal: o.subtotal, tax: o.tax, shipping: o.shipping, total: o.total })));
      } else if (id === "refunds") {
        const orders = await fetchOrders(days);
        const r = orders.filter((o) => o.status === "refunded" || o.status === "returned");
        downloadCSV(`refunds-${days}d.csv`, r.map((o) => ({ order_id: o.id, date: o.created_at, customer: o.contact_email, status: o.status, total: o.total })));
      } else if (id === "inventory") {
        const products = await fetchProducts();
        downloadCSV("inventory.csv", products.map((p) => ({ slug: p.slug, name: p.name, sku: p.sku, stock: p.stock_quantity, reserved: p.reserved_quantity, threshold: p.low_stock_threshold, price: p.price, value: (Number(p.price) * p.stock_quantity).toFixed(2) })));
      } else if (id === "customers") {
        const { data } = await supabase.from("orders").select("user_id,contact_email,total,created_at").limit(5000);
        const m = new Map<string, { user_id: string; email: string | null; orders: number; spent: number; last_order: string }>();
        for (const o of data ?? []) {
          const prev = m.get(o.user_id);
          m.set(o.user_id, { user_id: o.user_id, email: o.contact_email ?? prev?.email ?? null, orders: (prev?.orders ?? 0) + 1, spent: (prev?.spent ?? 0) + Number(o.total), last_order: !prev || o.created_at > prev.last_order ? o.created_at : prev.last_order });
        }
        downloadCSV("customers.csv", [...m.values()]);
      } else if (id === "products") {
        const products = await fetchProducts();
        downloadCSV("products.csv", products.map((p) => ({ slug: p.slug, name: p.name, category: p.category, price: p.price, cost: p.cost, rating: p.rating, reviews: p.reviews, views: p.views_count, stock: p.stock_quantity })));
      } else if (id === "subscribers") {
        const { data } = await supabase.from("newsletter_subscribers").select("email,status,source,created_at");
        downloadCSV("subscribers.csv", (data ?? []) as unknown as Record<string, unknown>[]);
      }
      const meta = REPORTS.find((r) => r.id === id);
      if (meta) track(id, meta.label);
    } finally { setBusy(null); }
  }

  return (
    <AdminShell title="Reports" subtitle="Generate exportable CSV reports" allow={["admin","super_admin","manager"]} actions={
      <div className="inline-flex rounded-full border border-border bg-card p-0.5">
        {([30, 90, 365] as const).map((d) => (
          <button key={d} onClick={() => setDays(d)} className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest rounded-full ${days === d ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}>{d}d</button>
        ))}
      </div>
    }>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {REPORTS.map((r) => (
          <div key={r.id} className="bg-card border border-border rounded-2xl p-5 flex flex-col">
            <FileText className="size-5 text-accent mb-3" />
            <h3 className="text-sm font-medium">{r.label}</h3>
            <p className="text-xs text-muted-foreground mt-1 flex-1">{r.desc}</p>
            <button onClick={() => run(r.id)} disabled={busy === r.id} className="mt-4 inline-flex items-center gap-2 bg-accent text-accent-foreground px-4 py-2 rounded-full text-xs uppercase tracking-widest font-bold disabled:opacity-50">
              <Download className="size-3.5" /> {busy === r.id ? "Generating…" : "Download CSV"}
            </button>
          </div>
        ))}
      </div>

      {history.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="text-sm font-medium mb-3">Recent exports</h2>
          <ul className="divide-y divide-border/40">
            {history.map((h, i) => (
              <li key={i} className="py-2 flex items-center justify-between text-xs">
                <span>{h.label}</span>
                <span className="font-mono text-muted-foreground">{new Date(h.at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AdminShell>
  );
}
