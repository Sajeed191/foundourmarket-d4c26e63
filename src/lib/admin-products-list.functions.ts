import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STAFF_ROLES = ["admin", "super_admin", "manager", "warehouse_staff", "editor"];

async function assertStaff(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", STAFF_ROLES);
  if (!data || data.length === 0) throw new Error("Forbidden: staff access required.");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const listSchema = z.object({
  page: z.number().int().min(1).max(100_000).default(1),
  pageSize: z.number().int().min(1).max(200).default(24),
  search: z.string().max(200).optional(),
  category: z.string().max(120).optional(),
  status: z.enum(["draft", "published", "hidden", "archived", "scheduled", "preorder", "out_of_stock"]).optional(),
  inStock: z.boolean().optional(),
  featured: z.boolean().optional(),
  trending: z.boolean().optional(),
  bestseller: z.boolean().optional(),
  newArrival: z.boolean().optional(),
  oos: z.boolean().optional(),
  missingSku: z.boolean().optional(),
  slugs: z.array(z.string().min(1).max(220)).max(20_000).optional(),
  sort: z
    .enum(["newest", "oldest", "price", "price_asc", "stock", "stock_desc", "views", "name"])
    .default("newest"),
  view: z.enum(["active", "recycle"]).default("active"),
  idsOnly: z.boolean().optional(),
});

const SORT_MAP: Record<string, { col: string; asc: boolean }> = {
  newest: { col: "created_at", asc: false },
  oldest: { col: "created_at", asc: true },
  price: { col: "price_inr", asc: false },
  price_asc: { col: "price_inr", asc: true },
  stock: { col: "stock_quantity", asc: true },
  stock_desc: { col: "stock_quantity", asc: false },
  views: { col: "views_count", asc: false },
  name: { col: "name", asc: true },
};

function applyFilters(q: any, data: z.infer<typeof listSchema>) {
  q = data.view === "recycle" ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
  if (data.category && data.category !== "all") q = q.eq("category", data.category);
  if (data.status) q = q.eq("status", data.status);
  if (data.inStock !== undefined) q = q.eq("in_stock", data.inStock);
  if (data.featured) q = q.eq("featured", true);
  if (data.trending) q = q.eq("trending", true);
  if (data.bestseller) q = q.eq("bestseller", true);
  if (data.newArrival) q = q.eq("new_arrival", true);
  if (data.oos) q = q.lte("stock_quantity", 0);
  if (data.missingSku) q = q.or("sku.is.null,sku.eq.");
  if (data.slugs) q = q.in("slug", data.slugs);
  if (data.search) {
    const s = data.search.replace(/[,()*%]/g, " ").trim();
    if (s) {
      if (UUID_RE.test(s)) {
        q = q.eq("id", s);
      } else {
        const like = `%${s}%`;
        q = q.or(
          `name.ilike.${like},sku.ilike.${like},category.ilike.${like},slug.ilike.${like},tagline.ilike.${like}`,
        );
      }
    }
  }
  return q;
}

/** Server-side paginated/filtered/sorted product listing — keeps the full
 * catalog off the client and scales to thousands of products. */
export const adminListProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => listSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertStaff(supabase, userId);

    // Lightweight "all matching ids" mode for bulk select-all across pages.
    if (data.idsOnly) {
      let idq = applyFilters(supabase.from("products").select("id"), data);
      const { data: idRows, error: idErr } = await idq.limit(20_000);
      if (idErr) throw new Error(idErr.message);
      return { rows: [], total: idRows?.length ?? 0, ids: (idRows ?? []).map((r: any) => r.id) };
    }

    let q = applyFilters(supabase.from("products").select("*", { count: "exact" }), data);
    const s = SORT_MAP[data.sort] ?? SORT_MAP.newest;
    q = q.order(s.col, { ascending: s.asc, nullsFirst: false });
    const from = (data.page - 1) * data.pageSize;
    q = q.range(from, from + data.pageSize - 1);

    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0, ids: [] as string[] };
  });

type SummaryRow = {
  slug: string;
  name: string | null;
  sku: string | null;
  image: string | null;
  description: string | null;
  seo_title: string | null;
  seo_description: string | null;
  in_stock: boolean;
  featured: boolean;
  status: string | null;
  stock_quantity: number;
  reserved_quantity: number | null;
  low_stock_threshold: number;
  price_inr: number | null;
  price: number | null;
  cost_price_inr: number | null;
  cost: number | null;
};

const num = (v: unknown) => Number(v) || 0;

/** Aggregate catalog summary (counts, valuations, health buckets, duplicates,
 * top sellers) computed server-side so the browser never holds the catalog. */
