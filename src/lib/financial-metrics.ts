import { supabase } from "@/integrations/supabase/client";

/**
 * Real, backend-derived financial intelligence.
 * Every figure is read from the database under admin RLS — no mock values.
 *
 * Sources:
 *  - orders            → revenue, shipping, tax, discounts, status
 *  - order_items       → cost of goods (qty × product.cost)
 *  - products          → unit cost, stock
 *  - returns           → refunds (amount, reason, status)
 *  - payments          → transactions, pending payouts, gateways
 *  - page_views        → sales source attribution (referrer-derived)
 */

export type OrderRec = {
  id: string;
  user_id: string | null;
  status: string;
  payment_status: string;
  total: number;
  subtotal: number;
  shipping: number;
  tax: number;
  discount: number;
  currency: string;
  contact_email: string | null;
  shipping_address: { country?: string } | null;
  created_at: string;
  order_items: { name: string; quantity: number; product_slug?: string; unit_price?: number; line_total?: number }[];
};

export type ProductRec = { slug: string; cost: number; stock_quantity: number; low_stock_threshold: number };
export type ReturnRec = { id: string; order_id: string; reason: string; refund_amount: number; status: string; refund_status: string; created_at: string };
export type PaymentRec = { id: string; order_id: string; amount: number; status: string; method: string; transaction_id: string; currency: string; created_at: string };
export type PageViewRec = { referrer: string | null; created_at: string };

export type FinancialData = {
  orders: OrderRec[];
  products: ProductRec[];
  returns: ReturnRec[];
  payments: PaymentRec[];
  pageViews: PageViewRec[];
  currency: string;
};

const PAID = new Set(["paid", "captured", "succeeded", "completed"]);
const isPaidOrder = (o: OrderRec) => PAID.has((o.payment_status ?? "").toLowerCase()) || o.status === "delivered" || o.status === "shipped" || o.status === "processing" || o.status === "completed";

