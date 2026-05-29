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

/** Re-price the cart entirely from trusted database values (anti-tampering). */
async function repriceFromDb(
  supabase: any,
  items: { slug: string; qty: number }[],
  promoCode?: string | null,
) {
  const slugs = items.map((i) => i.slug);
  const { data: products, error } = await supabase
    .from("products")
    .select("slug,name,image,price")
    .in("slug", slugs);
  if (error) throw new Error("Could not load products.");

  const bySlug = new Map<string, any>((products ?? []).map((p: any) => [p.slug, p]));
  const lines = items.map((i) => {
    const p = bySlug.get(i.slug);
    if (!p) throw new Error(`Product unavailable: ${i.slug}`);
    const unitUsd = Number(p.price);
    return {
      slug: i.slug,
      name: p.name as string,
      image: (p.image as string) ?? null,
      unitUsd,
      qty: i.qty,
      lineUsd: +(unitUsd * i.qty).toFixed(2),
    };
  });


  const subtotalUSD = +lines.reduce((s, l) => s + l.lineUsd, 0).toFixed(2);
  const shippingUSD = subtotalUSD > 50 ? 0 : 9.99;
  const taxUSD = +(subtotalUSD * 0.08).toFixed(2);

  let discountUSD = 0;
  let appliedPromo: string | null = null;
  if (promoCode) {
    const { data: promo } = await supabase
      .from("promo_codes")
      .select("code,kind,value,min_subtotal,max_uses,uses")
      .ilike("code", promoCode.toUpperCase())
      .maybeSingle();
    if (
      promo &&
      Number(promo.min_subtotal) <= subtotalUSD &&
      (promo.max_uses == null || promo.uses < promo.max_uses)
    ) {
      discountUSD =
        promo.kind === "percent"
          ? +(subtotalUSD * (Number(promo.value) / 100)).toFixed(2)
          : Math.min(subtotalUSD, Number(promo.value));
      appliedPromo = promo.code;
    }
  }

  const totalUSD = Math.max(0, +(subtotalUSD + shippingUSD + taxUSD - discountUSD).toFixed(2));

  // Convert to INR (whole rupees) for Razorpay
  const toInr = (usd: number) => Math.round(usd * USD_TO_INR);
  const subtotalINR = toInr(subtotalUSD);
  const shippingINR = toInr(shippingUSD);
  const taxINR = toInr(taxUSD);
  const discountINR = toInr(discountUSD);
  const totalINR = Math.max(0, subtotalINR + shippingINR + taxINR - discountINR);

  return {
    lines,
    appliedPromo,
    inr: { subtotalINR, shippingINR, taxINR, discountINR, totalINR },
  };
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

    // Create the pending order first (status pending, INR)
    const { data: order, error: oErr } = await supabase
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
      // Roll the pending order into a failed state so it doesn't dangle
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

    // Mark order paid
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

    return { ok: true, orderId: order.id, alreadyPaid: false };
  });
