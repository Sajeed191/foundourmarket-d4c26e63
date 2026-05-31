import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getRazorpayCreds,
  rzpFetch,
  verifyPaymentSignature,
  fetchRazorpayDiagnostics,
} from "./razorpay.server";
import {
  type Region,
  computeOrderTotals,
  roundMoney,
  toMinorUnits,
} from "./pricing";
import { enqueueOrderEmail } from "./order-emails.server";

const lineItemSchema = z.object({
  slug: z.string().min(1).max(200),
  qty: z.number().int().min(1).max(99),
});

const attributionSchema = z
  .object({
    session_id: z.string().max(120).optional().nullable(),
    utm: z.record(z.string().max(200)).optional().nullable(),
  })
  .optional()
  .nullable();

const createSchema = z.object({
  items: z.array(lineItemSchema).min(1).max(100),
  addressId: z.string().uuid(),
  promoCode: z.string().trim().max(64).optional().nullable(),
  attribution: attributionSchema,
});

const verifySchema = z.object({
  orderId: z.string().uuid(),
  razorpayOrderId: z.string().min(1).max(120),
  razorpayPaymentId: z.string().min(1).max(120),
  razorpaySignature: z.string().min(1).max(256),
});

/** Read the edge geo country from trusted request headers (server-only). */
function edgeCountry(): string | null {
  const c = (
    getRequestHeader("cf-ipcountry") ||
    getRequestHeader("x-vercel-ip-country") ||
    getRequestHeader("x-country") ||
    ""
  ).toUpperCase();
  return c || null;
}

export type RegionResolution = {
  region: Region;
  detectedCountry: string | null;
  /** Where the billing region came from: trusted ranking. */
  pricingSource: "profile_locked" | "edge_geo" | "default";
  /** 0–100 confidence in the resolved region. */
  confidence: number;
};

/**
 * Resolve the authoritative market region for billing.
 *
 * Priority:
 *   1. The user's locked profile region (highest trust).
 *   2. Edge geo-IP country header — IN ⇒ India (prevents Indian users from
 *      ever being charged in USD just because they never explicitly locked).
 *   3. International as the final safe default.
 *
 * The client never supplies the region used for billing.
 */
