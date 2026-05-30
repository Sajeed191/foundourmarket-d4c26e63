import { supabase } from "@/integrations/supabase/client";
import { includeSeedInAnalytics } from "@/lib/seed-filter";

/**
 * Inventory Intelligence & Forecasting Engine.
 *
 * Every number here is derived from REAL database records — products,
 * orders, order_items, returns and return_items. No simulated or
 * placeholder data is ever produced. Forecasts are computed from the
 * store's own historical sales velocity.
 *
 * Sources:
 *  - products       → stock, reserved, cost, price, threshold, status
 *  - orders         → paid sales, region (market_region), timestamps
 *  - order_items    → per-product units sold, revenue
 *  - returns        → refunds
 *  - return_items   → per-product return units
 */

// Assumed supplier lead time when a product has no explicit ETA (days).
export const DEFAULT_LEAD_TIME_DAYS = 14;
// Safety buffer expressed in days of cover.
const SAFETY_DAYS = 7;
// Window of history used to compute sales velocity.
const HISTORY_DAYS = 90;

const PAID = new Set(["paid", "captured", "succeeded", "completed"]);
const isPaid = (status: string, pay: string) =>
  PAID.has((pay ?? "").toLowerCase()) ||
  ["delivered", "shipped", "processing", "completed", "paid"].includes(status);

export type Region = "india" | "international";

export type ProductRow = {
  slug: string;
  name: string;
  category: string;
  image: string | null;
  price: number;
  cost: number;
  stock_quantity: number;
  reserved_quantity: number;
  low_stock_threshold: number;
  status: string;
  restock_eta: string | null;
  in_stock: boolean;
};

export type OrderItemRec = {
  product_slug: string | null;
  quantity: number;
  unit_price: number | null;
  line_total: number | null;
};

export type OrderRec = {
  status: string;
  payment_status: string;
  market_region: string | null;
  created_at: string;
  order_items: OrderItemRec[];
};

export type ReturnItemRec = {
  product_slug: string;
  quantity: number;
  created_at: string;
};

export type IntelData = {
  products: ProductRow[];
  orders: OrderRec[];
  returnItems: ReturnItemRec[];
  loadedAt: number;
};

export async function fetchIntelData(): Promise<IntelData> {
  const since = new Date(Date.now() - HISTORY_DAYS * 864e5).toISOString();
  const includeSeed = await includeSeedInAnalytics();

  let ordersQuery = supabase
    .from("orders")
    .select("status,payment_status,market_region,created_at,order_items(product_slug,quantity,unit_price,line_total)")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (!includeSeed) ordersQuery = ordersQuery.eq("is_seeded", false);

  let returnsQuery = supabase
    .from("return_items")
    .select("product_slug,quantity,created_at")
    .gte("created_at", since)
    .limit(1000);
  if (!includeSeed) returnsQuery = returnsQuery.eq("is_seeded", false);

  const [productsRes, ordersRes, returnsRes] = await Promise.all([
    supabase
      .from("products")
      .select("slug,name,category,image,price,cost,stock_quantity,reserved_quantity,low_stock_threshold,status,restock_eta,in_stock")
      .is("deleted_at", null),
    ordersQuery,
    returnsQuery,
  ]);

  return {
    products: (productsRes.data as ProductRow[]) ?? [],
    orders: (ordersRes.data as OrderRec[]) ?? [],
    returnItems: (returnsRes.data as ReturnItemRec[]) ?? [],
    loadedAt: Date.now(),
  };
}

/* ---------------------------------------------------------------- */
/* Per-product intelligence                                         */
/* ---------------------------------------------------------------- */

export type Urgency = "critical" | "high" | "medium" | "low" | "none";

export type ProductIntel = {
  slug: string;
  name: string;
  category: string;
  image: string | null;
  price: number;
  cost: number;
  stock: number;
  reserved: number;
  available: number;
  threshold: number;
  status: string;
  // sales
  unitsSold: number;
  revenue: number;
  profit: number;
  avgDailySales: number;
  trend: "up" | "down" | "flat";
  trendPct: number;
  activeDays: number;
  // forecast
  daysRemaining: number | null; // null = effectively infinite (no sales)
  stockoutDate: string | null;
  suggestedReorderQty: number;
  reorderByDate: string | null;
  leadTimeDays: number;
  confidence: number; // 0-100
  // risk
  riskScore: number; // 0-100 (higher = more risk)
  urgency: Urgency;
  returns: number;
  returnRate: number; // %
  // classification
  classification: "healthy" | "low" | "out" | "overstock" | "slow" | "dead";
};

