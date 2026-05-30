import { supabase } from "@/integrations/supabase/client";

/**
 * Order Operations & Fulfillment Intelligence Engine.
 *
 * 100% database-backed. Everything is sourced from the role-gated
 * SECURITY DEFINER RPC `admin_order_operations`, which aggregates real
 * data from orders, order_items, products, shipments, returns, refunds,
 * payments, support_tickets, profiles and admin_activity_logs.
 *
 * No demo orders. No simulated shipments. Scores (risk, satisfaction,
 * delivery quality) are derived deterministically from the real aggregates.
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;
const now = () => Date.now();
const ms = (s: string | null | undefined) => (s ? +new Date(s) : null);
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

export type OrderItem = {
  name: string | null;
  product_slug: string | null;
  image: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type RawOrder = {
  id: string;
  created_at: string;
  status: string | null;
  payment_status: string | null;
  fulfillment_status: string | null;
  payment_method: string | null;
  payment_provider: string | null;
  market_region: string | null;
  currency: string | null;
  total: number;
  subtotal: number;
  discount: number | null;
  promo_code: string | null;
  tracking_number: string | null;
  carrier: string | null;
  user_id: string | null;
  contact_email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  country: string | null;
  items: OrderItem[];
  units: number;
  line_count: number;
  profit: number;
  ship_status: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  return_status: string | null;
  return_reason: string | null;
  refund_amount: number | null;
  refunded: boolean | null;
  refund_reason: string | null;
  tickets: number;
  open_tickets: number;
  lifetime_orders: number;
  lifetime_value: number;
};

export type Kpis = {
  total_orders: number;
  today_orders: number;
  pending: number;
  processing: number;
  shipped: number;
  delivered: number;
  cancelled: number;
  returned: number;
  refunded: number;
  cod_orders: number;
  paid_orders: number;
  failed_payments: number;
  revenue: number;
  profit: number;
  refund_total: number;
};

export type CourierPerf = {
  courier: string; shipments: number; delivered: number; returns: number; avg_days: number | null;
};
export type RegionPerf = {
  region: string; orders: number; revenue: number; returns: number; delivered: number;
};
export type ReasonCount = { reason: string; cnt: number };
export type TopReturned = { slug: string; name: string; cnt: number };
export type StaffSupport = {
  uid: string; full_name: string | null; avatar_url: string | null;
  tickets_handled: number; tickets_resolved: number; avg_handling_hours: number | null;
};
export type StaffActivity = {
  uid: string; full_name: string | null; avatar_url: string | null; actions: number; last_action: string | null;
};

export type RawOps = {
  generated_at: string;
  kpis: Kpis;
  aov: number;
  orders: RawOrder[];
  courier_performance: CourierPerf[];
  region_performance: RegionPerf[];
  return_reasons: ReasonCount[];
  top_returned: TopReturned[];
  staff_support: StaffSupport[];
  staff_activity: StaffActivity[];
};

/* ---------- Derived per-order intelligence ---------- */

export type WarRoomTag =
  | "new" | "failed_payment" | "cod" | "high_value" | "international"
  | "vip" | "refund_request" | "return_request" | "shipment_delay" | "support_linked";

export type EnrichedOrder = RawOrder & {
  tags: WarRoomTag[];
  riskScore: number;
  riskReasons: string[];
  satisfaction: number;
  fulfillmentHours: number | null;
  deliveryDays: number | null;
  isDelayed: boolean;
};

const HIGH_VALUE = 25000;
const VIP_LTV = 75000;

function isInternational(o: RawOrder) {
  const r = (o.market_region || o.country || "").toLowerCase();
  return r !== "" && r !== "india" && r !== "in";
}

