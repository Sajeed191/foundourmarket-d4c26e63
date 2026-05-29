import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyWebhookSignature } from "@/lib/razorpay.server";

/**
 * Razorpay webhook receiver. Configure this URL in the Razorpay dashboard:
 *   https://foundourmarket.lovable.app/api/public/razorpay-webhook
 * and set the same secret you saved as RAZORPAY_WEBHOOK_SECRET.
 *
 * Handles: payment.captured, payment.failed, refund.processed, order.paid
 */
export const Route = createFileRoute("/api/public/razorpay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const signature = request.headers.get("x-razorpay-signature") ?? "";
        const rawBody = await request.text();

        const valid = verifyWebhookSignature(rawBody, signature);

        let payload: any = null;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          /* keep null */
        }
        const event: string = payload?.event ?? "unknown";

        // Always log the event (even invalid ones, for audit)
        const { data: logRow } = await supabaseAdmin
          .from("webhook_logs")
          .insert({
            provider: "razorpay",
            event,
            payload,
            signature_valid: valid,
            status: valid ? "received" : "rejected",
          })
          .select("id")
          .single();

        if (!valid) {
          return new Response("Invalid signature", { status: 401 });
        }

        try {
          await handleEvent(event, payload);
          if (logRow?.id) {
            await supabaseAdmin
              .from("webhook_logs")
              .update({ status: "processed", processed_at: new Date().toISOString() })
              .eq("id", logRow.id);
          }
        } catch (e: any) {
          if (logRow?.id) {
            await supabaseAdmin
              .from("webhook_logs")
              .update({ status: "error", error: String(e?.message ?? e) })
              .eq("id", logRow.id);
          }
          console.error("razorpay webhook handler error", e);
          // Return 200 so Razorpay doesn't retry forever on logic errors we logged
          return new Response("ok", { status: 200 });
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});

async function findOrderByRzpOrderId(rzpOrderId?: string) {
  if (!rzpOrderId) return null;
  const { data } = await supabaseAdmin
    .from("orders")
    .select("id,user_id,total,currency,payment_status")
    .eq("razorpay_order_id", rzpOrderId)
    .maybeSingle();
  return data;
}

async function handleEvent(event: string, payload: any) {
  const paymentEntity = payload?.payload?.payment?.entity;
  const refundEntity = payload?.payload?.refund?.entity;
  const orderEntity = payload?.payload?.order?.entity;

  switch (event) {
    case "payment.captured": {
      const order = await findOrderByRzpOrderId(paymentEntity?.order_id);
      if (!order) return;
      if (order.payment_status !== "succeeded") {
        // Commit reserved stock permanently (idempotent), then mark paid.
        await supabaseAdmin.rpc("commit_order_stock", { _order_id: order.id });
        await supabaseAdmin
          .from("orders")
          .update({
            status: "paid",
            payment_status: "succeeded",
            razorpay_payment_id: paymentEntity?.id ?? null,
          })
          .eq("id", order.id);
      }
      // Upsert payment record idempotently
      const { data: existing } = await supabaseAdmin
        .from("payments")
        .select("id")
        .eq("razorpay_payment_id", paymentEntity?.id)
        .maybeSingle();
      if (!existing) {
        await supabaseAdmin.from("payments").insert({
          order_id: order.id,
          user_id: order.user_id,
          method: paymentEntity?.method ?? "razorpay",
          status: "succeeded",
          amount: (paymentEntity?.amount ?? 0) / 100,
          currency: paymentEntity?.currency ?? order.currency,
          transaction_id: paymentEntity?.id ?? "",
          razorpay_order_id: paymentEntity?.order_id ?? null,
          razorpay_payment_id: paymentEntity?.id ?? null,
          fee: (paymentEntity?.fee ?? 0) / 100,
          gateway_tax: (paymentEntity?.tax ?? 0) / 100,
          demo: false,
          meta: { source: "webhook.payment.captured" },
        });
      } else {
        await supabaseAdmin
          .from("payments")
          .update({
            status: "succeeded",
            method: paymentEntity?.method ?? "razorpay",
            fee: (paymentEntity?.fee ?? 0) / 100,
            gateway_tax: (paymentEntity?.tax ?? 0) / 100,
          })
          .eq("id", existing.id);
      }
      break;
    }

    case "payment.failed": {
      const order = await findOrderByRzpOrderId(paymentEntity?.order_id);
      if (!order) return;
      if (order.payment_status !== "succeeded") {
        // Give the reserved stock back (idempotent), then mark failed.
        await supabaseAdmin.rpc("release_order_stock", {
          _order_id: order.id,
          _reason: "webhook_payment_failed",
        });
        await supabaseAdmin
          .from("orders")
          .update({ status: "payment_failed", payment_status: "failed" })
          .eq("id", order.id);
      }
      const { data: existing } = await supabaseAdmin
        .from("payments")
        .select("id")
        .eq("razorpay_payment_id", paymentEntity?.id)
        .maybeSingle();
      if (!existing && paymentEntity?.id) {
        await supabaseAdmin.from("payments").insert({
          order_id: order.id,
          user_id: order.user_id,
          method: paymentEntity?.method ?? "razorpay",
          status: "failed",
          amount: (paymentEntity?.amount ?? 0) / 100,
          currency: paymentEntity?.currency ?? order.currency,
          transaction_id: paymentEntity?.id ?? "",
          razorpay_order_id: paymentEntity?.order_id ?? null,
          razorpay_payment_id: paymentEntity?.id ?? null,
          demo: false,
          meta: {
            source: "webhook.payment.failed",
            error_description: paymentEntity?.error_description ?? null,
          },
        });
      }
      break;
    }

    case "order.paid": {
      const order = await findOrderByRzpOrderId(orderEntity?.id);
      if (order && order.payment_status !== "succeeded") {
        await supabaseAdmin
          .from("orders")
          .update({ status: "paid", payment_status: "succeeded" })
          .eq("id", order.id);
      }
      break;
    }

    case "refund.processed": {
      const rzpPaymentId = refundEntity?.payment_id;
      const { data: pay } = await supabaseAdmin
        .from("payments")
        .select("id,order_id")
        .eq("razorpay_payment_id", rzpPaymentId)
        .maybeSingle();

      const { data: existingRefund } = await supabaseAdmin
        .from("refunds")
        .select("id")
        .eq("razorpay_refund_id", refundEntity?.id)
        .maybeSingle();

      if (!existingRefund && refundEntity?.id && pay?.order_id) {
        await supabaseAdmin.from("refunds").insert({
          order_id: pay.order_id,
          payment_id: pay.id,
          razorpay_refund_id: refundEntity?.id,
          razorpay_payment_id: rzpPaymentId,
          amount: (refundEntity?.amount ?? 0) / 100,
          currency: refundEntity?.currency ?? "INR",
          status: "processed",
          notes: { source: "webhook.refund.processed" },
        });
      } else if (existingRefund) {
        await supabaseAdmin
          .from("refunds")
          .update({ status: "processed" })
          .eq("id", (existingRefund as { id: string }).id);
      }


      if (pay?.order_id) {
        await supabaseAdmin
          .from("orders")
          .update({ status: "refunded", payment_status: "refunded" })
          .eq("id", pay.order_id);
      }
      break;
    }

    default:
      // Unhandled event — already logged
      break;
  }
}