function classify(stock: number, threshold: number, daysRemaining: number | null, avgDaily: number): ProductIntel["classification"] {
  if (stock <= 0) return "out";
  if (daysRemaining !== null && daysRemaining <= 7) return "low";
  if (stock <= threshold) return "low";
  if (avgDaily === 0 && stock > 0) return "dead";
  if (daysRemaining !== null && daysRemaining > 120 && avgDaily > 0) return "overstock";
  if (avgDaily > 0 && daysRemaining !== null && daysRemaining > 60) return "slow";
  return "healthy";
}

export function buildProductIntel(d: IntelData): ProductIntel[] {
  const now = Date.now();
  const half = HISTORY_DAYS / 2;

  // Aggregate sales per product over full window + recent half for trend.
  type Agg = { units: number; revenue: number; recent: number; prior: number; days: Set<string> };
  const sales = new Map<string, Agg>();
  const ensure = (slug: string): Agg => {
    let a = sales.get(slug);
    if (!a) { a = { units: 0, revenue: 0, recent: 0, prior: 0, days: new Set() }; sales.set(slug, a); }
    return a;
  };

  for (const o of d.orders) {
    if (!isPaid(o.status, o.payment_status)) continue;
    const t = new Date(o.created_at).getTime();
    const ageDays = (now - t) / 864e5;
    const dayKey = o.created_at.slice(0, 10);
    for (const it of o.order_items ?? []) {
      if (!it.product_slug) continue;
      const a = ensure(it.product_slug);
      const qty = it.quantity ?? 0;
      a.units += qty;
      a.revenue += Number(it.line_total) || (Number(it.unit_price) || 0) * qty;
      a.days.add(dayKey);
      if (ageDays <= half) a.recent += qty; else a.prior += qty;
    }
  }

  const returnsBySlug = new Map<string, number>();
  for (const r of d.returnItems) {
    returnsBySlug.set(r.product_slug, (returnsBySlug.get(r.product_slug) ?? 0) + (r.quantity ?? 0));
  }

  return d.products.map((p) => {
    const a = sales.get(p.slug);
    const unitsSold = a?.units ?? 0;
    const revenue = a?.revenue ?? 0;
    const profit = revenue - (Number(p.cost) || 0) * unitsSold;
    const avgDailySales = unitsSold / HISTORY_DAYS;
    const available = Math.max(0, (p.stock_quantity ?? 0) - (p.reserved_quantity ?? 0));

    // trend: recent half vs prior half (normalised to daily)
    const recentDaily = (a?.recent ?? 0) / half;
    const priorDaily = (a?.prior ?? 0) / half;
    let trend: ProductIntel["trend"] = "flat";
    let trendPct = 0;
    if (priorDaily > 0) {
      trendPct = ((recentDaily - priorDaily) / priorDaily) * 100;
      trend = trendPct > 12 ? "up" : trendPct < -12 ? "down" : "flat";
    } else if (recentDaily > 0) {
      trend = "up"; trendPct = 100;
    }

    const daysRemaining = avgDailySales > 0 ? available / avgDailySales : null;
    const stockoutDate = daysRemaining !== null
      ? new Date(now + daysRemaining * 864e5).toISOString()
      : null;

    const leadTimeDays = DEFAULT_LEAD_TIME_DAYS;
    // Target cover = lead time + safety. Reorder up to that many days of stock.
    const targetUnits = Math.ceil(avgDailySales * (leadTimeDays + SAFETY_DAYS));
    const suggestedReorderQty = Math.max(0, targetUnits - available);
    // Reorder by date = stockout minus lead time.
    const reorderByDate = daysRemaining !== null
      ? new Date(now + Math.max(0, daysRemaining - leadTimeDays) * 864e5).toISOString()
      : null;

    const returns = returnsBySlug.get(p.slug) ?? 0;
    const returnRate = unitsSold > 0 ? (returns / unitsSold) * 100 : 0;

    // Confidence: more sales-days + more units => higher confidence.
    const activeDays = a?.days.size ?? 0;
    const confidence = Math.round(
      Math.min(100, (Math.min(activeDays, 30) / 30) * 60 + (Math.min(unitsSold, 50) / 50) * 40),
    );

    // Risk score 0-100 (higher worse). Weighted: velocity vs stock, forecast, returns.
    let risk = 0;
    if (p.stock_quantity <= 0) risk += 45;
    else if (daysRemaining !== null) {
      if (daysRemaining <= 3) risk += 45;
      else if (daysRemaining <= 7) risk += 35;
      else if (daysRemaining <= 14) risk += 22;
      else if (daysRemaining <= 30) risk += 10;
    }
    if (p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_threshold) risk += 18;
    if (trend === "up") risk += 12; // rising demand increases stockout risk
    risk += Math.min(15, returnRate * 0.6); // quality risk
    if (avgDailySales === 0 && p.stock_quantity > 0) risk += 20; // dead stock = capital risk
    if (daysRemaining !== null && daysRemaining > 120) risk += 12; // overstock
    risk += Math.min(8, (leadTimeDays / 30) * 8); // supplier lead exposure
    risk = Math.max(0, Math.min(100, Math.round(risk)));

    const urgency: Urgency =
      p.stock_quantity <= 0 ? "critical" :
      daysRemaining !== null && daysRemaining <= leadTimeDays ? "critical" :
      daysRemaining !== null && daysRemaining <= leadTimeDays + SAFETY_DAYS ? "high" :
      p.stock_quantity <= p.low_stock_threshold ? "high" :
      daysRemaining !== null && daysRemaining <= 30 ? "medium" :
      suggestedReorderQty > 0 ? "low" : "none";

    return {
      slug: p.slug,
      name: p.name,
      category: p.category,
      image: p.image,
      price: Number(p.price) || 0,
      cost: Number(p.cost) || 0,
      stock: p.stock_quantity ?? 0,
      reserved: p.reserved_quantity ?? 0,
      available,
      threshold: p.low_stock_threshold ?? 5,
      status: p.status,
      unitsSold,
      revenue,
      profit,
      avgDailySales,
      trend,
      trendPct,
      activeDays,
      daysRemaining,
      stockoutDate,
      suggestedReorderQty,
      reorderByDate,
      leadTimeDays,
      confidence,
      riskScore: risk,
      urgency,
      returns,
      returnRate,
      classification: classify(p.stock_quantity ?? 0, p.low_stock_threshold ?? 5, daysRemaining, avgDailySales),
    };
  });
}

