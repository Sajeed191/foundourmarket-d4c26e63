import { supabase } from "@/integrations/supabase/client";
import { includeSeedInAnalytics } from "@/lib/seed-filter";

/**
 * Customer Intelligence Engine.
 *
 * Every metric is derived from REAL database records — profiles, orders,
 * order_items, refunds, support_tickets, product_reviews, product_questions
 * and wishlist. No simulated or placeholder customer data is ever produced.
 *
 * Sources:
 *  - profiles          → identity, region, signup date
 *  - orders            → spend, AOV, frequency, recency, region, payment method
 *  - order_items       → favourite products/categories, basket size, profit
 *  - refunds           → refund rate / refund-heavy detection
 *  - support_tickets   → support intensity
 *  - product_reviews   → engagement
 *  - product_questions → engagement
 *  - wishlist          → intent signals
 *  - products          → category + cost for profit contribution
 */

const PAID = new Set(["paid", "captured", "succeeded", "completed"]);
const isPaid = (status: string, pay: string) =>
  PAID.has((pay ?? "").toLowerCase()) ||
  ["delivered", "shipped", "processing", "completed", "paid"].includes((status ?? "").toLowerCase());

const DAY = 86_400_000;
const now = () => Date.now();

export type Region = "india" | "international";

export type CustomerSegment =
  | "Champions"
  | "Loyal Customers"
  | "Potential Loyalists"
  | "New Customers"
  | "Promising"
  | "Needs Attention"
  | "At Risk"
  | "Lost Customers";

export type CustomerTag =
  | "VIP"
  | "High Value"
  | "Loyal"
  | "At Risk"
  | "Refund Heavy"
  | "Support Intensive"
  | "New Customer";

export type ProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  country: string | null;
  market_region: string | null;
  created_at: string;
};

export type OrderRec = {
  id: string;
  user_id: string | null;
  total: number | null;
  status: string;
  payment_status: string;
  market_region: string | null;
  payment_method: string | null;
  contact_email: string | null;
  created_at: string;
};

export type OrderItemRec = {
  order_id: string;
  product_slug: string | null;
  name: string | null;
  quantity: number;
  line_total: number | null;
  unit_price: number | null;
};

export type RefundRec = { order_id: string; amount: number | null; status: string };

export type IntelData = {
  profiles: ProfileRow[];
  orders: OrderRec[];
  items: OrderItemRec[];
  refunds: RefundRec[];
  tickets: { user_id: string | null; status: string }[];
  reviews: { user_id: string | null }[];
  questions: { user_id: string | null }[];
  wishlist: { user_id: string | null }[];
  productMeta: Map<string, { category: string; cost: number }>;
};

export async function fetchCustomerIntel(): Promise<IntelData> {
  const includeSeed = await includeSeedInAnalytics();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seedFilter = (q: any) => (includeSeed ? q : q.eq("is_seeded", false));

  const [profilesR, ordersR, itemsR, refundsR, ticketsR, reviewsR, questionsR, wishlistR, productsR] = await Promise.all([
    seedFilter(supabase.from("profiles").select("id,full_name,phone,country,market_region,created_at").limit(20000)),
    seedFilter(supabase.from("orders").select("id,user_id,total,status,payment_status,market_region,payment_method,contact_email,created_at").order("created_at", { ascending: false }).limit(50000)),
    seedFilter(supabase.from("order_items").select("order_id,product_slug,name,quantity,line_total,unit_price").limit(100000)),
    supabase.from("refunds").select("order_id,amount,status").limit(50000),
    seedFilter(supabase.from("support_tickets").select("user_id,status").limit(50000)),
    seedFilter(supabase.from("product_reviews").select("user_id").limit(50000)),
    seedFilter(supabase.from("product_questions").select("user_id").limit(50000)),
    seedFilter(supabase.from("wishlist").select("user_id").limit(50000)),
    supabase.from("products").select("slug,category,cost,cost_price_inr").limit(20000),
  ]);

  const productMeta = new Map<string, { category: string; cost: number }>();
  ((productsR.data as { slug: string; category: string | null; cost: number | null; cost_price_inr: number | null }[]) ?? []).forEach((p) =>
    productMeta.set(p.slug, { category: p.category ?? "Uncategorized", cost: Number(p.cost ?? p.cost_price_inr ?? 0) }),
  );

  return {
    profiles: (profilesR as { data: ProfileRow[] }).data ?? [],
    orders: (ordersR as { data: OrderRec[] }).data ?? [],
    items: (itemsR as { data: OrderItemRec[] }).data ?? [],
    refunds: (refundsR.data as RefundRec[]) ?? [],
    tickets: (ticketsR as { data: { user_id: string | null; status: string }[] }).data ?? [],
    reviews: (reviewsR as { data: { user_id: string | null }[] }).data ?? [],
    questions: (questionsR as { data: { user_id: string | null }[] }).data ?? [],
    wishlist: (wishlistR as { data: { user_id: string | null }[] }).data ?? [],
    productMeta,
  };
}