function enrichOrder(o: RawOrder): EnrichedOrder {
  const tags: WarRoomTag[] = [];
  const created = ms(o.created_at) ?? now();
  const age = now() - created;

  if (age < DAY) tags.push("new");
  if (o.payment_status === "failed") tags.push("failed_payment");
  const cod = !!o.payment_method && /cod|cash/i.test(o.payment_method);
  if (cod) tags.push("cod");
  if (o.total >= HIGH_VALUE) tags.push("high_value");
  if (isInternational(o)) tags.push("international");
  if (o.lifetime_value >= VIP_LTV || o.lifetime_orders >= 8) tags.push("vip");
  if (o.refund_amount && o.refund_amount > 0) tags.push("refund_request");
  if (o.return_status) tags.push("return_request");
  if (o.open_tickets > 0 || o.tickets > 0) tags.push("support_linked");

  // Fulfillment timing
  const shippedAt = ms(o.shipped_at);
  const deliveredAt = ms(o.delivered_at);
  const fulfillmentHours = shippedAt ? (shippedAt - created) / HOUR : null;
  const deliveryDays = shippedAt && deliveredAt ? (deliveredAt - shippedAt) / DAY : null;

  // Delay detection: paid & processing for >3 days without shipment, or shipped >7 days no delivery
  const active = !["delivered", "cancelled", "canceled"].includes((o.status || "").toLowerCase());
  let isDelayed = false;
  if (active) {
    if (!shippedAt && o.payment_status === "paid" && age > 3 * DAY) isDelayed = true;
    if (shippedAt && !deliveredAt && now() - shippedAt > 7 * DAY) isDelayed = true;
  }
  if (isDelayed) tags.push("shipment_delay");

  // Risk score (0-100)
  let risk = 0;
  const reasons: string[] = [];
  if (o.payment_status === "failed") { risk += 30; reasons.push("Failed payment"); }
  if (cod && o.total >= HIGH_VALUE) { risk += 20; reasons.push("High-value COD"); }
  else if (cod) { risk += 8; reasons.push("COD order"); }
  if (o.return_status) { risk += 18; reasons.push("Return in progress"); }
  if (o.refund_amount && o.refund_amount > 0) { risk += 15; reasons.push("Refund issued"); }
  if (o.open_tickets > 0) { risk += 12; reasons.push("Open support ticket"); }
  if (isInternational(o) && cod) { risk += 10; reasons.push("International COD"); }
  if (isDelayed) { risk += 14; reasons.push("Shipment delayed"); }
  if (o.profit < 0) { risk += 12; reasons.push("Negative margin"); }
  const riskScore = clamp(risk);

  // Satisfaction (0-100) — penalise problems, reward smooth delivery
  let sat = 80;
  if ((o.status || "").toLowerCase() === "delivered") sat += 10;
  if (o.return_status) sat -= 25;
  if (o.refund_amount && o.refund_amount > 0) sat -= 15;
  if (o.open_tickets > 0) sat -= 20;
  if (isDelayed) sat -= 15;
  if (["cancelled", "canceled"].includes((o.status || "").toLowerCase())) sat -= 30;
  const satisfaction = clamp(sat);

  return { ...o, tags, riskScore, riskReasons: reasons, satisfaction, fulfillmentHours, deliveryDays, isDelayed };
}

export type FulfillmentMetrics = {
  avgProcessingHours: number | null;
  avgDeliveryDays: number | null;
  delayedCount: number;
  fastest: EnrichedOrder[];
  slowest: EnrichedOrder[];
};

export type AiInsight = {
  id: string; kind: "priority" | "refund" | "delivery" | "vip" | "international" | "bottleneck";
  severity: "critical" | "warning" | "info";
  title: string; detail: string; count: number;
};

export type OrderOps = {
  generatedAt: string;
  kpis: Kpis;
  aov: number;
  orders: EnrichedOrder[];
  courierPerformance: (CourierPerf & { successRate: number; returnRate: number; quality: number })[];
  regionPerformance: (RegionPerf & { returnRate: number })[];
  returnReasons: ReasonCount[];
  topReturned: TopReturned[];
  staffSupport: StaffSupport[];
  staffActivity: StaffActivity[];
  fulfillment: FulfillmentMetrics;
  satisfactionScore: number;
  refundRate: number;
  returnRate: number;
  warRoom: Record<WarRoomTag, EnrichedOrder[]>;
  aiInsights: AiInsight[];
};

function buildWarRoom(orders: EnrichedOrder[]): Record<WarRoomTag, EnrichedOrder[]> {
  const tags: WarRoomTag[] = [
    "new", "failed_payment", "cod", "high_value", "international",
    "vip", "refund_request", "return_request", "shipment_delay", "support_linked",
  ];
  const room = {} as Record<WarRoomTag, EnrichedOrder[]>;
  for (const t of tags) room[t] = orders.filter((o) => o.tags.includes(t));
  return room;
}