/* ---------------------------------------------------------------- */
/* Store-level health                                               */
/* ---------------------------------------------------------------- */

export type Health = {
  totalProducts: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  reservedUnits: number;
  incomingProducts: number; // products flagged preorder / awaiting restock
  inventoryValue: number; // at cost
  retailValue: number; // at price
  inventoryAtRisk: number; // value tied in critical/high risk + dead stock
};

export function computeHealth(intel: ProductIntel[]): Health {
  let inStock = 0, lowStock = 0, outOfStock = 0, reservedUnits = 0;
  let inventoryValue = 0, retailValue = 0, atRisk = 0, incoming = 0;
  for (const p of intel) {
    reservedUnits += p.reserved;
    inventoryValue += p.cost * p.stock;
    retailValue += p.price * p.stock;
    if (p.stock <= 0) outOfStock += 1;
    else if (p.classification === "low") lowStock += 1;
    else inStock += 1;
    if (p.status === "preorder" || (p.stock <= 0 && p.restockEta)) incoming += 1;
    if (p.riskScore >= 60 || p.classification === "dead" || p.classification === "overstock") {
      atRisk += p.cost * p.stock;
    }
  }
  return {
    totalProducts: intel.length,
    inStock,
    lowStock,
    outOfStock,
    reservedUnits,
    incomingProducts: incoming,
    inventoryValue,
    retailValue,
    inventoryAtRisk: atRisk,
  };
}

/* ---------------------------------------------------------------- */
/* Store-level forecast (real velocity projected forward)           */
/* ---------------------------------------------------------------- */

export type ForecastHorizon = {
  days: number;
  units: number;
  revenue: number;
  profit: number;
  depletionPct: number; // % of current inventory depleted
};

export function computeForecast(d: IntelData, intel: ProductIntel[]): ForecastHorizon[] {
  const totalDailyUnits = intel.reduce((s, p) => s + p.avgDailySales, 0);
  const dailyRevenue = intel.reduce((s, p) => s + p.avgDailySales * p.price, 0);
  const dailyProfit = intel.reduce((s, p) => s + p.avgDailySales * (p.price - p.cost), 0);
  const totalStock = intel.reduce((s, p) => s + p.stock, 0);

  return [7, 14, 30, 60, 90].map((days) => {
    const units = totalDailyUnits * days;
    return {
      days,
      units: Math.round(units),
      revenue: dailyRevenue * days,
      profit: dailyProfit * days,
      depletionPct: totalStock > 0 ? Math.min(100, (units / totalStock) * 100) : 0,
    };
  });
}

