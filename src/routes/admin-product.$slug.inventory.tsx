import { createFileRoute } from "@tanstack/react-router";
import { Boxes } from "lucide-react";
import { SectionEditor, Field, Select, Toggle, STATUS_OPTIONS } from "@/components/admin/product-editor/kit";

export const Route = createFileRoute("/admin-product/$slug/inventory")({ component: InventoryPage });

const COLS = ["stock_quantity", "low_stock_threshold", "in_stock", "sku", "status"];

function InventoryPage() {
  const { slug } = Route.useParams();
  return (
    <SectionEditor
      slug={slug} sectionKey="inventory" title="Inventory" icon={<Boxes className="size-4" />} cols={COLS}
      toForm={(r) => ({
        stock_quantity: String(r.stock_quantity ?? 0), low_stock_threshold: String(r.low_stock_threshold ?? 5),
        in_stock: r.in_stock ?? true, sku: r.sku ?? "", status: r.status ?? "published",
      })}
      toPatch={(f) => ({
        stock_quantity: Number(f.stock_quantity) || 0, low_stock_threshold: Number(f.low_stock_threshold) || 0,
        in_stock: f.in_stock, sku: f.sku.trim() || null, status: f.status,
      })}
    >
      {(f, set) => (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Stock quantity" type="number" value={f.stock_quantity} onChange={(v) => set({ stock_quantity: v })} />
            <Field label="Low stock threshold" type="number" value={f.low_stock_threshold} onChange={(v) => set({ low_stock_threshold: v })} />
          </div>
          <Field label="SKU" value={f.sku} onChange={(v) => set({ sku: v })} />
          <Select label="Status" value={f.status} onChange={(v) => set({ status: v })}
            options={STATUS_OPTIONS.map((o) => ({ value: o, label: o.replace(/_/g, " ") }))} />
          <Toggle checked={f.in_stock} onChange={(v) => set({ in_stock: v })} label="In stock" hint="Allow customers to purchase this product" />
        </div>
      )}
    </SectionEditor>
  );
}
