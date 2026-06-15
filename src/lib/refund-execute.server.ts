// Server-only: the single canonical path that moves real money back to a
// customer through Razorpay AND informs them (email + in-app notification +
// activity timeline). Both the Payment Intel drawer (createRazorpayRefund) and
// the Order Action Center refund approval (resolveRefundFn) call this so every
// prepaid refund behaves identically.
//
// NEVER import from client code (uses the service-role admin client).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { rzpFetch } from "./razorpay.server";
import { enqueueOrderEmail } from "./order-emails.server";
import { notifyCustomer, fmOrderNo, paymentLink } from "./customer-notify.server";

type RefundRow = { id: string; status: string; amount: number };

export type ExecuteRefundOptions = {
  /** Refund a specific payment row (id). */
  paymentId?: string;
  /** …or resolve the order's latest successful payment automatically. */
  orderId?: string;
  /** Partial amount in major units. Omit for a full remaining refund. */
  amount?: number;
  reason?: string | null;
  /** Free-text label for the refund's source (audit only). */
  source: string;
  /** Who triggered it (staff user id) for the audit trail. */
  actorId?: string | null;
  /**
   * An already-created refund REQUEST row to finalise in place (e.g. a customer
   * return refund). Excluded from the duplicate-refund tally and updated with
   * the gateway id instead of inserting a new row.
   */
  existingRefundId?: string;
};

export type ExecuteRefundResult = {
  ok: boolean;
  refund: RefundRow | null;
  refundAmount: number;
};

/**
 * Issue a real Razorpay refund, persist it, mark the order refunded when the
 * payment is fully refunded, and notify the customer. Idempotent-safe: gateway
 * duplicate protection is enforced from the existing non-failed refund tally,
 * and the email/notification helpers de-duplicate downstream.
 *
 * Throws on validation/gateway failures so the caller surfaces a clean error.
 */
