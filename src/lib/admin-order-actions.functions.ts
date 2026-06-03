/**
 * Admin Action Center — staff-gated order mutation server functions.
 *
 * Every action re-verifies staff roles (requireStaff), executes via the
 * service-role admin client (bypasses RLS deliberately for trusted ops),
 * and writes a tamper-proof entry to security_audit_log. Refund decisions
 * are restricted to manager-tier roles; fulfilment actions allow warehouse
 * staff. No client privilege escalation is possible — the client never
 * decides authorization.
 *
 * Thin file: only createServerFn declarations + imports, so the
 * client.server import never leaks into client bundles.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff, logSecurity, type StaffRole } from "./admin-guard.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FULFILL_STAFF: StaffRole[] = [
  "admin", "super_admin", "manager", "fulfillment", "warehouse_staff",
];
const REFUND_STAFF: StaffRole[] = ["admin", "super_admin", "manager"];
const SUPPORT_STAFF: StaffRole[] = ["admin", "super_admin", "manager", "support"];

async function getOrder(orderId: string) {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("id, user_id, carrier, tracking_number, total, currency, contact_email, payment_status, payment_method")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Order not found");
  return data;
}

/**
 * Mirror of the DB `payment_allows_fulfillment` guard. Used to return a clean,
 * descriptive message to staff BEFORE the protective trigger raises. COD orders
 * are always allowed; otherwise payment must be paid/authorized/succeeded/cod.
 */
function paymentAllowsFulfillment(paymentStatus?: string | null, paymentMethod?: string | null): boolean {
  if ((paymentMethod ?? "").toLowerCase() === "cod") return true;
  return ["paid", "authorized", "succeeded", "cod"].includes((paymentStatus ?? "").toLowerCase());
}

const PAYMENT_BLOCK_MSG =
  "This order cannot be fulfilled because payment has not been completed.";

async function latestShipment(orderId: string) {
  const { data } = await supabaseAdmin
    .from("shipments")
    .select("id, carrier, tracking_number, tracking_url, status")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function addEvent(shipmentId: string, status: string, description: string, courier: string | null) {
  await supabaseAdmin.from("shipment_events").insert({
    shipment_id: shipmentId, status, description, source: "admin", courier,
  });
}

/* ----------------------- Fulfilment status actions ----------------------- */

export const markOrderStageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      orderId: z.string().uuid(),
      stage: z.enum(["packed", "shipped", "delivered", "processing", "cancelled"]),
    }).parse(input),
  )
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, FULFILL_STAFF, "ops.order.mark_stage", input.orderId);
    const order = await getOrder(input.orderId);
    const nowIso = new Date().toISOString();

    // Block fulfillment stages unless payment is valid (COD always allowed).
    if (input.stage !== "cancelled" && !paymentAllowsFulfillment(order.payment_status, order.payment_method)) {
      await logSecurity({
        actorId: userId, actorRole: primaryRole, action: "ops.order.mark_stage",
        target: input.orderId, success: false,
        detail: { stage: input.stage, reason: "payment_incomplete", paymentStatus: order.payment_status },
      });
      throw new Error(PAYMENT_BLOCK_MSG);
    }


    const orderPatch: Record<string, unknown> = { fulfillment_status: input.stage };
    if (input.stage === "shipped" || input.stage === "delivered" || input.stage === "cancelled") {
      orderPatch.status = input.stage;
    }
    const { error: oErr } = await supabaseAdmin.from("orders").update(orderPatch as never).eq("id", input.orderId);
    if (oErr) throw new Error(oErr.message);

    const ship = await latestShipment(input.orderId);
    if (ship && input.stage !== "processing") {
      const sPatch: Record<string, unknown> = { status: input.stage };
      if (input.stage === "packed") sPatch.packed_at = nowIso;
      if (input.stage === "shipped") sPatch.shipped_at = nowIso;
      if (input.stage === "delivered") { sPatch.delivered_at = nowIso; sPatch.actual_delivery = nowIso; }
      if (input.stage === "cancelled") sPatch.cancelled_at = nowIso;
      await supabaseAdmin.from("shipments").update(sPatch as never).eq("id", ship.id);
      await addEvent(ship.id, input.stage, `Order marked ${input.stage} by staff`, ship.carrier ?? order.carrier);
    }

    await logSecurity({
      actorId: userId, actorRole: primaryRole, action: "ops.order.mark_stage",
      target: input.orderId, success: true, detail: { stage: input.stage },
    });
    return { ok: true };
  });

