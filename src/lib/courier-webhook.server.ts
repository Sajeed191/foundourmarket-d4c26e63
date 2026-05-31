// Server-only courier webhook processor.
// Verifies signatures, enforces idempotency/replay protection, writes audit
// rows, and turns verified courier scans into real shipment_events + status
// updates + customer notifications. NEVER imported by client code.

import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  detectCourier,
  normalizeStatus,
  STATUS_LABEL,
  type UnifiedStatus,
  type CourierKey,
} from "./courier-sync.service";

const REPLAY_WINDOW_MS = 5 * 60 * 1000;

/** Per-courier webhook secret, falling back to a shared secret. */
function courierSecret(courier: string): string | null {
  const key = courier.toUpperCase();
  return (
    process.env[`COURIER_WEBHOOK_SECRET_${key}`] ??
    process.env.COURIER_WEBHOOK_SECRET ??
    null
  );
}

/** Constant-time HMAC-SHA256 hex comparison. Fails closed. */
export function verifyCourierSignature(courier: string, rawBody: string, signature: string | null): boolean {
  const secret = courierSecret(courier);
  if (!secret) return false; // no secret configured => reject
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const sig = signature.replace(/^sha256=/i, "").trim();
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Reject stale/replayed deliveries when a timestamp header is present. */
export function isReplay(timestampHeader: string | null): boolean {
  if (!timestampHeader) return false; // optional; idempotency still protects us
  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts)) return false;
  const ms = ts < 1e12 ? ts * 1000 : ts; // seconds or ms
  return Math.abs(Date.now() - ms) > REPLAY_WINDOW_MS;
}

type NormalizedScan = {
  trackingNumber: string | null;
  eventId: string | null;
  statusCode: string | null;
  statusText: string | null;
  location: string | null;
  occurredAt: string | null;
  estimatedDelivery: string | null;
};

/** Best-effort extraction of a normalized scan from varied courier payloads. */
export function parseScan(payload: unknown): NormalizedScan {
  const p = (payload ?? {}) as Record<string, any>;
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = k.split(".").reduce<any>((o, kk) => (o == null ? o : o[kk]), p);
      if (v != null && v !== "") return String(v);
    }
    return null;
  };
  return {
    trackingNumber: pick("tracking_number", "awb", "waybill", "trackingNo", "shipment.awb", "data.awb"),
    eventId: pick("event_id", "id", "scan_id", "eventId", "data.scan_id"),
    statusCode: pick("status_code", "status", "scan_code", "ScanCode", "data.status"),
    statusText: pick("status_text", "description", "scan_detail", "remark", "Instructions", "data.activity"),
    location: pick("location", "scan_location", "city", "ScannedLocation", "data.location"),
    occurredAt: pick("occurred_at", "timestamp", "scan_date", "ScanDateTime", "StatusDateTime"),
    estimatedDelivery: pick("estimated_delivery", "edd", "expected_date", "ExpectedDeliveryDate"),
  };
}

const ORDER_FULFILLMENT: Record<UnifiedStatus, string> = {
  pending: "unfulfilled", packed: "processing", shipped: "shipped",
  in_transit: "shipped", out_for_delivery: "shipped", delivered: "delivered",
  failed_delivery: "shipped", returned: "returned", cancelled: "cancelled",
};

const NOTIFY: Partial<Record<UnifiedStatus, { title: string; body: string; priority: "high" | "normal" }>> = {
  shipped: { title: "🚚 Order shipped", body: "Your order has been shipped.", priority: "normal" },
  in_transit: { title: "🚚 In transit", body: "Your order is in transit.", priority: "normal" },
  out_for_delivery: { title: "📍 Out for delivery", body: "Your package is out for delivery.", priority: "high" },
  delivered: { title: "✅ Delivered", body: "Your package has been delivered.", priority: "high" },
  failed_delivery: { title: "⚠️ Delivery failed", body: "A delivery attempt failed. We'll retry shortly.", priority: "high" },
  returned: { title: "↩️ Order returned", body: "Your order has been returned to origin.", priority: "normal" },
};

