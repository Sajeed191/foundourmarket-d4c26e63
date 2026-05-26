import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Boxes, AlertTriangle, TrendingDown, Package, Loader2, Plus, Minus, Download } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { KpiCard } from "@/components/admin/KpiCard";
import { supabase } from "@/integrations/supabase/client";
import { fetchProducts, downloadCSV, type ProductRow } from "@/lib/admin-queries";
import { logActivity } from "@/components/admin/AdminShell";

export const Route = createFileRoute("/admin-inventory")({
  head: () => ({ meta: [{ title: "Inventory — Admin" }] }),
  component: InventoryPage,
});

type Log = { id: string; product_slug: string; change: number; reason: string; notes: string | null; created_at: string };

function InventoryPage() {
  const [products, setProducts] = useState<ProductRow[] | null>(null);
  const [logs, setLogs] = useState<Log[] | null>(null);
  const [adjusting, setAdjusting] = useState<ProductRow | null>(null);

  useEffect(() => { load(); }, []);
  async function load() {
    fetchProducts().then(setProducts);
    const { data } = await supabase.from("inventory_logs").select("id,product_slug,change,reason,notes,created_at").order("created_at", { ascending: false }).limit(100);
    setLogs((data as Log[]) ?? []);
  }

  const stats = useMemo(() => {
    const list = products ?? [];
    const totalValue = list.reduce((s, p) => s + Number(p.price) * p.stock_quantity, 0);
    const totalCost = list.reduce((s, p) => s + Number(p.cost) * p.stock_quantity, 0);
    const units = list.reduce((s, p) => s + p.stock_quantity, 0);
    const reserved = list.reduce((s, p) => s + (p.reserved_quantity ?? 0), 0);
    const oos = list.filter((p) => p.stock_quantity <= 0);
    const low = list.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_threshold);
    return { totalValue, totalCost, units, reserved, oos, low, count: list.length };
  }, [products]);

  return (
    <AdminShell title="Inventory" subtitle="Stock health, valuation and movement log" allow={["admin","super_admin","manager","warehouse_staff"]} actions={
      <button onClick={() => products && downloadCSV("inventory.csv", products.map((p) => ({ slug: p.slug, name: p.name, stock: p.stock_quantity, reserved: p.reserved_quantity, threshold: p.low_stock_threshold, price: p.price, cost: p.cost, value: (Number(p.price) * p.stock_quantity).toFixed(2) })))}
        className="inline-flex items-center gap-2 border border-border px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-mono hover:bg-white/5">
        <Download className="size-3" /> Export
      </button>
    }>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <KpiCard label="SKUs" value={stats.count} icon={<Package className="size-4" />} />
        <KpiCard label="Units on hand" value={stats.units} icon={<Boxes className="size-4" />} />
        <KpiCard label="Reserved" value={stats.reserved} icon={<Boxes className="size-4" />} />
        <KpiCard label="Inv. value" value={`$${stats.totalValue.toFixed(0)}`} icon={<Package className="size-4" />} />
        <KpiCard label="At cost" value={`$${stats.totalCost.toFixed(0)}`} icon={<Package className="size-4" />} />
        <KpiCard label="Alerts" value={`${stats.oos.length + stats.low.length}`} icon={<AlertTriangle className="size-4" />}
          sub={<p className="text-[10px] font-mono uppercase tracking-widest text-accent">{stats.oos.length} oos · {stats.low.length} low</p>} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2"><Boxes className="size-4 text-muted-foreground" /><h2 className="text-sm font-medium">Stock levels</h2></div>
          {products === null ? <div className="p-8"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div> :
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border">
                  <tr><th className="text-left px-5 py-2">Product</th><th className="text-right px-5 py-2">On hand</th><th className="text-right px-5 py-2">Reserved</th><th className="text-right px-5 py-2">Threshold</th><th className="px-5 py-2"></th></tr>
                </thead>
                <tbody>
                  {[...products].sort((a, b) => a.stock_quantity - b.stock_quantity).map((p) => {
                    const status = p.stock_quantity <= 0 ? "oos" : p.stock_quantity <= p.low_stock_threshold ? "low" : "ok";
                    return (
                      <tr key={p.id} className="border-b border-border/40 last:border-0">
                        <td className="px-5 py-2">
                          <Link to="/products/$slug" params={{ slug: p.slug }} className="text-xs hover:text-accent">{p.name}</Link>
                          <p className="text-[10px] font-mono text-muted-foreground">{p.sku ?? p.slug}</p>
                        </td>
                        <td className={`px-5 py-2 text-right font-mono text-xs ${status === "oos" ? "text-destructive" : status === "low" ? "text-accent" : ""}`}>{p.stock_quantity}</td>
                        <td className="px-5 py-2 text-right font-mono text-xs text-muted-foreground">{p.reserved_quantity}</td>
                        <td className="px-5 py-2 text-right font-mono text-xs">{p.low_stock_threshold}</td>
                        <td className="px-5 py-2 text-right">
                          <button onClick={() => setAdjusting(p)} className="text-[10px] font-mono uppercase tracking-widest text-accent hover:underline">Adjust</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          }
        </div>

        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2"><TrendingDown className="size-4 text-muted-foreground" /><h2 className="text-sm font-medium">Movement log</h2></div>
          <ul className="max-h-[500px] overflow-y-auto divide-y divide-border/40">
            {(logs ?? []).map((l) => (
              <li key={l.id} className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs truncate">{l.product_slug}</p>
                  <span className={`font-mono text-xs ${l.change > 0 ? "text-accent" : "text-destructive"}`}>{l.change > 0 ? "+" : ""}{l.change}</span>
                </div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{l.reason} · {new Date(l.created_at).toLocaleString()}</p>
              </li>
            ))}
            {logs?.length === 0 && <li className="px-5 py-6 text-center text-xs text-muted-foreground">No movement yet.</li>}
          </ul>
        </div>
      </div>

      {adjusting && <AdjustModal product={adjusting} onClose={() => setAdjusting(null)} onDone={() => { setAdjusting(null); load(); }} />}
    </AdminShell>
  );
}

function AdjustModal({ product, onClose, onDone }: { product: ProductRow; onClose: () => void; onDone: () => void }) {
  const [delta, setDelta] = useState("0");
  const [reason, setReason] = useState("adjustment");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    const n = Number(delta);
    if (!n) return;
    setSaving(true);
    const newQty = Math.max(0, product.stock_quantity + n);
    await supabase.from("products").update({ stock_quantity: newQty, in_stock: newQty > 0 }).eq("id", product.id);
    await supabase.from("inventory_logs").insert({ product_slug: product.slug, change: n, reason, notes: notes || null });
    logActivity("inventory_adjust", "product", product.slug, { change: n, reason });
    setSaving(false);
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-card border border-border rounded-2xl p-6">
        <h2 className="text-lg font-display mb-1">Adjust stock</h2>
        <p className="text-xs text-muted-foreground mb-4">{product.name} · current {product.stock_quantity}</p>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setDelta(String((Number(delta) || 0) - 1))} className="size-9 grid place-items-center rounded-full border border-border"><Minus className="size-3.5" /></button>
            <input value={delta} onChange={(e) => setDelta(e.target.value)} type="number" className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-center" />
            <button onClick={() => setDelta(String((Number(delta) || 0) + 1))} className="size-9 grid place-items-center rounded-full border border-border"><Plus className="size-3.5" /></button>
          </div>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm">
            <option value="adjustment">Manual adjustment</option>
            <option value="restock">Restock</option>
            <option value="damaged">Damaged</option>
            <option value="lost">Lost</option>
            <option value="recount">Recount</option>
          </select>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
          <p className="text-xs text-muted-foreground">New stock: <span className="font-mono text-foreground">{Math.max(0, product.stock_quantity + (Number(delta) || 0))}</span></p>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-full text-xs uppercase tracking-widest border border-border">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-full text-xs uppercase tracking-widest font-bold bg-accent text-accent-foreground disabled:opacity-50">{saving ? "Saving…" : "Apply"}</button>
        </div>
      </div>
    </div>
  );
}