export async function fetchFinancialData(days = 365): Promise<FinancialData> {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

  const [ordersRes, productsRes, returnsRes, paymentsRes, viewsRes] = await Promise.all([
    supabase
      .from("orders")
      .select("id,user_id,status,payment_status,total,subtotal,shipping,tax,discount,currency,contact_email,shipping_address,created_at,order_items(name,quantity,product_slug,unit_price,line_total)")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("products").select("slug,cost,stock_quantity,low_stock_threshold"),
    supabase.from("returns").select("id,order_id,reason,refund_amount,status,refund_status,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(1000),
    supabase.from("payments").select("id,order_id,amount,status,method,transaction_id,currency,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(1000),
    supabase.from("page_views").select("referrer,created_at").gte("created_at", since).limit(1000),
  ]);

  const orders = (ordersRes.data ?? []) as OrderRec[];
  return {
    orders,
    products: (productsRes.data ?? []) as ProductRec[],
    returns: (returnsRes.data ?? []) as ReturnRec[],
    payments: (paymentsRes.data ?? []) as PaymentRec[],
    pageViews: (viewsRes.data ?? []) as PageViewRec[],
    currency: orders[0]?.currency ?? "USD",
  };
}

export type Summary = {
  revenue: number;
  cogs: number;
  grossProfit: number;
  refunds: number;
  shipping: number;
  tax: number;
  discount: number;
  netEarnings: number;
  margin: number;
  pendingPayouts: number;
  paidOrders: number;
  ordersCount: number;
  aov: number;
};

export function computeSummary(d: FinancialData): Summary {
  const costMap = new Map(d.products.map((p) => [p.slug, Number(p.cost) || 0]));
  let revenue = 0, cogs = 0, shipping = 0, tax = 0, discount = 0, paidOrders = 0;

  for (const o of d.orders) {
    if (!isPaidOrder(o)) continue;
    paidOrders += 1;
    revenue += Number(o.total) || 0;
    shipping += Number(o.shipping) || 0;
    tax += Number(o.tax) || 0;
    discount += Number(o.discount) || 0;
    cogs += (o.order_items ?? []).reduce((s, it) => s + (costMap.get(it.product_slug ?? "") ?? 0) * (it.quantity ?? 0), 0);
  }

  const refunds = d.returns
    .filter((r) => r.refund_status === "completed" || r.status === "completed" || r.status === "approved")
    .reduce((s, r) => s + (Number(r.refund_amount) || 0), 0);

  const pendingPayouts = d.payments
    .filter((p) => ["pending", "processing", "requires_capture"].includes((p.status ?? "").toLowerCase()))
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const grossProfit = revenue - cogs;
  const netEarnings = grossProfit - refunds - shipping - tax;
  const margin = revenue > 0 ? (netEarnings / revenue) * 100 : 0;

  return {
    revenue, cogs, grossProfit, refunds, shipping, tax, discount,
    netEarnings, margin, pendingPayouts,
    paidOrders, ordersCount: d.orders.length,
    aov: paidOrders > 0 ? revenue / paidOrders : 0,
  };
}

export type MonthRow = { month: string; label: string; orders: number; revenue: number; cost: number; refunds: number; shipping: number; tax: number; net: number; margin: number };

export function monthlyBreakdown(d: FinancialData): MonthRow[] {
  const costMap = new Map(d.products.map((p) => [p.slug, Number(p.cost) || 0]));
  const map = new Map<string, MonthRow>();
  const ensure = (k: string) => {
    if (!map.has(k)) map.set(k, { month: k, label: new Date(k + "-01").toLocaleDateString(undefined, { month: "short", year: "2-digit" }), orders: 0, revenue: 0, cost: 0, refunds: 0, shipping: 0, tax: 0, net: 0, margin: 0 });
    return map.get(k)!;
  };

  for (const o of d.orders) {
    if (!isPaidOrder(o)) continue;
    const rec = ensure(o.created_at.slice(0, 7));
    rec.orders += 1;
    rec.revenue += Number(o.total) || 0;
    rec.shipping += Number(o.shipping) || 0;
    rec.tax += Number(o.tax) || 0;
    rec.cost += (o.order_items ?? []).reduce((s, it) => s + (costMap.get(it.product_slug ?? "") ?? 0) * (it.quantity ?? 0), 0);
  }
  for (const r of d.returns) {
    if (!(r.refund_status === "completed" || r.status === "completed" || r.status === "approved")) continue;
    const rec = ensure(r.created_at.slice(0, 7));
    rec.refunds += Number(r.refund_amount) || 0;
  }
  for (const rec of map.values()) {
    rec.net = rec.revenue - rec.cost - rec.refunds - rec.shipping - rec.tax;
    rec.margin = rec.revenue > 0 ? (rec.net / rec.revenue) * 100 : 0;
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export type Granularity = "day" | "week" | "month";

export function revenueSeries(d: FinancialData, g: Granularity): { key: string; label: string; revenue: number; net: number; orders: number }[] {
  const costMap = new Map(d.products.map((p) => [p.slug, Number(p.cost) || 0]));
  const buckets = g === "day" ? 30 : g === "week" ? 12 : 12;
  const now = new Date();
  const keyOf = (date: Date) => {
    if (g === "month") return date.toISOString().slice(0, 7);
    if (g === "week") {
      const t = new Date(date); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() - t.getDay());
      return t.toISOString().slice(0, 10);
    }
    return date.toISOString().slice(0, 10);
  };
  const labelOf = (key: string) => {
    if (g === "month") return new Date(key + "-01").toLocaleDateString(undefined, { month: "short" });
    return new Date(key).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  const order: string[] = [];
  for (let i = buckets - 1; i >= 0; i--) {
    const dt = new Date(now);
    if (g === "day") dt.setDate(now.getDate() - i);
    else if (g === "week") dt.setDate(now.getDate() - i * 7);
    else dt.setMonth(now.getMonth() - i);
    const k = keyOf(dt);
    if (!order.includes(k)) order.push(k);
  }
  const map = new Map(order.map((k) => [k, { key: k, label: labelOf(k), revenue: 0, net: 0, orders: 0 }]));

  for (const o of d.orders) {
    if (!isPaidOrder(o)) continue;
    const k = keyOf(new Date(o.created_at));
    const rec = map.get(k);
    if (!rec) continue;
    const rev = Number(o.total) || 0;
    const cost = (o.order_items ?? []).reduce((s, it) => s + (costMap.get(it.product_slug ?? "") ?? 0) * (it.quantity ?? 0), 0);
    rec.revenue += rev;
    rec.net += rev - cost - (Number(o.shipping) || 0) - (Number(o.tax) || 0);
    rec.orders += 1;
  }
  return order.map((k) => map.get(k)!);
}

export function expenseBreakdown(s: Summary): { name: string; value: number; color: string }[] {
  return [
    { name: "Product cost", value: Math.max(0, s.cogs), color: "#f59e0b" },
    { name: "Refunds", value: Math.max(0, s.refunds), color: "#f43f5e" },
    { name: "Shipping", value: Math.max(0, s.shipping), color: "#22d3ee" },
    { name: "Taxes", value: Math.max(0, s.tax), color: "#a78bfa" },
  ].filter((x) => x.value > 0);
}

export function refundReasons(d: FinancialData): { reason: string; count: number; amount: number }[] {
  const map = new Map<string, { reason: string; count: number; amount: number }>();
  for (const r of d.returns) {
    const reason = (r.reason || "other").trim();
    const rec = map.get(reason) ?? { reason, count: 0, amount: 0 };
    rec.count += 1;
    rec.amount += Number(r.refund_amount) || 0;
    map.set(reason, rec);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, 6);
}

function classifySource(ref: string | null): "Direct" | "Organic" | "Social" | "Ads" | "Referral" {
  if (!ref) return "Direct";
  const r = ref.toLowerCase();
  if (/google|bing|duckduckgo|yahoo|ecosia/.test(r) && /gclid|utm_medium=cpc|utm_source=ads/.test(r)) return "Ads";
  if (/google|bing|duckduckgo|yahoo|ecosia/.test(r)) return "Organic";
  if (/facebook|instagram|tiktok|twitter|t\.co|x\.com|linkedin|pinterest|youtube|reddit|snapchat/.test(r)) return "Social";
  if (/utm_medium=cpc|gclid|fbclid|ads|doubleclick/.test(r)) return "Ads";
  return "Referral";
}

export function salesSources(d: FinancialData): { name: string; value: number; color: string }[] {
  const colors: Record<string, string> = { Direct: "#94a3b8", Organic: "#22d3ee", Social: "#a78bfa", Ads: "#f59e0b", Referral: "#34d399" };
  const map = new Map<string, number>();
  for (const v of d.pageViews) {
    const s = classifySource(v.referrer);
    map.set(s, (map.get(s) ?? 0) + 1);
  }
  return [...map.entries()].map(([name, value]) => ({ name, value, color: colors[name] ?? "#94a3b8" })).sort((a, b) => b.value - a.value);
}

export function countryRevenue(d: FinancialData): { country: string; revenue: number; orders: number }[] {
  const map = new Map<string, { country: string; revenue: number; orders: number }>();
  for (const o of d.orders) {
    if (!isPaidOrder(o)) continue;
    const country = (o.shipping_address?.country || "Unknown").toString();
    const rec = map.get(country) ?? { country, revenue: 0, orders: 0 };
    rec.revenue += Number(o.total) || 0;
    rec.orders += 1;
    map.set(country, rec);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8);
}

export type Anomaly = { id: string; severity: "warning" | "critical" | "info"; title: string; detail: string };

export function detectAnomalies(d: FinancialData, s: Summary, months: MonthRow[]): Anomaly[] {
  const out: Anomaly[] = [];

  // Profit drop month-over-month
  if (months.length >= 2) {
    const last = months[months.length - 1];
    const prev = months[months.length - 2];
    if (prev.net > 0 && last.net < prev.net * 0.75) {
      out.push({ id: "profit-drop", severity: "critical", title: "Profit drop detected", detail: `Net profit fell ${(((prev.net - last.net) / prev.net) * 100).toFixed(0)}% vs ${prev.label}.` });
    }
  }

  // Suspicious refund rate
  const refundRate = s.revenue > 0 ? (s.refunds / s.revenue) * 100 : 0;
  if (refundRate > 10) {
    out.push({ id: "refund-rate", severity: "warning", title: "Elevated refund rate", detail: `Refunds are ${refundRate.toFixed(1)}% of revenue — investigate quality or fraud.` });
  }

  // Low / negative margin
  if (s.revenue > 0 && s.margin < 10) {
    out.push({ id: "thin-margin", severity: s.margin < 0 ? "critical" : "warning", title: s.margin < 0 ? "Operating at a loss" : "Thin profit margin", detail: `Net margin is ${s.margin.toFixed(1)}%. Review pricing, COGS and shipping.` });
  }

  // Tax liability reminder
  if (s.tax > 0) {
    out.push({ id: "tax-due", severity: "info", title: "Tax collected this period", detail: `${s.tax.toFixed(2)} ${d.currency} in tax is set aside for remittance.` });
  }

  // Pending payouts
  if (s.pendingPayouts > 0) {
    out.push({ id: "pending-payout", severity: "info", title: "Pending payouts", detail: `${s.pendingPayouts.toFixed(2)} ${d.currency} awaiting settlement from payment gateways.` });
  }

  // Inventory cost risk
  const lowStock = d.products.filter((p) => p.stock_quantity <= (p.low_stock_threshold ?? 5)).length;
  if (lowStock > 0) {
    out.push({ id: "low-stock", severity: "warning", title: "Inventory cost risk", detail: `${lowStock} product(s) at/below threshold — restock to protect revenue.` });
  }

  return out;
}

/** Simple linear-regression forecast on monthly net profit (real trend, no fabricated numbers). */
export function forecastNext(months: MonthRow[]): { label: string; revenue: number; net: number } | null {
  if (months.length < 3) return null;
  const xs = months.map((_, i) => i);
  const linReg = (ys: number[]) => {
    const n = ys.length;
    const sx = xs.reduce((a, b) => a + b, 0);
    const sy = ys.reduce((a, b) => a + b, 0);
    const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0);
    const sxx = xs.reduce((a, x) => a + x * x, 0);
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
    const intercept = (sy - slope * sx) / n;
    return slope * n + intercept;
  };
  const next = new Date(months[months.length - 1].month + "-01");
  next.setMonth(next.getMonth() + 1);
  return {
    label: next.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
    revenue: Math.max(0, linReg(months.map((m) => m.revenue))),
    net: linReg(months.map((m) => m.net)),
  };
}

/* ============================================================
 * Extended enterprise metrics — all derived from real records.
 * ============================================================ */

const customerKey = (o: OrderRec) => (o.user_id || o.contact_email || "").toLowerCase();

export type ExtendedMetrics = {
  grossRevenue: number;      // sum of order subtotals (pre shipping/tax/discount)
  netRevenue: number;        // revenue minus refunds
  refundRate: number;        // refunds / revenue (%)
  customers: number;         // distinct paying customers
  repeatCustomers: number;   // customers with 2+ paid orders
  repeatRate: number;        // repeat / customers (%)
  ltv: number;               // revenue per paying customer
  failedPayments: number;    // count of failed payment attempts
  failedAmount: number;      // value of failed payments
  failedRate: number;        // failed / all payment attempts (%)
  healthScore: number;       // 0–100 composite financial health
};

export function extendedMetrics(d: FinancialData, s: Summary): ExtendedMetrics {
  let grossRevenue = 0;
  const ordersByCustomer = new Map<string, number>();

  for (const o of d.orders) {
    if (!isPaidOrder(o)) continue;
    grossRevenue += Number(o.subtotal) || 0;
    const k = customerKey(o);
    if (k) ordersByCustomer.set(k, (ordersByCustomer.get(k) ?? 0) + 1);
  }

  const customers = ordersByCustomer.size;
  const repeatCustomers = [...ordersByCustomer.values()].filter((n) => n >= 2).length;

  const FAILED = new Set(["failed", "declined", "error", "cancelled", "canceled"]);
  let failedPayments = 0, failedAmount = 0;
  for (const p of d.payments) {
    if (FAILED.has((p.status ?? "").toLowerCase())) {
      failedPayments += 1;
      failedAmount += Number(p.amount) || 0;
    }
  }
  const totalAttempts = d.payments.length || 0;

  const refundRate = s.revenue > 0 ? (s.refunds / s.revenue) * 100 : 0;
  const netRevenue = s.revenue - s.refunds;

  // Composite health score (real-signal weighted, clamped 0–100)
  let health = 50;
  health += Math.max(-25, Math.min(25, s.margin)); // margin contribution
  health -= Math.min(20, refundRate);              // refund drag
  health += repeatCustomers > 0 && customers > 0 ? Math.min(15, (repeatCustomers / customers) * 30) : 0;
  health -= totalAttempts > 0 ? Math.min(15, (failedPayments / totalAttempts) * 40) : 0;
  health = Math.max(0, Math.min(100, Math.round(health)));

  return {
    grossRevenue,
    netRevenue,
    refundRate,
    customers,
    repeatCustomers,
    repeatRate: customers > 0 ? (repeatCustomers / customers) * 100 : 0,
    ltv: customers > 0 ? s.revenue / customers : 0,
    failedPayments,
    failedAmount,
    failedRate: totalAttempts > 0 ? (failedPayments / totalAttempts) * 100 : 0,
    healthScore: health,
  };
}

export type ProductProfit = { slug: string; name: string; units: number; revenue: number; cost: number; profit: number; margin: number };

export function productProfitability(d: FinancialData): ProductProfit[] {
  const costMap = new Map(d.products.map((p) => [p.slug, Number(p.cost) || 0]));
  const map = new Map<string, ProductProfit>();
  for (const o of d.orders) {
    if (!isPaidOrder(o)) continue;
    for (const it of o.order_items ?? []) {
      const slug = it.product_slug ?? it.name;
      const rec = map.get(slug) ?? { slug, name: it.name, units: 0, revenue: 0, cost: 0, profit: 0, margin: 0 };
      const qty = it.quantity ?? 0;
      rec.units += qty;
      rec.revenue += Number(it.line_total) || (Number(it.unit_price) || 0) * qty;
      rec.cost += (costMap.get(it.product_slug ?? "") ?? 0) * qty;
      map.set(slug, rec);
    }
  }
  for (const rec of map.values()) {
    rec.profit = rec.revenue - rec.cost;
    rec.margin = rec.revenue > 0 ? (rec.profit / rec.revenue) * 100 : 0;
  }
  return [...map.values()].sort((a, b) => b.profit - a.profit).slice(0, 8);
}

export type TaxRow = { month: string; label: string; taxable: number; tax: number; orders: number };

export function taxReport(d: FinancialData): TaxRow[] {
  const map = new Map<string, TaxRow>();
  for (const o of d.orders) {
    if (!isPaidOrder(o)) continue;
    const k = o.created_at.slice(0, 7);
    const rec = map.get(k) ?? { month: k, label: new Date(k + "-01").toLocaleDateString(undefined, { month: "short", year: "2-digit" }), taxable: 0, tax: 0, orders: 0 };
    rec.taxable += Number(o.subtotal) || 0;
    rec.tax += Number(o.tax) || 0;
    rec.orders += 1;
    map.set(k, rec);
  }
  return [...map.values()].sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12);
}

export type CohortRow = { cohort: string; label: string; size: number; m0: number; m1: number; m2: number };

/** Customer retention cohorts by first-order month — counts repeat activity in following months. */
export function cohortRetention(d: FinancialData): CohortRow[] {
  // first order month per customer
  const first = new Map<string, string>();
  const activity = new Map<string, Set<string>>(); // customer -> set of active months
  for (const o of [...d.orders].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (!isPaidOrder(o)) continue;
    const k = customerKey(o);
    if (!k) continue;
    const month = o.created_at.slice(0, 7);
    if (!first.has(k)) first.set(k, month);
    if (!activity.has(k)) activity.set(k, new Set());
    activity.get(k)!.add(month);
  }

  const monthIndex = (m: string) => { const [y, mo] = m.split("-").map(Number); return y * 12 + (mo - 1); };
  const cohorts = new Map<string, CohortRow>();
  for (const [cust, fm] of first) {
    const rec = cohorts.get(fm) ?? { cohort: fm, label: new Date(fm + "-01").toLocaleDateString(undefined, { month: "short", year: "2-digit" }), size: 0, m0: 0, m1: 0, m2: 0 };
    rec.size += 1;
    rec.m0 += 1;
    const base = monthIndex(fm);
    const active = activity.get(cust)!;
    for (const am of active) {
      const diff = monthIndex(am) - base;
      if (diff === 1) rec.m1 += 1;
      if (diff === 2) rec.m2 += 1;
    }
    cohorts.set(fm, rec);
  }
  return [...cohorts.values()].sort((a, b) => b.cohort.localeCompare(a.cohort)).slice(0, 6);
}

