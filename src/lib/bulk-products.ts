import { supabase } from "@/integrations/supabase/client";

export type BulkAction =
  | "publish" | "unpublish" | "archive" | "restore"
  | "soft_delete" | "restore_deleted" | "permanent_delete" | "duplicate"
  | "move_category" | "set_collection" | "set_collections" | "set_homepage_section" | "set_priority"
  | "set_stock" | "inc_stock" | "dec_stock" | "set_low_threshold" | "set_inventory_tracking"
  | "set_price_inr" | "set_price_usd" | "inc_price_pct" | "dec_price_pct"
  | "set_sale" | "remove_sale" | "round_price"
  | "add_tags" | "remove_tags" | "replace_tags"
  | "set_badge" | "set_region"
  | "set_cod" | "set_return" | "set_warranty" | "set_shipping_class" | "set_delivery_estimate"
  | "schedule_publish" | "schedule_unpublish";

export type BulkResult = { ok: boolean; affected: number; action?: string; error?: string };

/**
 * Run a permission-protected, audited bulk action over many product ids.
 * All mutation + audit logging happens atomically inside the
 * `admin_bulk_products` SECURITY DEFINER function on the database.
 * Large selections are chunked so 10k+ catalogs never exceed payload limits.
 */
export async function runBulkAction(
  ids: string[],
  action: BulkAction,
  params: Record<string, unknown> = {},
): Promise<BulkResult> {
  if (!ids.length) return { ok: false, affected: 0, error: "No products selected" };
  const CHUNK = 500;
  let affected = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await (supabase.rpc as any)("admin_bulk_products", {
      _ids: slice,
      _action: action,
      _params: params,
    });
    if (error) return { ok: false, affected, error: error.message };
    affected += (data as BulkResult)?.affected ?? 0;
  }
  return { ok: true, affected, action };
}

/* ---------------- Export helpers ---------------- */

export function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const EXPORT_COLS = [
  "slug", "name", "category", "status", "price_inr", "compare_price_inr",
  "price_usd", "compare_price_usd", "stock_quantity", "low_stock_threshold",
  "sku", "barcode", "tags", "featured", "trending", "bestseller", "new_arrival",
  "hot_deal", "india_visible", "international_visible", "cod_enabled",
  "return_eligible", "warranty", "shipping_class", "delivery_estimate",
  "seo_title", "seo_description",
] as const;

function csvCell(v: unknown): string {
  if (Array.isArray(v)) v = v.join("|");
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

export function exportProductsCSV<T extends Record<string, unknown>>(rows: T[]): string {
  const header = EXPORT_COLS.join(",");
  const body = rows.map((r) => EXPORT_COLS.map((c) => csvCell(r[c])).join(",")).join("\n");
  return `${header}\n${body}`;
}

export function exportProductsJSON<T extends Record<string, unknown>>(rows: T[]): string {
  return JSON.stringify(
    rows.map((r) => Object.fromEntries(EXPORT_COLS.map((c) => [c, r[c] ?? null]))),
    null,
    2,
  );
}

export function actionLabel(a: BulkAction): string {
  const map: Record<string, string> = {
    publish: "Published", unpublish: "Unpublished", archive: "Archived",
    restore: "Restored", soft_delete: "Moved to Recycle Bin",
    restore_deleted: "Restored from Recycle Bin", permanent_delete: "Permanently deleted",
    duplicate: "Duplicated", move_category: "Moved category",
    set_stock: "Stock updated", inc_stock: "Stock increased", dec_stock: "Stock decreased",
    set_low_threshold: "Threshold updated", set_inventory_tracking: "Inventory tracking updated",
    set_price_inr: "INR price updated", set_price_usd: "USD price updated",
    inc_price_pct: "Prices increased", dec_price_pct: "Prices decreased",
    set_sale: "Sale applied", remove_sale: "Sale removed", round_price: "Prices rounded",
    add_tags: "Tags added", remove_tags: "Tags removed", replace_tags: "Tags replaced",
    set_badge: "Badge updated", set_region: "Region updated",
    set_cod: "COD updated", set_return: "Returns updated", set_warranty: "Warranty updated",
    set_shipping_class: "Shipping class updated", set_delivery_estimate: "Delivery estimate updated",
    schedule_publish: "Publishing scheduled", schedule_unpublish: "Unpublishing scheduled",
    set_collection: "Collection updated", set_homepage_section: "Homepage section updated",
    set_collections: "Collections updated", set_priority: "Priority updated",
  };
  return map[a] ?? a;
}
