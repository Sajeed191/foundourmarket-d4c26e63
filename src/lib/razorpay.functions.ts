import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  USD_TO_INR,
  getRazorpayCreds,
  rzpFetch,
  verifyPaymentSignature,
} from "./razorpay.server";
import { enqueueOrderEmail } from "./order-emails.server";

const lineItemSchema = z.object({
  slug: z.string().min(1).max(200),
  qty: z.number().int().min(1).max(99),
});

const createSchema = z.object({
  items: z.array(lineItemSchema).min(1).max(100),
  addressId: z.string().uuid(),
  promoCode: z.string().trim().max(64).optional().nullable(),
});

const verifySchema = z.object({
  orderId: z.string().uuid(),
  razorpayOrderId: z.string().min(1).max(120),
  razorpayPaymentId: z.string().min(1).max(120),
  razorpaySignature: z.string().min(1).max(256),
});

/**
 * Resolve the authoritative market region for a user. Locked profile region
 * wins; otherwise we fall back to International. The client never supplies the
 * region used for billing — it is read from trusted server state.
 */
async function resolveRegion(supabase: any, userId: string): Promise<Region> {
  const { data } = await supabase
    .from("profiles")
    .select("market_region")
    .eq("id", userId)
    .maybeSingle();
  return data?.market_region === "india" ? "india" : "international";
}

/**
 * Re-price the cart entirely from trusted database values (anti-tampering).
 * Prices are read from the admin-configured region columns (price_inr for
 * India, price_usd for International) — NO hardcoded currency conversion.
 */
async function repriceFromDb(
  supabase: any,
  region: Region,
  items: { slug: string; qty: number }[],
  promoCode?: string | null,
) {
  const slugs = items.map((i) => i.slug);
  const { data: products, error } = await supabase
    .from("products")
    .select("slug,name,image,price_inr,price_usd")
    .in("slug", slugs);
  if (error) throw new Error("Could not load products.");

  const bySlug = new Map<string, any>((products ?? []).map((p: any) => [p.slug, p]));
  const lines = items.map((i) => {
    const p = bySlug.get(i.slug);
    if (!p) throw new Error(`Product unavailable: ${i.slug}`);
    const raw = region === "india" ? p.price_inr : p.price_usd;
    if (raw == null) {
      throw new Error(`Pricing unavailable for ${i.slug} in your region.`);
    }
    const unit = roundMoney(region, Number(raw));
    return {
      slug: i.slug,
      name: p.name as string,
      image: (p.image as string) ?? null,
      unit,
      qty: i.qty,
      lineTotal: roundMoney(region, unit * i.qty),
    };
  });

  const subtotal = roundMoney(region, lines.reduce((s, l) => s + l.lineTotal, 0));

  let discount = 0;
  let appliedPromo: string | null = null;
  if (promoCode) {
    const { data: promo } = await supabase
      .from("promo_codes")
      .select("code,kind,value,min_subtotal,max_uses,uses")
      .ilike("code", promoCode.toUpperCase())
      .maybeSingle();
    if (
      promo &&
      Number(promo.min_subtotal) <= subtotal &&
      (promo.max_uses == null || promo.uses < promo.max_uses)
    ) {
      discount =
        promo.kind === "percent"
          ? roundMoney(region, subtotal * (Number(promo.value) / 100))
          : Math.min(subtotal, Number(promo.value));
      appliedPromo = promo.code;
    }
  }

  const totals = computeOrderTotals(region, subtotal, discount);

  return { region, lines, appliedPromo, totals };
}

/**
 * Step 1 — create a pending order + a Razorpay order_id.
 * Prices are recomputed server-side; the client total is never trusted.
 */