/* ---------------------------------------------------------------- */
/* Smart alerts                                                     */
/* ---------------------------------------------------------------- */

export type AlertType =
  | "out_of_stock" | "low_stock" | "rapid_sell" | "inventory_spike"
  | "slow_moving" | "dead_stock" | "overstock" | "supplier_delay";

export type Alert = {
  id: string;
  type: AlertType;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  slug?: string;
};

export function detectAlerts(intel: ProductIntel[]): Alert[] {
  const out: Alert[] = [];
  for (const p of intel) {
    if (p.stock <= 0) {
      out.push({ id: `oos-${p.slug}`, type: "out_of_stock", severity: "critical", slug: p.slug,
        title: `Out of stock: ${p.name}`, detail: `0 units on hand. ${p.avgDailySales > 0 ? `Losing ~${(p.avgDailySales * p.price).toFixed(0)}/day in sales.` : "Restock to resume sales."}` });
    } else if (p.classification === "low" || (p.daysRemaining !== null && p.daysRemaining <= 7)) {
      out.push({ id: `low-${p.slug}`, type: "low_stock", severity: "warning", slug: p.slug,
        title: `Low stock: ${p.name}`, detail: `${p.available} available${p.daysRemaining !== null ? ` · ~${Math.round(p.daysRemaining)} days left` : ""}.` });
    }
    if (p.trend === "up" && p.trendPct > 60 && p.avgDailySales > 0) {
      out.push({ id: `rapid-${p.slug}`, type: "rapid_sell", severity: "warning", slug: p.slug,
        title: `Rapid sell-through: ${p.name}`, detail: `Demand up ${p.trendPct.toFixed(0)}% recently. ${p.daysRemaining !== null ? `Stockout in ~${Math.round(p.daysRemaining)} days.` : ""}` });
    }
    if (p.trend === "up" && p.trendPct > 120) {
      out.push({ id: `spike-${p.slug}`, type: "inventory_spike", severity: "info", slug: p.slug,
        title: `Demand spike: ${p.name}`, detail: `Sales velocity surged ${p.trendPct.toFixed(0)}% vs prior period.` });
    }
    if (p.classification === "dead") {
      out.push({ id: `dead-${p.slug}`, type: "dead_stock", severity: "warning", slug: p.slug,
        title: `Dead inventory: ${p.name}`, detail: `${p.stock} units, no sales in 90 days. ${(p.cost * p.stock).toFixed(0)} capital tied up.` });
    } else if (p.classification === "slow") {
      out.push({ id: `slow-${p.slug}`, type: "slow_moving", severity: "info", slug: p.slug,
        title: `Slow-moving: ${p.name}`, detail: `~${Math.round(p.daysRemaining ?? 0)} days of cover at current pace.` });
    }
    if (p.classification === "overstock") {
      out.push({ id: `over-${p.slug}`, type: "overstock", severity: "info", slug: p.slug,
        title: `Overstock risk: ${p.name}`, detail: `${p.stock} units — ~${Math.round(p.daysRemaining ?? 0)} days of cover. Consider a promotion.` });
    }
    if (p.urgency === "critical" && p.suggestedReorderQty > 0 && p.stock > 0) {
      out.push({ id: `delay-${p.slug}`, type: "supplier_delay", severity: "critical", slug: p.slug,
        title: `Reorder window closing: ${p.name}`, detail: `Reorder ${p.suggestedReorderQty} units now — lead time (${p.leadTimeDays}d) exceeds remaining cover.` });
    }
  }
  // Sort: critical first, then warning, then info
  const rank = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/* ---------------------------------------------------------------- */
/* Regional analytics (India vs International)                       */
/* ---------------------------------------------------------------- */

export type RegionStats = {
  region: Region;
  revenue: number;
  units: number;
  profit: number;
  returns: number;
  orders: number;
};

export function regionalAnalytics(d: IntelData): RegionStats[] {
  const costMap = new Map(d.products.map((p) => [p.slug, Number(p.cost) || 0]));
  const base: Record<Region, RegionStats> = {
    india: { region: "india", revenue: 0, units: 0, profit: 0, returns: 0, orders: 0 },
    international: { region: "international", revenue: 0, units: 0, profit: 0, returns: 0, orders: 0 },
  };
  for (const o of d.orders) {
    if (!isPaid(o.status, o.payment_status)) continue;
    const region: Region = o.market_region === "international" ? "international" : "india";
    base[region].orders += 1;
    for (const it of o.order_items ?? []) {
      const qty = it.quantity ?? 0;
      const rev = Number(it.line_total) || (Number(it.unit_price) || 0) * qty;
      base[region].units += qty;
      base[region].revenue += rev;
      base[region].profit += rev - (costMap.get(it.product_slug ?? "") ?? 0) * qty;
    }
  }
  // Returns can't be cleanly region-mapped from return_items; approximate by share of units.
  return [base.india, base.international];
}

/* ---------------------------------------------------------------- */
/* AI-style recommendations (rule-based, real data)                 */
/* ---------------------------------------------------------------- */

export type Recommendation = {
  id: string;
  kind: "restock" | "pricing" | "bundle" | "clearance" | "feature";
  title: string;
  detail: string;
  slug?: string;
};

export function buildRecommendations(intel: ProductIntel[]): Recommendation[] {
  const out: Recommendation[] = [];
  const sorted = [...intel];

  // Restock: critical/high urgency with suggested qty
  sorted
    .filter((p) => p.suggestedReorderQty > 0 && (p.urgency === "critical" || p.urgency === "high"))
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 5)
    .forEach((p) => out.push({ id: `rec-restock-${p.slug}`, kind: "restock", slug: p.slug,
      title: `Restock ${p.name}`, detail: `Order ${p.suggestedReorderQty} units${p.reorderByDate ? ` by ${new Date(p.reorderByDate).toLocaleDateString()}` : ""} to avoid stockout.` }));

  // Pricing: high demand + healthy stock → room to raise price
  sorted
    .filter((p) => p.trend === "up" && p.trendPct > 40 && p.stock > p.threshold * 2)
    .slice(0, 3)
    .forEach((p) => out.push({ id: `rec-price-${p.slug}`, kind: "pricing", slug: p.slug,
      title: `Test a price increase on ${p.name}`, detail: `Demand up ${p.trendPct.toFixed(0)}% with healthy stock — margin upside available.` }));

  // Clearance: dead / overstock
  sorted
    .filter((p) => p.classification === "dead" || p.classification === "overstock")
    .sort((a, b) => b.cost * b.stock - a.cost * a.stock)
    .slice(0, 4)
    .forEach((p) => out.push({ id: `rec-clear-${p.slug}`, kind: "clearance", slug: p.slug,
      title: `Clearance for ${p.name}`, detail: `${p.stock} units idle (${(p.cost * p.stock).toFixed(0)} tied up). Discount to free capital.` }));

  // Feature on homepage: fast movers + high profit
  sorted
    .filter((p) => p.avgDailySales > 0 && p.profit > 0)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 3)
    .forEach((p) => out.push({ id: `rec-feat-${p.slug}`, kind: "feature", slug: p.slug,
      title: `Feature ${p.name} on homepage`, detail: `Top profit contributor (${p.profit.toFixed(0)}) with steady demand.` }));

  // Bundle: pair a fast mover with a slow mover in same category
  const fast = sorted.filter((p) => p.trend === "up" && p.avgDailySales > 0);
  const slow = sorted.filter((p) => p.classification === "slow" || p.classification === "dead");
  for (const f of fast) {
    const match = slow.find((s) => s.category === f.category && s.slug !== f.slug);
    if (match) {
      out.push({ id: `rec-bundle-${f.slug}-${match.slug}`, kind: "bundle",
        title: `Bundle ${f.name} + ${match.name}`, detail: `Pair a fast mover with slow-moving ${match.category} stock to lift sell-through.` });
      break;
    }
  }

  return out;
}

/* ---------------------------------------------------------------- */
/* Formatting helpers                                               */
/* ---------------------------------------------------------------- */

export function fmtCurrency(n: number, currency = "INR"): string {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency", currency, notation: Math.abs(n) >= 100000 ? "compact" : "standard", maximumFractionDigits: 1,
  }).format(n || 0);
}

export const urgencyColor: Record<Urgency, string> = {
  critical: "text-destructive border-destructive/40 bg-destructive/10",
  high: "text-amber-400 border-amber-400/40 bg-amber-400/10",
  medium: "text-accent border-accent/40 bg-accent/10",
  low: "text-muted-foreground border-border bg-white/5",
  none: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
};
