import { supabase } from "@/integrations/supabase/client";
import { fetchProducts, fetchOrders, bucketByDay, type ProductRow, type OrderRow } from "@/lib/admin-queries";

export type CatHealth = "excellent" | "good" | "attention" | "critical";

export const HEALTH_META: Record<CatHealth, { label: string; color: string; ring: string; bg: string }> = {
  excellent: { label: "Excellent", color: "text-emerald-400", ring: "border-emerald-400/30", bg: "bg-emerald-400/10" },
  good: { label: "Good", color: "text-accent", ring: "border-accent/30", bg: "bg-accent/10" },
  attention: { label: "Needs Attention", color: "text-amber-400", ring: "border-amber-400/30", bg: "bg-amber-400/10" },
  critical: { label: "Critical", color: "text-destructive", ring: "border-destructive/30", bg: "bg-destructive/10" },
};

export type TrendPoint = { date: string; label: string; revenue: number; orders: number; views: number };

export type SubCategoryIntel = {
  id: string;
  slug: string;
  name: string;
  productCount: number;
  revenue: number;
  orders: number;
  conversion: number;
};

export type CategoryIntel = {
  id: string;
  slug: string;
  name: string;
  image: string | null;
  parentId: string | null;
  productCount: number;
  views: number;
  orders: number;
  units: number;
  revenue: number;
  conversion: number; // orders / views
  aov: number; // revenue / orders
  topProduct: { slug: string; name: string; revenue: number } | null;
  growth: number; // % change recent half vs previous half
  health: CatHealth;
  score: number; // 0-100
  trend: TrendPoint[];
  subcategories: SubCategoryIntel[];
};

export type CategoryInsight = {
  tone: "positive" | "warning" | "negative" | "neutral";
  text: string;
};

type CatRow = {
  id: string; slug: string; name: string; image: string | null; parent_id: string | null;
  views: number; sort_order: number;
};

function norm(v: number, max: number) {
  return max <= 0 ? 0 : Math.min(1, v / max);
}

/** Per-slug order aggregation including daily revenue/order buckets. */
function aggregateOrders(orders: OrderRow[]) {
  const bySlug = new Map<string, { orders: number; units: number; revenue: number }>();
  // rows tagged with the category-relevant created_at for daily bucketing
  for (const o of orders) {
    const seen = new Set<string>();
    for (const it of o.order_items ?? []) {
      const slug = it.product_slug;
      if (!slug) continue;
      const agg = bySlug.get(slug) ?? { orders: 0, units: 0, revenue: 0 };
      if (!seen.has(slug)) { agg.orders += 1; seen.add(slug); }
      agg.units += Number(it.quantity) || 0;
      agg.revenue += Number(it.line_total) || (Number(it.unit_price) || 0) * (Number(it.quantity) || 0);
      bySlug.set(slug, agg);
    }
  }
  return bySlug;
}

export async function fetchCategoryIntelligence(days = 90): Promise<{ categories: CategoryIntel[]; insights: CategoryInsight[] }> {
  const [{ data: catData }, products, orders] = await Promise.all([
    supabase.from("categories").select("id,slug,name,image,parent_id,views,sort_order").order("sort_order"),
    fetchProducts(),
    fetchOrders(days),
  ]);
  const cats = (catData as CatRow[] | null) ?? [];
  return computeCategoryIntelligence(cats, products, orders, days);
}

