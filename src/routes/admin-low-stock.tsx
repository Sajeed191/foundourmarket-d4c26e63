import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, AlertOctagon, PackageX, Loader2, Pencil } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { KpiCard } from "@/components/admin/KpiCard";
import { fetchProducts, type ProductRow } from "@/lib/admin-queries";

export const Route = createFileRoute("/admin-low-stock")({
  head: () => ({ meta: [{ title: "Low Stock Center — Admin" }] }),
  component: LowStockPage,
});

type Bucket = "out" | "critical" | "low";

const BUCKET_META: Record<Bucket, { title: string; icon: typeof AlertTriangle; color: string; ring: string; bg: string }> = {
  out: { title: "Out of Stock", icon: PackageX, color: "text-destructive", ring: "border-destructive/40", bg: "bg-destructive/10" },
  critical: { title: "Critical Stock", icon: AlertOctagon, color: "text-orange-400", ring: "border-orange-400/40", bg: "bg-orange-400/10" },
  low: { title: "Low Stock", icon: AlertTriangle, color: "text-amber-400", ring: "border-amber-400/40", bg: "bg-amber-400/10" },
};

function bucketOf(p: ProductRow): Bucket | null {
  if (p.stock_quantity <= 0) return "out";
  const threshold = p.low_stock_threshold || 5;
  if (p.stock_quantity <= Math.max(1, Math.floor(threshold / 2))) return "critical";
  if (p.stock_quantity <= threshold) return "low";
  return null;
}

function LowStockPage() {
  const [products, setProducts] = useState<ProductRow[] | null>(null);

  useEffect(() => { fetchProducts().then(setProducts); }, []);

  const groups = useMemo(() => {
    const out: ProductRow[] = [], critical: ProductRow[] = [], low: ProductRow[] = [];
    for (const p of products ?? []) {
      const b = bucketOf(p);
      if (b === "out") out.push(p);
      else if (b === "critical") critical.push(p);
      else if (b === "low") low.push(p);
    }
    const sort = (a: ProductRow, b: ProductRow) => a.stock_quantity - b.stock_quantity;
    return { out: out.sort(sort), critical: critical.sort(sort), low: low.sort(sort) };
  }, [products]);

  return (
    <AdminShell title="Low Stock Center" subtitle="Inventory risk at a glance" allow={["admin", "super_admin", "manager", "warehouse_staff"]}>
      <div className="grid grid-cols-3 gap-3 mb-6">
        <KpiCard label="Out of stock" value={groups.out.length} icon={<PackageX className="size-4" />} />
        <KpiCard label="Critical" value={groups.critical.length} icon={<AlertOctagon className="size-4" />} />
        <KpiCard label="Low" value={groups.low.length} icon={<AlertTriangle className="size-4" />} />
      </div>

      {products === null ? (
        <div className="p-8"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {(["out", "critical", "low"] as Bucket[]).map((b) => (
            <StockColumn key={b} bucket={b} items={groups[b]} />
          ))}
        </div>
      )}
    </AdminShell>
  );
}

function StockColumn({ bucket, items }: { bucket: Bucket; items: ProductRow[] }) {
  const meta = BUCKET_META[bucket];
  const Icon = meta.icon;
  return (
    <div className={`card-premium rounded-2xl overflow-hidden border ${meta.ring}`}>
      <div className={`px-4 py-3 border-b border-border flex items-center justify-between ${meta.bg}`}>
        <div className="flex items-center gap-2">
          <Icon className={`size-4 ${meta.color}`} />
          <h2 className="text-sm font-medium">{meta.title}</h2>
        </div>
        <span className={`font-mono text-xs ${meta.color}`}>{items.length}</span>
      </div>
      <ul className="divide-y divide-border/40 max-h-[560px] overflow-y-auto">
        {items.map((p) => (
          <li key={p.id} className="px-3 py-2.5 flex items-center gap-3">
            <div className="size-11 rounded-lg bg-muted overflow-hidden shrink-0">
              {p.image && <img src={p.image} alt={p.name} className="size-full object-cover" loading="lazy" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs truncate">{p.name}</p>
              <p className="text-[10px] font-mono text-muted-foreground">{p.sku ?? p.slug}</p>
            </div>
            <div className="text-right shrink-0">
              <p className={`font-mono text-sm ${meta.color}`}>{p.stock_quantity}</p>
              <Link to="/admin-inventory" className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-accent hover:underline">
                <Pencil className="size-2.5" /> Edit
              </Link>
            </div>
          </li>
        ))}
        {items.length === 0 && <li className="px-4 py-8 text-center text-xs text-muted-foreground">All clear.</li>}
      </ul>
    </div>
  );
}