export const createRazorpayOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { keyId } = getRazorpayCreds();

    const priced = await repriceFromDb(supabase, data.items, data.promoCode);
    if (priced.inr.totalINR < 1) {
      throw new Error("Order total must be at least ₹1.");
    }

    // Load shipping address (RLS guarantees ownership)
    const { data: addr, error: addrErr } = await supabase
      .from("addresses")
      .select("full_name,phone,line1,line2,city,state,postal,country")
      .eq("id", data.addressId)
      .maybeSingle();
    if (addrErr || !addr) throw new Error("Shipping address not found.");

    // Create the pending order first (status pending, INR).
    // Use the admin client so order writes go only through this trusted,
    // server-priced path (direct user inserts are blocked by RLS).
    const { data: order, error: oErr } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: userId,
        status: "pending",
        currency: "INR",
        subtotal: priced.inr.subtotalINR,
        shipping: priced.inr.shippingINR,
        tax: priced.inr.taxINR,
        discount: priced.inr.discountINR,
        promo_code: priced.appliedPromo,
        total: priced.inr.totalINR,
        shipping_address: addr,
        payment_method: "razorpay",
        payment_status: "pending",
      })
      .select("id")
      .single();
    if (oErr || !order) throw new Error("Could not create order.");

    // Snapshot line items (INR) so fulfillment + admin have full detail.
    const orderItems = priced.lines.map((l) => {
      const unitInr = Math.round(l.unitUsd * USD_TO_INR);
      return {
        order_id: order.id,
        product_slug: l.slug,
        name: l.name,
        image: l.image,
        unit_price: unitInr,
        quantity: l.qty,
        line_total: unitInr * l.qty,
      };
    });
    const { error: oiErr } = await supabaseAdmin.from("order_items").insert(orderItems);
    if (oiErr) {
      await supabaseAdmin
        .from("orders")
        .update({ status: "payment_failed", payment_status: "failed" })
        .eq("id", order.id);
      throw new Error("Could not record order items.");
    }

    // Atomically reserve stock (row-locked, anti-oversell). 15 min TTL.
    const { error: reserveErr } = await supabaseAdmin.rpc("reserve_order_stock", {
      _order_id: order.id,
      _ttl_minutes: 15,
    });
    if (reserveErr) {
      await supabaseAdmin
        .from("orders")
        .update({ status: "payment_failed", payment_status: "failed" })
        .eq("id", order.id);
      throw new Error(
        /insufficient stock/i.test(reserveErr.message)
          ? "Some items just went out of stock. Please review your cart."
          : "Could not reserve inventory for this order.",
      );
    }

    // Create the Razorpay order (amount in paise)
    let rzpOrder;
    try {
      rzpOrder = await rzpFetch<{ id: string; amount: number; currency: string }>(
        "/orders",
        {
          method: "POST",
          body: {
            amount: priced.inr.totalINR * 100,
            currency: "INR",
            receipt: order.id,
            notes: { db_order_id: order.id, user_id: userId },
          },
        },
      );
    } catch (e: any) {
      // Roll the pending order into a failed state and give the reserved stock back
      await supabaseAdmin.rpc("release_order_stock", { _order_id: order.id, _reason: "gateway_error" });
      await supabaseAdmin
        .from("orders")
        .update({ status: "payment_failed", payment_status: "failed" })
        .eq("id", order.id);
      throw new Error(e?.message ?? "Could not initialise payment.");
    }

    // Persist the gateway order id
    await supabaseAdmin
      .from("orders")
      .update({ razorpay_order_id: rzpOrder.id })
      .eq("id", order.id);

    return {
      orderId: order.id,
      razorpayOrderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      keyId,
      totals: priced.inr,
    };
  });

/**
 * Step 2 — verify the checkout signature server-side and mark the order paid.
 * The order is only marked paid after a valid signature. Idempotent.
 */
export const verifyRazorpayPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => verifySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };

    // Fetch the order via admin and confirm ownership
    const { data: order, error: oErr } = await supabaseAdmin
      .from("orders")
      .select("id,user_id,total,currency,razorpay_order_id,payment_status")
      .eq("id", data.orderId)
      .maybeSingle();
    if (oErr || !order) throw new Error("Order not found.");
    if (order.user_id !== userId) throw new Error("Not authorised for this order.");
    if (order.razorpay_order_id !== data.razorpayOrderId) {
      throw new Error("Order mismatch.");
    }

    // Idempotency: already paid → succeed without duplicating
    if (order.payment_status === "succeeded") {
      return { ok: true, orderId: order.id, alreadyPaid: true };
    }

    const valid = verifyPaymentSignature(
      data.razorpayOrderId,
      data.razorpayPaymentId,
      data.razorpaySignature,
    );

    if (!valid) {
      await supabaseAdmin.rpc("release_order_stock", {
        _order_id: order.id,
        _reason: "signature_failed",
      });
      await supabaseAdmin
        .from("orders")
        .update({ status: "payment_failed", payment_status: "failed" })
        .eq("id", order.id);
      await supabaseAdmin.from("payments").insert({
        order_id: order.id,
        user_id: userId,
        method: "razorpay",
        status: "failed",
        amount: Number(order.total),
        currency: order.currency,
        transaction_id: data.razorpayPaymentId,
        razorpay_order_id: data.razorpayOrderId,
        razorpay_payment_id: data.razorpayPaymentId,
        signature: data.razorpaySignature,
        demo: false,
        meta: { reason: "signature_verification_failed" },
      });
      throw new Error("Payment verification failed.");
    }

    // Commit reserved stock permanently, then mark the order paid.
    await supabaseAdmin.rpc("commit_order_stock", { _order_id: order.id });
    await supabaseAdmin
      .from("orders")
      .update({
        status: "paid",
        payment_status: "succeeded",
        razorpay_payment_id: data.razorpayPaymentId,
      })
      .eq("id", order.id);



    // Record the payment (idempotent on razorpay_payment_id)
    const { data: existingPay } = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("razorpay_payment_id", data.razorpayPaymentId)
      .maybeSingle();
    if (!existingPay) {
      await supabaseAdmin.from("payments").insert({
        order_id: order.id,
        user_id: userId,
        method: "razorpay",
        status: "succeeded",
        amount: Number(order.total),
        currency: order.currency,
        transaction_id: data.razorpayPaymentId,
        razorpay_order_id: data.razorpayOrderId,
        razorpay_payment_id: data.razorpayPaymentId,
        signature: data.razorpaySignature,
        demo: false,
        meta: { verified_via: "checkout_handshake" },
      });
    }

    // Real backend events → branded order emails (idempotent).
    await enqueueOrderEmail(order.id, "order-confirmed");
    await enqueueOrderEmail(order.id, "payment-verified");

    return { ok: true, orderId: order.id, alreadyPaid: false };
  });