export type CustomerIntel = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  region: Region;
  country: string | null;
  createdAt: string;
  // value
  lifetimeSpend: number;
  ordersCount: number;
  aov: number;
  profit: number;
  refundAmount: number;
  refundRate: number; // 0..1
  // behaviour
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  recencyDays: number | null; // days since last order
  tenureDays: number;
  frequencyPerMonth: number;
  avgBasketSize: number;
  favoriteCategory: string | null;
  favoriteProduct: string | null;
  preferredPayment: string | null;
  supportTickets: number;
  reviews: number;
  questions: number;
  wishlistCount: number;
  // scoring
  rfm: { r: number; f: number; m: number };
  segment: CustomerSegment;
  churnRisk: number; // 0..100
  tags: CustomerTag[];
  active: boolean;
  trend: "up" | "down" | "flat";
};

function quintile(sorted: number[], v: number): number {
  // returns 1..5 where 5 is best (highest)
  if (sorted.length === 0) return 1;
  const idx = sorted.findIndex((x) => x >= v);
  const rank = idx === -1 ? sorted.length - 1 : idx;
  return Math.min(5, Math.max(1, Math.ceil(((rank + 1) / sorted.length) * 5)));
}

function segmentFor(r: number, f: number, m: number, tenureDays: number, ordersCount: number): CustomerSegment {
  if (ordersCount === 0) return "Lost Customers";
  if (tenureDays <= 30 && ordersCount <= 1) return "New Customers";
  if (r >= 4 && f >= 4 && m >= 4) return "Champions";
  if (f >= 4 && m >= 3) return "Loyal Customers";
  if (r >= 4 && f <= 3) return "Potential Loyalists";
  if (r >= 3 && m >= 3) return "Promising";
  if (r <= 2 && f >= 3) return "At Risk";
  if (r <= 2 && f <= 2 && m <= 2) return "Lost Customers";
  return "Needs Attention";
}