export const adminProductsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertStaff(supabase, userId);

    const COLS =
      "slug,name,sku,image,description,seo_title,seo_description,in_stock,featured,status,stock_quantity,reserved_quantity,low_stock_threshold,price_inr,price,cost_price_inr,cost";
    const { data: rowsRaw, error } = await supabase
      .from("products")
      .select(COLS)
      .is("deleted_at", null)
      .limit(20_000);
    if (error) throw new Error(error.message);
    const rows = (rowsRaw as SummaryRow[]) ?? [];

    const priceOf = (p: SummaryRow) => num(p.price_inr ?? p.price);
    const costOf = (p: SummaryRow) => num(p.cost_price_inr ?? p.cost);

    const bucket = {
      missing_images: [] as string[],
      missing_desc: [] as string[],
      missing_seo: [] as string[],
      missing_sku: [] as string[],
      oos: [] as string[],
      low: [] as string[],
      hidden: [] as string[],
    };
    let active = 0,
      inactive = 0,
      featured = 0,
      draft = 0,
      unitsOnHand = 0,
      reserved = 0,
      stockValue = 0,
      costValue = 0;

    const nameSeen = new Map<string, string[]>();

    for (const p of rows) {
      if (p.in_stock) active++;
      else {
        inactive++;
        bucket.hidden.push(p.slug);
      }
      if (p.featured) featured++;
      if ((p.status ?? "") === "draft") draft++;
      unitsOnHand += num(p.stock_quantity);
      reserved += num(p.reserved_quantity);
      stockValue += priceOf(p) * num(p.stock_quantity);
      costValue += costOf(p) * num(p.stock_quantity);

      if (!(p.image && p.image.trim())) bucket.missing_images.push(p.slug);
      if (!p.description || p.description.trim().length < 20) bucket.missing_desc.push(p.slug);
      if (!p.seo_title || !p.seo_description) bucket.missing_seo.push(p.slug);
      if (!p.sku || !p.sku.trim()) bucket.missing_sku.push(p.slug);
      if (num(p.stock_quantity) <= 0) bucket.oos.push(p.slug);
      else if (num(p.stock_quantity) <= num(p.low_stock_threshold)) bucket.low.push(p.slug);

      const key = (p.name ?? "").trim().toLowerCase();
      if (key) {
        const arr = nameSeen.get(key) ?? [];
        arr.push(p.slug);
        nameSeen.set(key, arr);
      }
    }

    const duplicateGroups = [...nameSeen.entries()]
      .filter(([, slugs]) => slugs.length > 1)
      .map(([key, slugs]) => ({
        name: rows.find((r) => (r.name ?? "").trim().toLowerCase() === key)?.name ?? key,
        slugs,
        count: slugs.length,
      }))
      .sort((a, b) => b.count - a.count);

    // Top sellers (90d) from paid orders.
    const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    const { data: orderRows } = await supabase
      .from("orders")
      .select("order_items(product_slug,quantity,line_total)")
      .gte("created_at", since)
      .limit(2000);
    const sales = new Map<string, { units: number; revenue: number }>();
    for (const o of (orderRows as any[]) ?? []) {
      for (const it of o.order_items ?? []) {
        if (!it.product_slug) continue;
        const s = sales.get(it.product_slug) ?? { units: 0, revenue: 0 };
        s.units += num(it.quantity);
        s.revenue += num(it.line_total);
        sales.set(it.product_slug, s);
      }
    }
    const topSellers = [...sales.entries()]
      .map(([slug, s]) => {
        const p = rows.find((r) => r.slug === slug);
        return { slug, name: p?.name ?? slug, image: p?.image ?? null, units: s.units, revenue: s.revenue };
      })
      .filter((x) => x.units > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const total = rows.length;
    const healthScore = total
      ? Math.round(
          (rows.reduce((acc, p) => {
            let penalty = 0;
            if (!(p.image && p.image.trim())) penalty += 25;
            if (!p.description || p.description.trim().length < 20) penalty += 20;
            if (!p.seo_title || !p.seo_description) penalty += 15;
            if (num(p.stock_quantity) <= 0) penalty += 15;
            else if (num(p.stock_quantity) <= num(p.low_stock_threshold)) penalty += 8;
            if (!p.in_stock) penalty += 7;
            return acc + Math.max(0, 100 - penalty);
          }, 0) /
            total),
        )
      : 100;

    return {
      counts: {
        total,
        active,
        inactive,
        featured,
        draft,
        oos: bucket.oos.length,
        low: bucket.low.length,
        missingSku: bucket.missing_sku.length,
        missingImages: bucket.missing_images.length,
        missingSeo: bucket.missing_seo.length,
        missingDesc: bucket.missing_desc.length,
      },
      valuation: { unitsOnHand, reserved, stockValue, costValue },
      buckets: bucket,
      duplicateGroups,
      topSellers,
      healthScore,
    };
  });