const cancelSchema = z.object({ orderId: z.string().uuid() });

/**
 * Cancel a still-pending order (e.g. the user closed the checkout modal).
 * Releases reserved stock immediately. Idempotent; never touches paid orders.
 */
export const cancelRazorpayOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => cancelSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id,user_id,payment_status,stock_state")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order || order.user_id !== userId) return { ok: false };
    if (order.payment_status === "succeeded") return { ok: false };

    await supabaseAdmin.rpc("release_order_stock", {
      _order_id: order.id,
      _reason: "user_cancelled",
    });
    await supabaseAdmin
      .from("orders")
      .update({ status: "payment_failed", payment_status: "failed" })
      .eq("id", order.id)
      .eq("payment_status", "pending");
    return { ok: true };
  });


const codSchema = z.object({
  items: z.array(lineItemSchema).min(1).max(100),
  addressId: z.string().uuid(),
  promoCode: z.string().trim().max(64).optional().nullable(),
});

/**
 * Place a Cash-on-Delivery order. All money figures are recomputed from
 * trusted database prices server-side — the client never supplies totals,
 * unit prices, or line totals (anti price-tampering). Stock is reserved and
 * committed atomically.
 */
export const placeCodOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => codSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as {
      supabase: any;
      userId: string;
      claims?: { email?: string };
    };

    const priced = await repriceFromDb(supabase, data.items, data.promoCode);
    if (priced.inr.totalINR < 1) {
      throw new Error("Order total must be at least ₹1.");
    }

    // Load shipping address (RLS guarantees ownership of the row)
    const { data: addr, error: addrErr } = await supabase
      .from("addresses")
      .select("full_name,phone,line1,line2,city,state,postal,country")
      .eq("id", data.addressId)
      .maybeSingle();
    if (addrErr || !addr) throw new Error("Shipping address not found.");

    // Create the order with server-computed INR figures
    const { data: order, error: oErr } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: userId,
        status: "confirmed",
        currency: "INR",
        subtotal: priced.inr.subtotalINR,
        shipping: priced.inr.shippingINR,
        tax: priced.inr.taxINR,
        discount: priced.inr.discountINR,
        promo_code: priced.appliedPromo,
        total: priced.inr.totalINR,
        contact_email: claims?.email ?? null,
        shipping_address: addr,
        payment_method: "cod",
        payment_status: "pending",
      })
      .select("id")
      .single();
    if (oErr || !order) throw new Error("Could not create order.");

    // Snapshot line items with trusted, server-computed prices
    const orderItems = priced.lines.map((l) => {
      const unitInr = Math.round(l.unitUsd * USD_TO_INR);
      return {
        order_id: order.id,
        product_slug: l.slug,
        name: l.name,
        image: l.image,
        unit_price: unitInr,
        quantity: l.qty,
        line_total: unitInr * l.qty,
      };
    });
    const { error: oiErr } = await supabaseAdmin.from("order_items").insert(orderItems);
    if (oiErr) {
      await supabaseAdmin
        .from("orders")
        .update({ status: "payment_failed", payment_status: "failed" })
        .eq("id", order.id);
      throw new Error("Could not record order items.");
    }

    // Reserve then commit stock atomically (anti-oversell).
    const { error: reserveErr } = await supabaseAdmin.rpc("reserve_order_stock", {
      _order_id: order.id,
      _ttl_minutes: 15,
    });
    if (reserveErr) {
      await supabaseAdmin
        .from("orders")
        .update({ status: "payment_failed", payment_status: "failed" })
        .eq("id", order.id);
      throw new Error(
        /insufficient stock/i.test(reserveErr.message)
          ? "Some items just went out of stock. Please review your cart."
          : "Could not reserve inventory for this order.",
      );
    }
    await supabaseAdmin.rpc("commit_order_stock", { _order_id: order.id });

    return { ok: true, orderId: order.id, total: priced.inr.totalINR };
  });