/* ----------------------- Shipment create / tracking ---------------------- */

export const createShipmentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      orderId: z.string().uuid(),
      carrier: z.string().min(1).max(120),
      trackingNumber: z.string().max(120).optional(),
      trackingUrl: z.string().url().max(500).optional(),
      estimatedDelivery: z.string().max(40).optional(),
    }).parse(input),
  )
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, FULFILL_STAFF, "ops.shipment.create", input.orderId);
    const order = await getOrder(input.orderId);

    if (!paymentAllowsFulfillment(order.payment_status, order.payment_method)) {
      await logSecurity({
        actorId: userId, actorRole: primaryRole, action: "ops.shipment.create",
        target: input.orderId, success: false,
        detail: { reason: "payment_incomplete", paymentStatus: order.payment_status },
      });
      throw new Error(PAYMENT_BLOCK_MSG);
    }


    const { data: ship, error } = await supabaseAdmin.from("shipments").insert({
      order_id: input.orderId,
      user_id: order.user_id,
      carrier: input.carrier,
      tracking_number: input.trackingNumber ?? null,
      tracking_url: input.trackingUrl ?? null,
      estimated_delivery: input.estimatedDelivery || null,
      status: "processing",
    }).select("id").single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("orders").update({
      carrier: input.carrier,
      tracking_number: input.trackingNumber ?? null,
      fulfillment_status: "processing",
    }).eq("id", input.orderId);
    await addEvent(ship.id, "created", `Shipment created via ${input.carrier}`, input.carrier);

    await logSecurity({
      actorId: userId, actorRole: primaryRole, action: "ops.shipment.create",
      target: input.orderId, success: true, detail: { carrier: input.carrier },
    });
    return { ok: true, shipmentId: ship.id };
  });

export const updateTrackingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      orderId: z.string().uuid(),
      carrier: z.string().min(1).max(120),
      trackingNumber: z.string().max(120).optional(),
      trackingUrl: z.string().url().max(500).optional(),
    }).parse(input),
  )
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, FULFILL_STAFF, "ops.shipment.update_tracking", input.orderId);
    const order = await getOrder(input.orderId);
    let ship = await latestShipment(input.orderId);

    if (!ship) {
      const { data: created, error } = await supabaseAdmin.from("shipments").insert({
        order_id: input.orderId, user_id: order.user_id, carrier: input.carrier,
        tracking_number: input.trackingNumber ?? null, tracking_url: input.trackingUrl ?? null,
        status: "processing",
      }).select("id, carrier, tracking_number, tracking_url, status").single();
      if (error) throw new Error(error.message);
      ship = created;
    } else {
      await supabaseAdmin.from("shipments").update({
        carrier: input.carrier,
        tracking_number: input.trackingNumber ?? null,
        tracking_url: input.trackingUrl ?? null,
      }).eq("id", ship.id);
    }
    await supabaseAdmin.from("orders").update({
      carrier: input.carrier, tracking_number: input.trackingNumber ?? null,
    }).eq("id", input.orderId);
    await addEvent(ship.id, "tracking_updated", `Tracking updated · ${input.carrier}`, input.carrier);

    await logSecurity({
      actorId: userId, actorRole: primaryRole, action: "ops.shipment.update_tracking",
      target: input.orderId, success: true, detail: { carrier: input.carrier, tracking: input.trackingNumber ?? null },
    });
    return { ok: true };
  });

/* ----------------------------- Refund actions ---------------------------- */