function buildAi(orders: EnrichedOrder[], k: Kpis, war: Record<WarRoomTag, EnrichedOrder[]>): AiInsight[] {
  const out: AiInsight[] = [];
  const push = (i: AiInsight) => { if (i.count > 0) out.push(i); };

  push({ id: "priority", kind: "priority", severity: "critical",
    title: "Orders needing intervention",
    detail: "High-risk orders (risk \u2265 60) require immediate review.",
    count: orders.filter((o) => o.riskScore >= 60).length });

  push({ id: "failed", kind: "refund", severity: "critical",
    title: "Failed payments to recover",
    detail: "Reach out or retry payment to recover lost revenue.",
    count: war.failed_payment.length });

  push({ id: "delay", kind: "delivery", severity: "warning",
    title: "Delayed shipments",
    detail: "Orders breaching processing/delivery SLA.",
    count: war.shipment_delay.length });

  push({ id: "refundrisk", kind: "refund", severity: "warning",
    title: "Refund / return exposure",
    detail: "Active returns and refunds eroding margin.",
    count: war.return_request.length + war.refund_request.length });

  push({ id: "vip", kind: "vip", severity: "info",
    title: "VIP orders to delight",
    detail: "High-value customers \u2014 prioritise white-glove handling.",
    count: war.vip.length });

  push({ id: "intl", kind: "international", severity: "info",
    title: "International order opportunities",
    detail: "Expand fulfilment capacity for cross-border demand.",
    count: war.international.length });

  const bottleneck = orders.filter((o) => o.payment_status === "paid" && !o.shipped_at).length;
  push({ id: "bottleneck", kind: "bottleneck", severity: bottleneck > 10 ? "warning" : "info",
    title: "Fulfilment bottleneck",
    detail: "Paid orders awaiting dispatch \u2014 clear the queue to speed delivery.",
    count: bottleneck });

  return out.sort((a, b) => {
    const w = { critical: 0, warning: 1, info: 2 };
    return w[a.severity] - w[b.severity] || b.count - a.count;
  });
}

function avg(nums: number[]): number | null {
  const v = nums.filter((n) => Number.isFinite(n));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function deriveOps(raw: RawOps): OrderOps {
  const orders = (raw.orders || []).map(enrichOrder);
  const k = raw.kpis;

  const fulfilled = orders.filter((o) => o.fulfillmentHours != null);
  const delivered = orders.filter((o) => o.deliveryDays != null);
  const sortedByDelivery = [...delivered].sort((a, b) => (a.deliveryDays! - b.deliveryDays!));

  const fulfillment: FulfillmentMetrics = {
    avgProcessingHours: avg(fulfilled.map((o) => o.fulfillmentHours!)),
    avgDeliveryDays: avg(delivered.map((o) => o.deliveryDays!)),
    delayedCount: orders.filter((o) => o.isDelayed).length,
    fastest: sortedByDelivery.slice(0, 5),
    slowest: sortedByDelivery.slice(-5).reverse(),
  };

  const courierPerformance = (raw.courier_performance || []).map((c) => {
    const successRate = c.shipments ? clamp((c.delivered / c.shipments) * 100) : 0;
    const returnRate = c.shipments ? clamp((c.returns / c.shipments) * 100) : 0;
    const speed = c.avg_days != null ? clamp(100 - c.avg_days * 12) : 50;
    const quality = clamp(successRate * 0.6 + (100 - returnRate) * 0.2 + speed * 0.2);
    return { ...c, successRate, returnRate, quality };
  });

  const regionPerformance = (raw.region_performance || []).map((r) => ({
    ...r, returnRate: r.orders ? clamp((r.returns / r.orders) * 100) : 0,
  }));

  const war = buildWarRoom(orders);
  const satisfactionScore = clamp(avg(orders.map((o) => o.satisfaction)) ?? 0);
  const refundRate = k.total_orders ? +((k.refunded / k.total_orders) * 100).toFixed(1) : 0;
  const returnRate = k.total_orders ? +((k.returned / k.total_orders) * 100).toFixed(1) : 0;

  return {
    generatedAt: raw.generated_at,
    kpis: k,
    aov: raw.aov,
    orders,
    courierPerformance,
    regionPerformance,
    returnReasons: raw.return_reasons || [],
    topReturned: raw.top_returned || [],
    staffSupport: raw.staff_support || [],
    staffActivity: raw.staff_activity || [],
    fulfillment,
    satisfactionScore,
    refundRate,
    returnRate,
    warRoom: war,
    aiInsights: buildAi(orders, k, war),
  };
}

export async function fetchOrderOps(limit = 400): Promise<OrderOps> {
  // RPC is not in the generated types yet; cast through unknown.
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string, args: Record<string, unknown>,
  ) => Promise<{ data: RawOps | null; error: { message: string } | null }>)(
    "admin_order_operations", { _limit: limit },
  );
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No data returned");
  return deriveOps(data);
}