const refundSchema = z.object({
  paymentId: z.string().uuid(),
  amount: z.number().positive().max(100_000_000).optional(),
  reason: z.string().trim().max(280).optional().nullable(),
});

/** Helper: ensure the caller is staff allowed to manage refunds. */
async function assertRefundStaff(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error("Could not verify permissions.");
  const roles = (data ?? []).map((r) => r.role);
  const allowed = ["admin", "super_admin", "manager"];
  if (!roles.some((r) => allowed.includes(r))) {
    throw new Error("You are not authorised to issue refunds.");
  }
}

/**
 * Admin — issue a real Razorpay refund against a captured payment.
 * Records a pending refund row; the refund.processed webhook finalises it.
 */
export const createRazorpayRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => refundSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertRefundStaff(userId);

    const { data: pay, error: pErr } = await supabaseAdmin
      .from("payments")
      .select("id,order_id,amount,currency,status,razorpay_payment_id")
      .eq("id", data.paymentId)
      .maybeSingle();
    if (pErr || !pay) throw new Error("Payment not found.");
    if (pay.status !== "succeeded") throw new Error("Only successful payments can be refunded.");
    if (!pay.razorpay_payment_id) throw new Error("This payment has no Razorpay reference.");

    // Guard against duplicate full refunds
    const { data: priorRefunds } = await supabaseAdmin
      .from("refunds")
      .select("amount,status")
      .eq("payment_id", pay.id);
    const refundedSoFar = (priorRefunds ?? [])
      .filter((r) => r.status !== "failed")
      .reduce((s, r) => s + Number(r.amount), 0);
    const maxRefundable = Number(pay.amount) - refundedSoFar;
    if (maxRefundable <= 0) throw new Error("This payment is already fully refunded.");

    const refundAmount = data.amount ? Math.min(data.amount, maxRefundable) : maxRefundable;

    let rzpRefund;
    try {
      rzpRefund = await rzpFetch<{ id: string; amount: number; currency: string; status: string }>(
        `/payments/${pay.razorpay_payment_id}/refund`,
        {
          method: "POST",
          body: {
            amount: Math.round(refundAmount * 100),
            notes: { reason: data.reason ?? "admin_initiated", order_id: pay.order_id },
          },
        },
      );
    } catch (e: any) {
      await supabaseAdmin.from("refunds").insert({
        order_id: pay.order_id,
        payment_id: pay.id,
        razorpay_payment_id: pay.razorpay_payment_id,
        amount: refundAmount,
        currency: pay.currency,
        reason: data.reason ?? null,
        status: "failed",
        notes: { error: String(e?.message ?? e) },
      });
      throw new Error(e?.message ?? "Refund request failed at the gateway.");
    }

    const { data: refundRow } = await supabaseAdmin
      .from("refunds")
      .insert({
        order_id: pay.order_id,
        payment_id: pay.id,
        razorpay_refund_id: rzpRefund.id,
        razorpay_payment_id: pay.razorpay_payment_id,
        amount: (rzpRefund.amount ?? Math.round(refundAmount * 100)) / 100,
        currency: rzpRefund.currency ?? pay.currency,
        reason: data.reason ?? null,
        status: rzpRefund.status === "processed" ? "processed" : "pending",
        notes: { source: "admin_initiated" },
      })
      .select("id,status,amount")
      .single();

    // Mark order refunded when fully refunded
    if (refundAmount >= maxRefundable) {
      await supabaseAdmin
        .from("orders")
        .update({ status: "refunded", payment_status: "refunded" })
        .eq("id", pay.order_id);
    }

    return { ok: true, refund: refundRow };
  });