export function computeCategoryIntelligence(
  cats: CatRow[],
  products: ProductRow[],
  orders: OrderRow[],
  days: number,
): { categories: CategoryIntel[]; insights: CategoryInsight[] } {
  const bySlug = aggregateOrders(orders);
  const productsByCat = new Map<string, ProductRow[]>();
  for (const p of products) {
    const list = productsByCat.get(p.category) ?? [];
    list.push(p);
    productsByCat.set(p.category, list);
  }

  // Map each product slug -> its category slug for daily trend bucketing.
  const productCatSlug = new Map<string, string>();
  for (const p of products) productCatSlug.set(p.slug, p.category);

  // Pre-bucket orders by category for daily trends.
  function trendFor(catSlug: string): TrendPoint[] {
    const catOrders = orders.filter((o) =>
      (o.order_items ?? []).some((it) => it.product_slug && productCatSlug.get(it.product_slug) === catSlug),
    );
    const rev = bucketByDay(catOrders, days, (o) =>
      (o.order_items ?? [])
        .filter((it) => it.product_slug && productCatSlug.get(it.product_slug) === catSlug)
        .reduce((s, it) => s + (Number(it.line_total) || (Number(it.unit_price) || 0) * (Number(it.quantity) || 0)), 0),
    );
    const ord = bucketByDay(catOrders, days, () => 1);
    return rev.map((r, i) => ({ date: r.date, label: r.label, revenue: r.value, orders: ord[i]?.value ?? 0, views: 0 }));
  }

  function statsFor(slugs: string[]) {
    let orderCount = 0, units = 0, revenue = 0, views = 0;
    let top: { slug: string; name: string; revenue: number } | null = null;
    for (const ps of slugs) {
      const agg = bySlug.get(ps);
      if (agg) { orderCount += agg.orders; units += agg.units; revenue += agg.revenue; }
    }
    return { orderCount, units, revenue, views, top };
  }

  const subsByParent = new Map<string, CatRow[]>();
  for (const c of cats) if (c.parent_id) {
    const l = subsByParent.get(c.parent_id) ?? []; l.push(c); subsByParent.set(c.parent_id, l);
  }

  const mains = cats.filter((c) => !c.parent_id);

  // First pass — raw metrics.
  const raw = mains.map((c) => {
    // products belonging to this main category + its subcategories
    const subSlugs = (subsByParent.get(c.id) ?? []).map((s) => s.slug);
    const ownProducts = productsByCat.get(c.slug) ?? [];
    const subProducts = subSlugs.flatMap((s) => productsByCat.get(s) ?? []);
    const allProducts = [...ownProducts, ...subProducts];

    const views = allProducts.reduce((s, p) => s + (p.views_count ?? 0), 0);
    let orderCount = 0, units = 0, revenue = 0;
    let top: { slug: string; name: string; revenue: number } | null = null;
    for (const p of allProducts) {
      const agg = bySlug.get(p.slug);
      if (!agg) continue;
      orderCount += agg.orders; units += agg.units; revenue += agg.revenue;
      if (!top || agg.revenue > top.revenue) top = { slug: p.slug, name: p.name, revenue: agg.revenue };
    }

    const trend = trendFor(c.slug);
    // growth: recent half vs previous half (by revenue)
    const half = Math.floor(trend.length / 2);
    const prev = trend.slice(0, half).reduce((s, t) => s + t.revenue, 0);
    const recent = trend.slice(half).reduce((s, t) => s + t.revenue, 0);
    const growth = prev > 0 ? ((recent - prev) / prev) * 100 : recent > 0 ? 100 : 0;

    const conversion = views > 0 ? orderCount / views : 0;
    const aov = orderCount > 0 ? revenue / orderCount : 0;

    const subcategories: SubCategoryIntel[] = (subsByParent.get(c.id) ?? []).map((s) => {
      const sp = productsByCat.get(s.slug) ?? [];
      const st = statsFor(sp.map((p) => p.slug));
      const sViews = sp.reduce((acc, p) => acc + (p.views_count ?? 0), 0);
      return {
        id: s.id, slug: s.slug, name: s.name,
        productCount: sp.length, revenue: st.revenue, orders: st.orderCount,
        conversion: sViews > 0 ? st.orderCount / sViews : 0,
      };
    }).sort((a, b) => b.revenue - a.revenue);

    return {
      id: c.id, slug: c.slug, name: c.name, image: c.image, parentId: c.parent_id,
      productCount: allProducts.length, views, orders: orderCount, units, revenue,
      conversion, aov, topProduct: top, growth, trend, subcategories,
    };
  });

  // Health scoring — relative across categories.
  const maxRevenue = Math.max(1, ...raw.map((r) => r.revenue));
  const maxOrders = Math.max(1, ...raw.map((r) => r.orders));
  const maxConv = Math.max(0.0001, ...raw.map((r) => r.conversion));

  const categories: CategoryIntel[] = raw.map((r) => {
    const score = Math.round(
      (norm(r.revenue, maxRevenue) * 0.45 + norm(r.orders, maxOrders) * 0.35 + norm(r.conversion, maxConv) * 0.2) * 100,
    );
    const health: CatHealth = score >= 70 ? "excellent" : score >= 45 ? "good" : score >= 20 ? "attention" : "critical";
    return { ...r, score, health };
  }).sort((a, b) => b.revenue - a.revenue);

  return { categories, insights: buildInsights(categories) };
}

function buildInsights(categories: CategoryIntel[]): CategoryInsight[] {
  const out: CategoryInsight[] = [];
  if (categories.length === 0) return out;

  // Fastest growing
  const growing = [...categories].filter((c) => c.revenue > 0).sort((a, b) => b.growth - a.growth)[0];
  if (growing && growing.growth > 5) {
    out.push({ tone: "positive", text: `${growing.name} revenue increased ${growing.growth.toFixed(0)}% this period.` });
  }

  // High views, low conversion
  const maxViews = Math.max(1, ...categories.map((c) => c.views));
  const lowConv = categories
    .filter((c) => c.views >= maxViews * 0.4 && c.conversion < 0.01 && c.orders < 3)
    .sort((a, b) => b.views - a.views)[0];
  if (lowConv) {
    out.push({ tone: "warning", text: `${lowConv.name} have high views but low conversion.` });
  }

  // Underperforming
  const under = categories.filter((c) => c.health === "critical" && c.productCount > 0).sort((a, b) => a.revenue - b.revenue)[0];
  if (under) {
    out.push({ tone: "negative", text: `${under.name} are underperforming — consider promotion or merchandising.` });
  }

  // Top revenue driver
  const top = categories[0];
  if (top && top.revenue > 0) {
    out.push({ tone: "neutral", text: `${top.name} is your top revenue category at ${formatMoney(top.revenue)}.` });
  }

  // Declining
  const declining = [...categories].filter((c) => c.revenue > 0 && c.growth < -10).sort((a, b) => a.growth - b.growth)[0];
  if (declining) {
    out.push({ tone: "negative", text: `${declining.name} revenue dropped ${Math.abs(declining.growth).toFixed(0)}% — needs attention.` });
  }

  return out;
}

function formatMoney(v: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", notation: "compact", maximumFractionDigits: 1 }).format(v);
}
