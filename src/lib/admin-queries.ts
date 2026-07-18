import { supabase } from "@/integrations/supabase/client";
import { includeSeedInAnalytics } from "@/lib/seed-filter";


export type OrderRow = {
  id: string; user_id: string; status: string; payment_status: string;
  fulfillment_status: string; total: number; subtotal: number;
  shipping: number; tax: number; discount: number; currency: string;
  contact_email: string | null; created_at: string;
  order_items: { name: string; quantity: number; product_slug?: string; unit_price?: number; line_total?: number; variant_name?: string | null; variant_size?: string | null; variant_color?: string | null; variant_sku?: string | null; variant_image?: string | null }[];
};

export async function fetchOrders(days = 90): Promise<OrderRow[]> {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const includeSeed = await includeSeedInAnalytics();
  let query = supabase
    .from("orders")
    .select("id,user_id,status,payment_status,fulfillment_status,total,subtotal,tax,shipping,discount,currency,contact_email,created_at,order_items(name,quantity,product_slug,unit_price,line_total,variant_name,variant_size,variant_color,variant_sku,variant_image)")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (!includeSeed) query = query.eq("is_seeded", false);
  const { data } = await query;
  return (data as OrderRow[]) ?? [];
}


export type ProductRow = {
  id: string; slug: string; name: string; category: string;
  price: number; cost: number; rating: number; reviews: number;
  image: string | null; in_stock: boolean; discount: number | null;
  stock_quantity: number; reserved_quantity: number; low_stock_threshold: number;
  views_count: number; sku: string | null; featured: boolean;
};

export async function fetchProducts(): Promise<ProductRow[]> {
  // Perf: project only the columns ProductRow declares. `products` has 112
  // columns and admin dashboards previously downloaded every one of them
  // just to render a summary table.
  const { data } = await supabase
    .from("products")
    .select("id,slug,name,category,price,cost,rating,reviews,image,in_stock,discount,stock_quantity,reserved_quantity,low_stock_threshold,views_count,sku,featured")
    .order("sort_order");
  return (data as ProductRow[]) ?? [];
}

export function bucketByDay<T extends { created_at: string; total?: number }>(rows: T[], days: number, valueOf: (r: T) => number) {
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (days - 1));
  const map = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    map.set(d.toISOString().slice(0, 10), 0);
  }
  for (const r of rows) {
    const k = r.created_at.slice(0, 10);
    if (map.has(k)) map.set(k, (map.get(k) ?? 0) + valueOf(r));
  }
  return Array.from(map.entries()).map(([date, value]) => ({ date, value, label: new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) }));
}

export function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

export function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  const csv = toCSV(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