export function buildCustomerIntel(data: IntelData): CustomerIntel[] {
  const { profiles, orders, items, refunds, tickets, reviews, questions, wishlist, productMeta } = data;

  const orderById = new Map(orders.map((o) => [o.id, o]));
  const itemsByOrder = new Map<string, OrderItemRec[]>();
  items.forEach((it) => {
    const arr = itemsByOrder.get(it.order_id) ?? [];
    arr.push(it);
    itemsByOrder.set(it.order_id, arr);
  });

  // refund total per user (via order)
  const refundByUser = new Map<string, number>();
  refunds.forEach((rf) => {
    const o = orderById.get(rf.order_id);
    if (!o?.user_id) return;
    if (!["processed", "succeeded", "completed", "paid"].includes((rf.status ?? "").toLowerCase())) return;
    refundByUser.set(o.user_id, (refundByUser.get(o.user_id) ?? 0) + Number(rf.amount ?? 0));
  });

  const countBy = (rows: { user_id: string | null }[]) => {
    const m = new Map<string, number>();
    rows.forEach((r) => r.user_id && m.set(r.user_id, (m.get(r.user_id) ?? 0) + 1));
    return m;
  };
  const ticketCount = countBy(tickets);
  const reviewCount = countBy(reviews);
  const questionCount = countBy(questions);
  const wishlistCount = countBy(wishlist);

  // group paid orders by user
  const ordersByUser = new Map<string, OrderRec[]>();
  orders.forEach((o) => {
    if (!o.user_id) return;
    const arr = ordersByUser.get(o.user_id) ?? [];
    arr.push(o);
    ordersByUser.set(o.user_id, arr);
  });

  const base: Omit<CustomerIntel, "rfm" | "segment" | "churnRisk" | "tags" | "active" | "trend">[] = [];

  for (const p of profiles) {
    const userOrders = (ordersByUser.get(p.id) ?? []).filter((o) => isPaid(o.status, o.payment_status));
    const sortedOrders = [...userOrders].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    const lifetimeSpend = userOrders.reduce((s, o) => s + Number(o.total ?? 0), 0);
    const ordersCount = userOrders.length;
    const aov = ordersCount ? lifetimeSpend / ordersCount : 0;

    // profit + basket + favourites
    let profit = 0;
    let units = 0;
    const catSpend = new Map<string, number>();
    const prodUnits = new Map<string, number>();
    const payCount = new Map<string, number>();
    for (const o of userOrders) {
      if (o.payment_method) payCount.set(o.payment_method, (payCount.get(o.payment_method) ?? 0) + 1);
      for (const it of itemsByOrder.get(o.id) ?? []) {
        const meta = it.product_slug ? productMeta.get(it.product_slug) : undefined;
        const line = Number(it.line_total ?? 0);
        profit += line - (meta?.cost ?? 0) * (it.quantity ?? 0);
        units += it.quantity ?? 0;
        if (meta?.category) catSpend.set(meta.category, (catSpend.get(meta.category) ?? 0) + line);
        const key = it.product_slug ?? it.name ?? "unknown";
        prodUnits.set(key, (prodUnits.get(key) ?? 0) + (it.quantity ?? 0));
      }
    }
    const favoriteCategory = [...catSpend.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const favoriteProduct = [...prodUnits.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const preferredPayment = [...payCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const avgBasketSize = ordersCount ? units / ordersCount : 0;

    const firstOrderAt = sortedOrders[0]?.created_at ?? null;
    const lastOrderAt = sortedOrders[sortedOrders.length - 1]?.created_at ?? null;
    const recencyDays = lastOrderAt ? Math.floor((now() - +new Date(lastOrderAt)) / DAY) : null;
    const tenureDays = Math.max(1, Math.floor((now() - +new Date(p.created_at)) / DAY));
    const frequencyPerMonth = ordersCount / Math.max(1, tenureDays / 30);

    const refundAmount = refundByUser.get(p.id) ?? 0;
    const refundRate = lifetimeSpend > 0 ? Math.min(1, refundAmount / lifetimeSpend) : 0;

    const region: Region = (p.market_region ?? sortedOrders[0]?.market_region ?? "").toLowerCase() === "international" ? "international" : "india";

    // trend: compare last 90d vs prior 90d spend
    const cut1 = now() - 90 * DAY;
    const cut2 = now() - 180 * DAY;
    const recentSpend = userOrders.filter((o) => +new Date(o.created_at) >= cut1).reduce((s, o) => s + Number(o.total ?? 0), 0);
    const priorSpend = userOrders.filter((o) => { const t = +new Date(o.created_at); return t >= cut2 && t < cut1; }).reduce((s, o) => s + Number(o.total ?? 0), 0);

    base.push({
      id: p.id,
      name: p.full_name || "Unnamed customer",
      email: sortedOrders[0]?.contact_email ?? userOrders[0]?.contact_email ?? null,
      phone: p.phone,
      region,
      country: p.country,
      createdAt: p.created_at,
      lifetimeSpend,
      ordersCount,
      aov,
      profit,
      refundAmount,
      refundRate,
      firstOrderAt,
      lastOrderAt,
      recencyDays,
      tenureDays,
      frequencyPerMonth,
      avgBasketSize,
      favoriteCategory,
      favoriteProduct,
      preferredPayment,
      supportTickets: ticketCount.get(p.id) ?? 0,
      reviews: reviewCount.get(p.id) ?? 0,
      questions: questionCount.get(p.id) ?? 0,
      wishlistCount: wishlistCount.get(p.id) ?? 0,
      _trendDelta: recentSpend - priorSpend,
    } as never);
  }

  // RFM distributions (only buyers)
  const buyers = base.filter((b) => b.ordersCount > 0);
  const recencySorted = buyers.map((b) => -(b.recencyDays ?? 9999)).sort((a, b) => a - b); // higher (less negative) = more recent = better
  const freqSorted = buyers.map((b) => b.ordersCount).sort((a, b) => a - b);
  const monetarySorted = buyers.map((b) => b.lifetimeSpend).sort((a, b) => a - b);

  const spendSortedDesc = [...buyers].sort((a, b) => b.lifetimeSpend - a.lifetimeSpend);
  const vipCutoff = spendSortedDesc[Math.max(0, Math.floor(spendSortedDesc.length * 0.05) - 1)]?.lifetimeSpend ?? Infinity;
  const highValueCutoff = spendSortedDesc[Math.max(0, Math.floor(spendSortedDesc.length * 0.2) - 1)]?.lifetimeSpend ?? Infinity;

  return base.map((b) => {
    const r = b.ordersCount > 0 ? quintile(recencySorted, -(b.recencyDays ?? 9999)) : 1;
    const f = b.ordersCount > 0 ? quintile(freqSorted, b.ordersCount) : 1;
    const m = b.ordersCount > 0 ? quintile(monetarySorted, b.lifetimeSpend) : 1;
    const segment = segmentFor(r, f, m, b.tenureDays, b.ordersCount);

    // churn risk 0..100
    let churn = 0;
    if (b.ordersCount > 0) {
      const rec = b.recencyDays ?? 9999;
      churn += Math.min(45, (rec / 120) * 45); // recency weight
      churn += (5 - f) * 6; // low frequency
      churn += b.refundRate * 25; // refund heavy
      if ((b as { _trendDelta: number })._trendDelta < 0) churn += 12; // declining spend
      churn = Math.min(100, Math.round(churn));
    } else {
      churn = b.tenureDays > 90 ? 80 : 40;
    }

    const tags: CustomerTag[] = [];
    if (b.lifetimeSpend >= vipCutoff && b.ordersCount >= 2) tags.push("VIP");
    if (b.lifetimeSpend >= highValueCutoff && !tags.includes("VIP")) tags.push("High Value");
    if (f >= 4) tags.push("Loyal");
    if (segment === "At Risk" || churn >= 65) tags.push("At Risk");
    if (b.refundRate >= 0.3 && b.refundAmount > 0) tags.push("Refund Heavy");
    if (b.supportTickets >= 5) tags.push("Support Intensive");
    if (b.tenureDays <= 30) tags.push("New Customer");

    const active = (b.recencyDays ?? 9999) <= 90;
    const trend: CustomerIntel["trend"] = (b as { _trendDelta: number })._trendDelta > 0 ? "up" : (b as { _trendDelta: number })._trendDelta < 0 ? "down" : "flat";

    const { _trendDelta, ...rest } = b as never as CustomerIntel & { _trendDelta: number };
    return { ...rest, rfm: { r, f, m }, segment, churnRisk: churn, tags, active, trend };
  });
}

/* ----------------------------- aggregates ----------------------------- */

export type HealthOverview = {
  total: number;
  active: number;
  newCustomers: number;
  returning: number;
  vip: number;
  dormant: number;
  atRisk: number;
  highValue: number;
};

export function computeHealth(rows: CustomerIntel[]): HealthOverview {
  return {
    total: rows.length,
    active: rows.filter((r) => r.active).length,
    newCustomers: rows.filter((r) => r.tenureDays <= 30).length,
    returning: rows.filter((r) => r.ordersCount >= 2).length,
    vip: rows.filter((r) => r.tags.includes("VIP")).length,
    dormant: rows.filter((r) => r.ordersCount > 0 && (r.recencyDays ?? 9999) > 120).length,
    atRisk: rows.filter((r) => r.tags.includes("At Risk")).length,
    highValue: rows.filter((r) => r.tags.includes("VIP") || r.tags.includes("High Value")).length,
  };
}

export type SegmentStat = { segment: CustomerSegment; count: number; revenue: number; profit: number };

const SEGMENT_ORDER: CustomerSegment[] = [
  "Champions", "Loyal Customers", "Potential Loyalists", "New Customers",
  "Promising", "Needs Attention", "At Risk", "Lost Customers",
];

export function segmentStats(rows: CustomerIntel[]): SegmentStat[] {
  const map = new Map<CustomerSegment, SegmentStat>();
  SEGMENT_ORDER.forEach((s) => map.set(s, { segment: s, count: 0, revenue: 0, profit: 0 }));
  rows.forEach((r) => {
    const s = map.get(r.segment)!;
    s.count += 1;
    s.revenue += r.lifetimeSpend;
    s.profit += r.profit;
  });
  return SEGMENT_ORDER.map((s) => map.get(s)!);
}

export type RegionStat = {
  region: Region;
  customers: number;
  revenue: number;
  orders: number;
  profit: number;
  refunds: number;
  newCustomers: number;
};

export function regionalStats(rows: CustomerIntel[]): RegionStat[] {
  const build = (region: Region): RegionStat => {
    const r = rows.filter((c) => c.region === region);
    return {
      region,
      customers: r.length,
      revenue: r.reduce((s, c) => s + c.lifetimeSpend, 0),
      orders: r.reduce((s, c) => s + c.ordersCount, 0),
      profit: r.reduce((s, c) => s + c.profit, 0),
      refunds: r.reduce((s, c) => s + c.refundAmount, 0),
      newCustomers: r.filter((c) => c.tenureDays <= 30).length,
    };
  };
  return [build("india"), build("international")];
}

export type VipLists = {
  topSpenders: CustomerIntel[];
  mostOrders: CustomerIntel[];
  topProfit: CustomerIntel[];
  mostLoyal: CustomerIntel[];
  fastestGrowing: CustomerIntel[];
};

export function vipLists(rows: CustomerIntel[]): VipLists {
  const buyers = rows.filter((r) => r.ordersCount > 0);
  return {
    topSpenders: [...buyers].sort((a, b) => b.lifetimeSpend - a.lifetimeSpend).slice(0, 8),
    mostOrders: [...buyers].sort((a, b) => b.ordersCount - a.ordersCount).slice(0, 8),
    topProfit: [...buyers].sort((a, b) => b.profit - a.profit).slice(0, 8),
    mostLoyal: [...buyers].sort((a, b) => b.frequencyPerMonth - a.frequencyPerMonth).slice(0, 8),
    fastestGrowing: [...buyers].filter((r) => r.trend === "up").sort((a, b) => b.lifetimeSpend - a.lifetimeSpend).slice(0, 8),
  };
}

export type CustomerAlert = {
  id: string;
  kind: "vip_order" | "vip_return" | "churn_risk" | "refund_anomaly" | "loyal_inactive";
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  customerId: string;
};

export function detectAlerts(rows: CustomerIntel[]): CustomerAlert[] {
  const out: CustomerAlert[] = [];
  for (const c of rows) {
    if (c.tags.includes("VIP") && (c.recencyDays ?? 9999) <= 3)
      out.push({ id: `vipo-${c.id}`, kind: "vip_order", severity: "low", title: `VIP order — ${c.name}`, detail: `Recent purchase from a top customer.`, customerId: c.id });
    if (c.tags.includes("VIP") && c.refundAmount > 0 && c.refundRate >= 0.15)
      out.push({ id: `vipr-${c.id}`, kind: "vip_return", severity: "high", title: `High-value return — ${c.name}`, detail: `VIP refund rate ${(c.refundRate * 100).toFixed(0)}%.`, customerId: c.id });
    if (c.churnRisk >= 70 && c.lifetimeSpend > 0)
      out.push({ id: `churn-${c.id}`, kind: "churn_risk", severity: c.tags.includes("VIP") ? "high" : "medium", title: `Churn risk — ${c.name}`, detail: `Risk score ${c.churnRisk}/100, ${c.recencyDays ?? "—"}d since last order.`, customerId: c.id });
    if (c.refundRate >= 0.4 && c.refundAmount > 0)
      out.push({ id: `ref-${c.id}`, kind: "refund_anomaly", severity: "medium", title: `Unusual refunds — ${c.name}`, detail: `Refund rate ${(c.refundRate * 100).toFixed(0)}%.`, customerId: c.id });
    if (c.tags.includes("Loyal") && (c.recencyDays ?? 0) > 60)
      out.push({ id: `loyal-${c.id}`, kind: "loyal_inactive", severity: "medium", title: `Loyal customer inactive — ${c.name}`, detail: `No order in ${c.recencyDays}d.`, customerId: c.id });
  }
  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 40);
}

export type Recommendation = {
  id: string;
  kind: "reengage" | "recognition" | "vip" | "promotion" | "support_followup";
  title: string;
  reason: string;
  customers: CustomerIntel[];
};

export function buildRecommendations(rows: CustomerIntel[]): Recommendation[] {
  const out: Recommendation[] = [];
  const reengage = rows.filter((r) => r.ordersCount > 0 && (r.recencyDays ?? 0) > 90 && r.churnRisk >= 55).sort((a, b) => b.lifetimeSpend - a.lifetimeSpend).slice(0, 10);
  if (reengage.length) out.push({ id: "rec-reengage", kind: "reengage", title: "Customers to re-engage", reason: "Valuable buyers gone quiet — send a win-back nudge.", customers: reengage });

  const recognition = rows.filter((r) => r.tags.includes("Loyal") && r.churnRisk < 50).sort((a, b) => b.frequencyPerMonth - a.frequencyPerMonth).slice(0, 10);
  if (recognition.length) out.push({ id: "rec-recognition", kind: "recognition", title: "Loyal customers to recognise", reason: "Consistent repeat buyers worth a personal thank-you.", customers: recognition });

  const vip = rows.filter((r) => r.tags.includes("VIP")).sort((a, b) => b.lifetimeSpend - a.lifetimeSpend).slice(0, 10);
  if (vip.length) out.push({ id: "rec-vip", kind: "vip", title: "Candidates for VIP treatment", reason: "Top 5% by lifetime spend — prioritise their experience.", customers: vip });

  const promo = rows.filter((r) => (r.segment === "Promising" || r.segment === "Potential Loyalists") && r.refundRate < 0.2).sort((a, b) => b.aov - a.aov).slice(0, 10);
  if (promo.length) out.push({ id: "rec-promo", kind: "promotion", title: "Customers for special promotions", reason: "High potential — a targeted offer can convert to loyal.", customers: promo });

  const support = rows.filter((r) => r.supportTickets >= 3 && r.lifetimeSpend > 0).sort((a, b) => b.supportTickets - a.supportTickets).slice(0, 10);
  if (support.length) out.push({ id: "rec-support", kind: "support_followup", title: "Customers needing support follow-up", reason: "Repeated tickets — proactive outreach reduces churn.", customers: support });

  return out;
}

/* monthly customer growth (signups) for the last N months */
export function growthSeries(rows: CustomerIntel[], months = 12): { label: string; count: number }[] {
  const buckets = new Map<string, number>();
  const labels: { key: string; label: string }[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = months - 1; i >= 0; i--) {
    const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const key = `${dt.getFullYear()}-${dt.getMonth()}`;
    labels.push({ key, label: dt.toLocaleDateString(undefined, { month: "short" }) });
    buckets.set(key, 0);
  }
  rows.forEach((r) => {
    const c = new Date(r.createdAt);
    const key = `${c.getFullYear()}-${c.getMonth()}`;
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  });
  return labels.map((l) => ({ label: l.label, count: buckets.get(l.key) ?? 0 }));
}

/* repeat purchase rate */
export function repeatPurchaseRate(rows: CustomerIntel[]): number {
  const buyers = rows.filter((r) => r.ordersCount > 0);
  if (!buyers.length) return 0;
  return buyers.filter((r) => r.ordersCount >= 2).length / buyers.length;
}

/* ----------------------------- formatting ----------------------------- */

export function fmtCurrency(n: number, region: Region = "india"): string {
  const cur = region === "international" ? "USD" : "INR";
  return new Intl.NumberFormat(region === "international" ? "en-US" : "en-IN", {
    style: "currency", currency: cur, maximumFractionDigits: 0,
  }).format(n || 0);
}

export const SEGMENT_COLOR: Record<CustomerSegment, string> = {
  Champions: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  "Loyal Customers": "text-accent border-accent/30 bg-accent/10",
  "Potential Loyalists": "text-sky-400 border-sky-400/30 bg-sky-400/10",
  "New Customers": "text-cyan-400 border-cyan-400/30 bg-cyan-400/10",
  Promising: "text-violet-400 border-violet-400/30 bg-violet-400/10",
  "Needs Attention": "text-amber-400 border-amber-400/30 bg-amber-400/10",
  "At Risk": "text-orange-400 border-orange-400/30 bg-orange-400/10",
  "Lost Customers": "text-destructive border-destructive/30 bg-destructive/10",
};

export function churnColor(score: number): string {
  if (score >= 70) return "text-destructive";
  if (score >= 45) return "text-amber-400";
  return "text-emerald-400";
}