export type ProcessResult =
  | { ok: true; outcome: "processed" | "duplicate" | "ignored"; status?: UnifiedStatus | null }
  | { ok: false; reason: string };

/**
 * Process a verified courier scan: idempotent shipment_event creation, shipment
 * status/timestamp update, order mirror, and automatic customer notification.
 */
export async function processCourierScan(courier: CourierKey, scan: NormalizedScan): Promise<ProcessResult> {
  if (!scan.trackingNumber) return { ok: false, reason: "missing_tracking_number" };

  // Locate the shipment by tracking number (the link to a real order).
  const { data: shipment } = await supabaseAdmin
    .from("shipments")
    .select("id, order_id, user_id, status, packed_at, shipped_at, delivered_at")
    .eq("tracking_number", scan.trackingNumber)
    .maybeSingle();

  if (!shipment) return { ok: false, reason: "shipment_not_found" };

  const status = normalizeStatus(courier, scan.statusCode, scan.statusText);
  const occurredAt = scan.occurredAt ? new Date(scan.occurredAt) : new Date();
  const occurredIso = isNaN(occurredAt.getTime()) ? new Date().toISOString() : occurredAt.toISOString();
  const externalId = scan.eventId ?? `${courier}:${scan.statusCode ?? status ?? "scan"}:${occurredIso}`;

  // Idempotent event insert — duplicate external ids are silently skipped by the
  // unique index (shipment_id, external_event_id).
  const { error: evErr } = await supabaseAdmin.from("shipment_events").insert({
    shipment_id: shipment.id,
    status: status ?? shipment.status,
    description: scan.statusText ?? (status ? `Status: ${STATUS_LABEL[status]}` : "Courier update"),
    location: scan.location,
    occurred_at: occurredIso,
    source: "courier_webhook",
    courier,
    external_event_id: externalId,
    raw: scan as never,
  });

  if (evErr) {
    if ((evErr as { code?: string }).code === "23505") {
      return { ok: true, outcome: "duplicate", status };
    }
    return { ok: false, reason: evErr.message };
  }

  await supabaseAdmin
    .from("shipments")
    .update({ last_courier_sync: new Date().toISOString() })
    .eq("id", shipment.id);

  if (!status) return { ok: true, outcome: "ignored", status: null };

  // Advance shipment status + timestamps from courier reality.
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status };
  if (status === "packed" && !shipment.packed_at) patch.packed_at = now;
  if ((status === "shipped" || status === "in_transit") && !shipment.shipped_at) patch.shipped_at = now;
  if (status === "delivered") { patch.delivered_at = now; patch.actual_delivery = occurredIso; }
  if (status === "returned") patch.returned_at = now;
  if (status === "cancelled") patch.cancelled_at = now;
  if (scan.estimatedDelivery) { patch.estimated_delivery = scan.estimatedDelivery; patch.eta_source = "courier"; }
  await supabaseAdmin.from("shipments").update(patch).eq("id", shipment.id);

  // Mirror onto the order so the customer order view reflects reality.
  const orderPatch: Record<string, unknown> = { fulfillment_status: ORDER_FULFILLMENT[status] };
  if (status === "delivered") orderPatch.status = "delivered";
  if (status === "cancelled") orderPatch.status = "cancelled";
  await supabaseAdmin.from("orders").update(orderPatch).eq("id", shipment.order_id);

  // Automatic customer notification (service role; no manual admin action).
  const copy = NOTIFY[status];
  if (copy && shipment.user_id) {
    await supabaseAdmin.from("notifications").insert({
      user_id: shipment.user_id,
      type: "shipment",
      title: copy.title,
      body: copy.body,
      link: "/track",
      priority: copy.priority,
      data: { order_id: shipment.order_id, status, source: "courier_webhook", courier },
    });
  }

  return { ok: true, outcome: "processed", status };
}

export { detectCourier };