export async function executeRazorpayRefund(
  opts: ExecuteRefundOptions,
): Promise<ExecuteRefundResult> {
  // 1) Resolve the captured payment to refund.
  let pay: {
    id: string;
    order_id: string;
    user_id: string | null;
    amount: number;
    currency: string;
    status: string;
    razorpay_payment_id: string | null;
  } | null = null;

  if (opts.paymentId) {
    const { data, error } = await supabaseAdmin
      .from("payments")
      .select("id,order_id,user_id,amount,currency,status,razorpay_payment_id")
      .eq("id", opts.paymentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    pay = data as typeof pay;
  } else if (opts.orderId) {
    const { data, error } = await supabaseAdmin
      .from("payments")
      .select("id,order_id,user_id,amount,currency,status,razorpay_payment_id")
      .eq("order_id", opts.orderId)
      .eq("status", "succeeded")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    pay = data as typeof pay;
  }

  if (!pay) throw new Error("No captured payment found for this refund.");
  if (pay.status !== "succeeded") {
    throw new Error("Only successful payments can be refunded.");
  }
  if (!pay.razorpay_payment_id) {
    throw new Error("This payment has no Razorpay reference.");
  }

  // 2) Duplicate-refund protection — exclude the request row we're finalising.
  const { data: priorRefunds } = await supabaseAdmin
    .from("refunds")
    .select("id,amount,status")
    .eq("payment_id", pay.id);
  const refundedSoFar = (priorRefunds ?? [])
    .filter((r) => r.status !== "failed" && r.id !== opts.existingRefundId)
    .reduce((s, r) => s + Number(r.amount), 0);
  const maxRefundable = Number(pay.amount) - refundedSoFar;
  if (maxRefundable <= 0) throw new Error("This payment is already fully refunded.");

  const refundAmount = opts.amount
    ? Math.min(opts.amount, maxRefundable)
    : maxRefundable;

  // 3) Move the money at the gateway.
  let rzpRefund: { id: string; amount: number; currency: string; status: string };
  try {
    rzpRefund = await rzpFetch<{ id: string; amount: number; currency: string; status: string }>(
      `/payments/${pay.razorpay_payment_id}/refund`,
      {
        method: "POST",
        body: {
          amount: Math.round(refundAmount * 100),
          notes: { reason: opts.reason ?? opts.source, order_id: pay.order_id },
        },
      },
    );
  } catch (e: any) {
    // Record the failed attempt for visibility, then surface the error.
    if (opts.existingRefundId) {
      await supabaseAdmin
        .from("refunds")
        .update({ status: "failed", notes: { error: String(e?.message ?? e), source: opts.source } })
        .eq("id", opts.existingRefundId);
    } else {
      await supabaseAdmin.from("refunds").insert({
        order_id: pay.order_id,
        payment_id: pay.id,
        razorpay_payment_id: pay.razorpay_payment_id,
        amount: refundAmount,
        currency: pay.currency,
        reason: opts.reason ?? null,
        status: "failed",
        notes: { error: String(e?.message ?? e), source: opts.source },
      });
    }
    throw new Error(e?.message ?? "Refund request failed at the gateway.");
  }

  // 4) Persist the gateway refund (the webhook later reconciles status).
  const resolvedAmount = (rzpRefund.amount ?? Math.round(refundAmount * 100)) / 100;
  const resolvedStatus = rzpRefund.status === "processed" ? "processed" : "pending";
  let refund: RefundRow | null = null;

  if (opts.existingRefundId) {
    const { data, error } = await supabaseAdmin
      .from("refunds")
      .update({
        payment_id: pay.id,
        razorpay_refund_id: rzpRefund.id,
        razorpay_payment_id: pay.razorpay_payment_id,
        amount: resolvedAmount,
        currency: rzpRefund.currency ?? pay.currency,
        reason: opts.reason ?? undefined,
        status: resolvedStatus,
        notes: { source: opts.source },
      })
      .eq("id", opts.existingRefundId)
      .select("id,status,amount")
      .single();
    if (error) throw new Error(error.message);
    refund = data as RefundRow;
  } else {
    const { data, error } = await supabaseAdmin
      .from("refunds")
      .insert({
        order_id: pay.order_id,
        payment_id: pay.id,
        razorpay_refund_id: rzpRefund.id,
        razorpay_payment_id: pay.razorpay_payment_id,
        amount: resolvedAmount,
        currency: rzpRefund.currency ?? pay.currency,
        reason: opts.reason ?? null,
        status: resolvedStatus,
        notes: { source: opts.source },
      })
      .select("id,status,amount")
      .single();
    if (error) throw new Error(error.message);
    refund = data as RefundRow;
  }

  const isFull = refundAmount >= maxRefundable;

  // 5) Mark the order refunded once fully refunded.
  if (isFull) {
    await supabaseAdmin
      .from("orders")
      .update({ status: "refunded", payment_status: "refunded" })
      .eq("id", pay.order_id);
  }

  // 6) Inform the customer (email + in-app notification + timeline). The
  //    webhook's refund-processed email is idempotent on (orderId,event), so no
  //    duplicate is sent. All steps are resilient — never fail a moved refund.
  const refundCurrency = rzpRefund.currency ?? pay.currency;
  try {
    await enqueueOrderEmail(pay.order_id, "refund-processed", {
      refundAmount: resolvedAmount,
      refundCurrency,
    });
  } catch (emailErr: any) {
    console.error("[refund-execute] refund email dispatch failed", {
      orderId: pay.order_id,
      error: String(emailErr?.message ?? emailErr),
    });
  }

  if (pay.user_id) {
    try {
      const no = fmOrderNo(pay.order_id);
      await notifyCustomer({
        userId: pay.user_id,
        category: "refund",
        type: "refund_processed",
        title: "Refund Processed",
        body: `A refund of ${refundCurrency === "INR" ? "₹" : refundCurrency === "USD" ? "$" : ""}${resolvedAmount.toLocaleString("en-IN", { maximumFractionDigits: 2 })} for Order #${no} is on its way to your account.`,
        link: paymentLink(pay.order_id),
        priority: "high",
        data: { order_id: pay.order_id, refund_amount: resolvedAmount, refund_id: refund?.id ?? null },
        actorId: opts.actorId ?? pay.user_id,
      });
    } catch (notifyErr: any) {
      console.error("[refund-execute] refund notification failed", {
        orderId: pay.order_id,
        error: String(notifyErr?.message ?? notifyErr),
      });
    }
  }

  return { ok: true, refund, refundAmount };
}
