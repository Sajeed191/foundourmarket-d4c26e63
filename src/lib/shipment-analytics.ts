// Pure, deterministic logistics analytics derived ONLY from real DB rows
// (shipments, orders, shipment_events). No mock data, no demo values, no
// hardcoded KPIs. Every number here is computed from the arrays passed in.
import { detectCourier, COURIERS, type CourierKey } from "@/lib/courier-sync.service";

export type ShipRow = {
  id: string;
  order_id: string;
  user_id: string | null;
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  status: string;
  estimated_delivery: string | null;
  packed_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  returned_at: string | null;
  cancelled_at: string | null;
  actual_delivery?: string | null;
  last_courier_sync?: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderRow = {
  id: string;
  user_id: string;
  status: string;
  total: number;
  currency: string | null;
  contact_email: string | null;
  payment_status?: string | null;
  fulfillment_status: string | null;
  tracking_number: string | null;
  carrier: string | null;
  shipping_address: Record<string, unknown> | null;
  created_at: string;
};

export type EventRow = {
  id: string;
  shipment_id: string;
  status: string;
  description: string | null;
  occurred_at: string | null;
  created_at: string;
  source?: string | null;
  courier?: string | null;
};

const HOUR = 3600_000;
const DAY = 86_400_000;
const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const ACTIVE_TRANSIT = ["shipped", "in_transit", "out_for_delivery"];

// ── Delay detection engine ───────────────────────────────────────────────────
export type DelaySeverity = "none" | "minor" | "moderate" | "critical";
export type DelayInfo = {
  delayed: boolean;
  reason: string | null;
  delayHours: number;
  delayDays: number;
  severity: DelaySeverity;
  noScans: boolean;
  stuck: boolean;
};

export function computeDelay(s: ShipRow, lastScanAt: number | null, now = Date.now()): DelayInfo {
  const none: DelayInfo = { delayed: false, reason: null, delayHours: 0, delayDays: 0, severity: "none", noScans: false, stuck: false };
  if (["delivered", "cancelled", "returned"].includes(s.status)) return none;

  let delayHours = 0;
  let reason: string | null = null;

  // ETA exceeded
  if (s.estimated_delivery) {
    const eta = new Date(s.estimated_delivery).getTime();
    if (!isNaN(eta) && eta < now) {
      delayHours = Math.max(delayHours, (now - eta) / HOUR);
      reason = "ETA exceeded";
    }
  }

  // No courier scans / stuck: in transit but no scan or update for >48h
  const lastActivity = lastScanAt ?? new Date(s.updated_at).getTime();
  const sinceActivity = (now - lastActivity) / HOUR;
  const noScans = ACTIVE_TRANSIT.includes(s.status) && lastScanAt == null && sinceActivity > 24;
  const stuck = ACTIVE_TRANSIT.includes(s.status) && sinceActivity > 48;
  if (stuck) {
    delayHours = Math.max(delayHours, sinceActivity);
    reason = reason ?? (noScans ? "No courier scans" : "Shipment stuck");
  }

  // Long transit time: shipped >7d ago and still not delivered
  if (s.shipped_at && ACTIVE_TRANSIT.includes(s.status)) {
    const transitH = (now - new Date(s.shipped_at).getTime()) / HOUR;
    if (transitH > 7 * 24) {
      delayHours = Math.max(delayHours, transitH - 7 * 24);
      reason = reason ?? "Long transit time";
    }
  }

  if (delayHours <= 0) return none;
  const severity: DelaySeverity = delayHours < 24 ? "minor" : delayHours < 72 ? "moderate" : "critical";
  return {
    delayed: true,
    reason,
    delayHours: Math.round(delayHours),
    delayDays: Math.floor(delayHours / 24),
    severity,
    noScans,
    stuck,
  };
}

export const SEVERITY_LABEL: Record<DelaySeverity, string> = {
  none: "On time", minor: "Minor Delay", moderate: "Moderate Delay", critical: "Critical Delay",
};

// ── Executive KPIs ───────────────────────────────────────────────────────────
export type Kpis = {
  total: number; pending: number; packed: number; inTransit: number;
  outForDelivery: number; deliveredToday: number; delayed: number;
  failed: number; returned: number; cancelled: number;
  awaitingShipment: number; courierHealth: number;
};

export function computeKpis(shipments: ShipRow[], orders: OrderRow[], delayById: Map<string, DelayInfo>, now = Date.now()): Kpis {
  const today = new Date(now);
  const shippedOrderIds = new Set(shipments.map((s) => s.order_id));
  const c = (st: string) => shipments.filter((s) => s.status === st).length;
  const delivered = shipments.filter((s) => s.status === "delivered");
  const deliveredToday = delivered.filter((s) => {
    const d = s.delivered_at ? new Date(s.delivered_at) : null;
    return d && isSameDay(d, today);
  }).length;
  const delayed = shipments.filter((s) => delayById.get(s.id)?.delayed).length;
  // Courier health = on-time delivery + low failure/return, computed below
  const health = computeHealthScore(shipments, delayById).score;
  return {
    total: shipments.length,
    pending: c("pending"),
    packed: c("packed"),
    inTransit: c("in_transit") + c("shipped"),
    outForDelivery: c("out_for_delivery"),
    deliveredToday,
    delayed,
    failed: c("failed_delivery"),
    returned: c("returned"),
    cancelled: c("cancelled"),
    awaitingShipment: orders.filter((o) => !shippedOrderIds.has(o.id) && !["cancelled"].includes(o.status)).length,
    courierHealth: health,
  };
}

// ── Shipment health score (0-100) ────────────────────────────────────────────
export type HealthTier = "excellent" | "good" | "attention" | "critical";
export function computeHealthScore(shipments: ShipRow[], delayById: Map<string, DelayInfo>): { score: number; tier: HealthTier } {
  const finished = shipments.filter((s) => ["delivered", "returned", "failed_delivery", "cancelled"].includes(s.status));
  const active = shipments.filter((s) => !["delivered", "cancelled"].includes(s.status));
  if (shipments.length === 0) return { score: 100, tier: "excellent" };

  const delivered = shipments.filter((s) => s.status === "delivered").length;
  const failed = shipments.filter((s) => s.status === "failed_delivery").length;
  const returned = shipments.filter((s) => s.status === "returned").length;
  const stuck = shipments.filter((s) => delayById.get(s.id)?.stuck).length;
  const delayed = shipments.filter((s) => delayById.get(s.id)?.delayed).length;

  const successRate = finished.length ? delivered / finished.length : 1;
  const failRate = finished.length ? failed / finished.length : 0;
  const returnRate = finished.length ? returned / finished.length : 0;
  const stuckRate = active.length ? stuck / active.length : 0;
  const delayRate = active.length ? delayed / active.length : 0;

  // Weighted: delivery speed/success 40, failure 20, returns 15, reliability 15, stuck 10
  let score = 100;
  score -= (1 - successRate) * 40;
  score -= failRate * 20;
  score -= returnRate * 15;
  score -= delayRate * 15;
  score -= stuckRate * 10;
  score = Math.max(0, Math.round(score));
  const tier: HealthTier = score >= 90 ? "excellent" : score >= 75 ? "good" : score >= 50 ? "attention" : "critical";
  return { score, tier };
}

export const HEALTH_LABEL: Record<HealthTier, string> = {
  excellent: "Excellent", good: "Good", attention: "Needs Attention", critical: "Critical",
};

// ── Courier performance ──────────────────────────────────────────────────────
export type CourierPerf = {
  key: CourierKey | "unknown";
  label: string;
  volume: number;
  delivered: number;
  avgDeliveryDays: number | null;
  successRate: number;
  returnRate: number;
  failureRate: number;
  delayRate: number;
};

export function computeCourierPerf(shipments: ShipRow[], delayById: Map<string, DelayInfo>): CourierPerf[] {
  const groups = new Map<string, ShipRow[]>();
  for (const s of shipments) {
    const spec = detectCourier(s.carrier);
    const key = spec?.key ?? "unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  const out: CourierPerf[] = [];
  for (const [key, rows] of groups) {
    const label = COURIERS.find((c) => c.key === key)?.label ?? "Unassigned";
    const finished = rows.filter((s) => ["delivered", "returned", "failed_delivery"].includes(s.status));
    const delivered = rows.filter((s) => s.status === "delivered");
    const days = delivered
      .map((s) => {
        const start = s.shipped_at ? new Date(s.shipped_at).getTime() : new Date(s.created_at).getTime();
        const end = s.delivered_at ? new Date(s.delivered_at).getTime() : null;
        return end ? (end - start) / DAY : null;
      })
      .filter((d): d is number => d != null && d >= 0);
    const active = rows.filter((s) => !["delivered", "cancelled"].includes(s.status));
    out.push({
      key: key as CourierKey | "unknown",
      label,
      volume: rows.length,
      delivered: delivered.length,
      avgDeliveryDays: days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null,
      successRate: finished.length ? delivered.length / finished.length : 0,
      returnRate: finished.length ? rows.filter((s) => s.status === "returned").length / finished.length : 0,
      failureRate: finished.length ? rows.filter((s) => s.status === "failed_delivery").length / finished.length : 0,
      delayRate: active.length ? active.filter((s) => delayById.get(s.id)?.delayed).length / active.length : 0,
    });
  }
  return out.sort((a, b) => b.successRate - a.successRate || b.volume - a.volume);
}

// ── Operational queues ───────────────────────────────────────────────────────
export type QueueKey =
  | "all" | "pending" | "needs_tracking" | "packed" | "in_transit"
  | "out_for_delivery" | "delivered" | "delayed" | "failed_delivery"
  | "returned" | "cancelled" | "stuck" | "rto";

export const QUEUE_LABEL: Record<QueueKey, string> = {
  all: "All", pending: "Pending", needs_tracking: "Needs Tracking #", packed: "Packed",
  in_transit: "In Transit", out_for_delivery: "Out for Delivery", delivered: "Delivered",
  delayed: "Delayed", failed_delivery: "Failed Delivery", returned: "Returned",
  cancelled: "Cancelled", stuck: "Stuck", rto: "RTO Queue",
};

export function matchQueue(queue: QueueKey, s: ShipRow, delay: DelayInfo): boolean {
  switch (queue) {
    case "all": return true;
    case "needs_tracking": return !["cancelled", "returned"].includes(s.status) && !s.tracking_number;
    case "in_transit": return s.status === "in_transit" || s.status === "shipped";
    case "delayed": return delay.delayed;
    case "stuck": return delay.stuck;
    case "rto": return s.status === "returned" || (s.status === "failed_delivery");
    default: return s.status === queue;
  }
}