async function resolveRegion(
  supabase: any,
  userId: string,
): Promise<RegionResolution> {
  const { data } = await supabase
    .from("profiles")
    .select("market_region")
    .eq("id", userId)
    .maybeSingle();

  const country = edgeCountry();

  if (data?.market_region === "india" || data?.market_region === "international") {
    return {
      region: data.market_region,
      detectedCountry: country,
      pricingSource: "profile_locked",
      confidence: 100,
    };
  }

  // No locked region yet → trust the edge geo signal so Indian shoppers are
  // billed in INR even when they were never prompted to lock a region.
  if (country === "IN") {
    return { region: "india", detectedCountry: country, pricingSource: "edge_geo", confidence: 85 };
  }
  if (country) {
    return { region: "international", detectedCountry: country, pricingSource: "edge_geo", confidence: 85 };
  }

  return { region: "international", detectedCountry: null, pricingSource: "default", confidence: 40 };
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
  // Trusted server-side read via admin client (base products table is staff-only RLS).
  const { data: products, error } = await supabaseAdmin
    .from("products")
    .select("slug,name,image,price_inr,price_usd,shipping_fee_inr,shipping_fee_usd")
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
    const shipFeeRaw = region === "india" ? p.shipping_fee_inr : p.shipping_fee_usd;
    const shipFee = Math.max(0, Number(shipFeeRaw ?? 0));
    return {
      slug: i.slug,
      name: p.name as string,
      image: (p.image as string) ?? null,
      unit,
      qty: i.qty,
      lineTotal: roundMoney(region, unit * i.qty),
      shipFee,
    };
  });

  const subtotal = roundMoney(region, lines.reduce((s, l) => s + l.lineTotal, 0));
  // Admin-defined per-product shipping (fee × qty), summed across the cart.
  const shippingTotal = roundMoney(
    region,
    lines.reduce((s, l) => s + l.shipFee * l.qty, 0),
  );

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

  const totals = computeOrderTotals(region, subtotal, discount, shippingTotal);

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
    const { supabase, userId, claims } = context as {
      supabase: any;
      userId: string;
      claims?: { email?: string };
    };
    const { keyId } = getRazorpayCreds();

    const resolution = await resolveRegion(supabase, userId);
    const region = resolution.region;
    const priced = await repriceFromDb(supabase, region, data.items, data.promoCode);

    // Region/pricing audit trail (visible in server function logs).
    console.log("[razorpay.createOrder] region resolved", {
      user_id: userId,
      detected_country: resolution.detectedCountry,
      detected_market: region,
      confidence_score: resolution.confidence,
      currency_selected: priced.totals.currency,
      pricing_source: resolution.pricingSource,
      amount_minor: toMinorUnits(priced.totals.total),
    });
    if (priced.totals.total < 1) {
      throw new Error("Order total is too low to process.");
    }

    // Load shipping address (RLS guarantees ownership)
    const { data: addr, error: addrErr } = await supabase
      .from("addresses")
      .select("full_name,phone,line1,line2,city,state,postal,country")
      .eq("id", data.addressId)
      .maybeSingle();
    if (addrErr || !addr) throw new Error("Shipping address not found.");

    // Create the pending order first (status pending) in the region's currency.
    // Use the admin client so order writes go only through this trusted,
    // server-priced path (direct user inserts are blocked by RLS).
    const { data: order, error: oErr } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: userId,
        status: "pending",
        currency: priced.totals.currency,
        subtotal: priced.totals.subtotal,
        shipping: priced.totals.shipping,
        tax: priced.totals.tax,
        discount: priced.totals.discount,
        promo_code: priced.appliedPromo,
        total: priced.totals.total,
        shipping_address: addr,
        payment_method: "razorpay",
        payment_status: "pending",
        attribution_session_id: data.attribution?.session_id ?? null,
        attribution_utm: (data.attribution?.utm ?? {}) as never,
      })
      .select("id")
      .single();
    if (oErr || !order) throw new Error("Could not create order.");

    // Snapshot line items in the region's native currency for fulfilment + admin.
    const orderItems = priced.lines.map((l) => ({
      order_id: order.id,
      product_slug: l.slug,
      name: l.name,
      image: l.image,
      unit_price: l.unit,
      quantity: l.qty,
      line_total: l.lineTotal,
    }));
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

    // Create the Razorpay order (amount in the smallest currency unit).
    let rzpOrder;
    try {
      rzpOrder = await rzpFetch<{ id: string; amount: number; currency: string }>(
        "/orders",
        {
          method: "POST",
          body: {
            amount: toMinorUnits(priced.totals.total),
            currency: priced.totals.currency,
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
      totals: priced.totals,
      debug: {
        detectedCountry: resolution.detectedCountry,
        market: region,
        currency: priced.totals.currency,
        pricingSource: resolution.pricingSource,
        confidence: resolution.confidence,
        amountMinor: rzpOrder.amount,
      },
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

    // Fetch the real payment entity so we can record the exact method used
    // (upi / card / netbanking / wallet / emi / paylater) for health analytics.
    let rzpMethod: string | null = null;
    let rzpMethodMeta: Record<string, unknown> = {};
    try {
      const pay = await rzpFetch<any>(`/payments/${data.razorpayPaymentId}`);
      rzpMethod = pay?.method ?? null;
      rzpMethodMeta = {
        rzp_method: pay?.method ?? null,
        rzp_bank: pay?.bank ?? null,
        rzp_wallet: pay?.wallet ?? null,
        rzp_vpa: pay?.vpa ?? null,
        rzp_card_network: pay?.card?.network ?? null,
        rzp_card_type: pay?.card?.type ?? null,
      };
    } catch {
      /* method enrichment is best-effort */
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
        method: rzpMethod ?? "razorpay",
        status: "succeeded",
        amount: Number(order.total),
        currency: order.currency,
        transaction_id: data.razorpayPaymentId,
        razorpay_order_id: data.razorpayOrderId,
        razorpay_payment_id: data.razorpayPaymentId,
        signature: data.razorpaySignature,
        demo: false,
        meta: { verified_via: "checkout_handshake", ...rzpMethodMeta },
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
  attribution: attributionSchema,
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

    const codResolution = await resolveRegion(supabase, userId);
    const region = codResolution.region;
    console.log("[razorpay.placeCod] region resolved", {
      user_id: userId,
      detected_country: codResolution.detectedCountry,
      detected_market: region,
      confidence_score: codResolution.confidence,
      pricing_source: codResolution.pricingSource,
    });
    const priced = await repriceFromDb(supabase, region, data.items, data.promoCode);
    if (priced.totals.total < 1) {
      throw new Error("Order total is too low to process.");
    }

    // Load shipping address (RLS guarantees ownership of the row)
    const { data: addr, error: addrErr } = await supabase
      .from("addresses")
      .select("full_name,phone,line1,line2,city,state,postal,country")
      .eq("id", data.addressId)
      .maybeSingle();
    if (addrErr || !addr) throw new Error("Shipping address not found.");

    // Create the order with server-computed, region-native figures
    const { data: order, error: oErr } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: userId,
        status: "confirmed",
        currency: priced.totals.currency,
        subtotal: priced.totals.subtotal,
        shipping: priced.totals.shipping,
        tax: priced.totals.tax,
        discount: priced.totals.discount,
        promo_code: priced.appliedPromo,
        total: priced.totals.total,
        contact_email: claims?.email ?? null,
        shipping_address: addr,
        payment_method: "cod",
        payment_status: "pending",
        attribution_session_id: data.attribution?.session_id ?? null,
        attribution_utm: (data.attribution?.utm ?? {}) as never,
      })
      .select("id")
      .single();
    if (oErr || !order) throw new Error("Could not create order.");

    // Snapshot line items with trusted, server-computed region-native prices
    const orderItems = priced.lines.map((l) => ({
      order_id: order.id,
      product_slug: l.slug,
      name: l.name,
      image: l.image,
      unit_price: l.unit,
      quantity: l.qty,
      line_total: l.lineTotal,
    }));
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

    return { ok: true, orderId: order.id, total: priced.totals.total };
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


/* ===========================================================================
 * Admin payment diagnostics + health analytics
 * ======================================================================== */

const PAYMENT_STAFF_ROLES = ["admin", "super_admin", "manager", "support"];

async function assertPaymentStaff(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error("Could not verify permissions.");
  const roles = (data ?? []).map((r) => r.role as string);
  if (!roles.some((r) => PAYMENT_STAFF_ROLES.includes(r))) {
    throw new Error("You are not authorised to view payment diagnostics.");
  }
}

/** Admin — Razorpay account mode + the methods customers will actually see. */
export const getRazorpayDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    await assertPaymentStaff(userId);
    return fetchRazorpayDiagnostics();
  });

/** Normalise a stored payment row's method into a coarse bucket. */
function methodBucket(method: string | null, meta: any): string {
  const m = (meta?.rzp_method ?? method ?? "").toString().toLowerCase();
  if (m.includes("upi")) return "upi";
  if (m.includes("netbanking")) return "netbanking";
  if (m.includes("wallet")) return "wallet";
  if (m.includes("emi")) return "emi";
  if (m.includes("paylater")) return "paylater";
  if (m.includes("card")) return "card";
  if (m === "razorpay" || m === "") return "unknown";
  return m;
}

/** Admin — aggregate payment health KPIs + the last 20 attempts. */
export const getPaymentHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    await assertPaymentStaff(userId);

    const { data: rows, error } = await supabaseAdmin
      .from("payments")
      .select(
        "id,order_id,method,status,amount,currency,razorpay_payment_id,demo,meta,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error("Could not load payments.");

    const all = rows ?? [];
    const succeeded = all.filter((r) => r.status === "succeeded");
    const failed = all.filter((r) => r.status === "failed");
    const total = succeeded.length + failed.length;

    const revenueByMethod: Record<string, number> = {};
    const countByMethod: Record<string, number> = {};
    let revenue = 0;
    for (const r of succeeded) {
      const b = methodBucket(r.method, r.meta);
      const amt = Number(r.amount) || 0;
      revenueByMethod[b] = (revenueByMethod[b] ?? 0) + amt;
      countByMethod[b] = (countByMethod[b] ?? 0) + 1;
      revenue += amt;
    }

    const pct = (n: number) =>
      succeeded.length ? Math.round((n / succeeded.length) * 1000) / 10 : 0;

    return {
      totals: {
        attempts: total,
        succeeded: succeeded.length,
        failed: failed.length,
        successRate: total ? Math.round((succeeded.length / total) * 1000) / 10 : 0,
        failureRate: total ? Math.round((failed.length / total) * 1000) / 10 : 0,
        revenue,
        avgOrderValue: succeeded.length
          ? Math.round((revenue / succeeded.length) * 100) / 100
          : 0,
      },
      usage: {
        upi: pct(countByMethod.upi ?? 0),
        card: pct(countByMethod.card ?? 0),
        netbanking: pct(countByMethod.netbanking ?? 0),
        wallet: pct(countByMethod.wallet ?? 0),
        emi: pct(countByMethod.emi ?? 0),
        paylater: pct(countByMethod.paylater ?? 0),
      },
      revenueByMethod,
      countByMethod,
      recent: all.slice(0, 20).map((r) => ({
        id: r.id,
        orderId: r.order_id,
        method: methodBucket(r.method, r.meta),
        rawMethod: (r.meta as any)?.rzp_method ?? r.method,
        status: r.status,
        amount: Number(r.amount) || 0,
        currency: r.currency,
        demo: !!r.demo,
        createdAt: r.created_at,
      })),
    };
  });