export const resolveRefundFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      orderId: z.string().uuid(),
      refundId: z.string().uuid().optional(),
      decision: z.enum(["approved", "rejected"]),
      amount: z.number().min(0).max(10_000_000).optional(),
      reason: z.string().max(500).optional(),
    }).parse(input),
  )
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, REFUND_STAFF, "ops.refund.resolve", input.orderId);
    const status = input.decision === "approved" ? "approved" : "rejected";

    if (input.refundId) {
      const { error } = await supabaseAdmin.from("refunds")
        .update({ status, reason: input.reason ?? undefined })
        .eq("id", input.refundId).eq("order_id", input.orderId);
      if (error) throw new Error(error.message);
    } else {
      const order = await getOrder(input.orderId);
      const { error } = await supabaseAdmin.from("refunds").insert({
        order_id: input.orderId,
        amount: input.amount ?? Number(order.total ?? 0),
        currency: order.currency ?? "INR",
        status, reason: input.reason ?? null,
      });
      if (error) throw new Error(error.message);
    }

    await logSecurity({
      actorId: userId, actorRole: primaryRole, action: "ops.refund.resolve",
      target: input.orderId, success: true, detail: { decision: input.decision, refundId: input.refundId ?? null },
    });
    return { ok: true };
  });

/* ----------------- Notifications, retry link & support ticket ------------ */

export const sendOrderNotificationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      orderId: z.string().uuid(),
      title: z.string().min(1).max(160),
      body: z.string().max(1000).optional(),
      type: z.string().max(60).optional(),
      link: z.string().max(500).optional(),
    }).parse(input),
  )
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, SUPPORT_STAFF, "ops.order.notify", input.orderId);
    const order = await getOrder(input.orderId);
    if (!order.user_id) throw new Error("Order has no linked customer to notify.");

    const { error } = await supabaseAdmin.from("notifications").insert({
      user_id: order.user_id,
      type: input.type ?? "order_update",
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? `/account/orders`,
      priority: "normal",
      data: { order_id: input.orderId } as never,
    });
    if (error) throw new Error(error.message);

    await logSecurity({
      actorId: userId, actorRole: primaryRole, action: "ops.order.notify",
      target: input.orderId, success: true, detail: { title: input.title },
    });
    return { ok: true };
  });

export const sendRetryPaymentLinkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, SUPPORT_STAFF, "ops.order.retry_payment", input.orderId);
    const order = await getOrder(input.orderId);
    if (!order.user_id) throw new Error("Order has no linked customer.");

    const { error } = await supabaseAdmin.from("notifications").insert({
      user_id: order.user_id,
      type: "payment_retry",
      title: "Complete your payment",
      body: "Your order is waiting for payment. Tap to retry and confirm your purchase.",
      link: `/checkout?retry=${input.orderId}`,
      priority: "high",
      data: { order_id: input.orderId } as never,
    });
    if (error) throw new Error(error.message);

    await logSecurity({
      actorId: userId, actorRole: primaryRole, action: "ops.order.retry_payment",
      target: input.orderId, success: true,
    });
    return { ok: true };
  });

export const openOrderTicketFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      orderId: z.string().uuid(),
      subject: z.string().min(1).max(200),
      category: z.string().max(60).optional(),
      priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
    }).parse(input),
  )
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, SUPPORT_STAFF, "ops.order.open_ticket", input.orderId);
    const order = await getOrder(input.orderId);
    if (!order.user_id) throw new Error("Order has no linked customer.");

    const { data: ticket, error } = await supabaseAdmin.from("support_tickets").insert({
      user_id: order.user_id,
      order_id: input.orderId,
      subject: input.subject,
      category: input.category ?? "order",
      priority: input.priority ?? "normal",
      status: "open",
      assigned_to: userId,
    }).select("id").single();
    if (error) throw new Error(error.message);

    await logSecurity({
      actorId: userId, actorRole: primaryRole, action: "ops.order.open_ticket",
      target: input.orderId, success: true, detail: { subject: input.subject },
    });
    return { ok: true, ticketId: ticket.id };
  });
