/**
 * Support Operations — staff-gated refund & return action server functions.
 *
 * Every action re-verifies staff roles (requireStaff), mutates via the
 * service-role admin client, notifies the customer with a real notification
 * row, and writes a tamper-proof entry to security_audit_log. The client
 * never decides authorization. No mock data — all writes target live rows.
 *
 * Thin file: only createServerFn declarations + imports so the client.server
 * import never leaks into client bundles.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff, logSecurity, type StaffRole } from "./admin-guard.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueReturnEmail } from "./return-emails.server";

const REFUND_STAFF: StaffRole[] = ["admin", "super_admin", "manager"];
const SUPPORT_STAFF: StaffRole[] = ["admin", "super_admin", "manager", "support"];

async function orderUserId(orderId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("orders")
    .select("user_id")
    .eq("id", orderId)
    .maybeSingle();
  return data?.user_id ?? null;
}




/* ------------------------------ Refund actions ---------------------------- */

const REFUND_STATUS: Record<string, string> = {
  approve: "approved",
  reject: "rejected",
  escalate: "escalated",
  processing: "processing",
  complete: "completed",
  request_evidence: "evidence_requested",
};

export const refundActionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        refundId: z.string().uuid(),
        action: z.enum([
          "approve",
          "reject",
          "escalate",
          "processing",
          "complete",
          "request_evidence",
        ]),
        note: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(
      userId,
      REFUND_STAFF,
      "support.refund.action",
      input.refundId,
    );

    const { data: refund, error: rErr } = await supabaseAdmin
      .from("refunds")
      .select("id, order_id, amount, currency, status, notes")
      .eq("id", input.refundId)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!refund) throw new Error("Refund not found.");

    const status = REFUND_STATUS[input.action]!;
    const prevNotes = Array.isArray((refund as { notes?: unknown }).notes)
      ? ((refund as { notes: unknown[] }).notes as unknown[])
      : [];
    const noteEntry = {
      at: new Date().toISOString(),
      by: userId,
      role: primaryRole,
      action: input.action,
      note: input.note ?? null,
    };

    const { error: uErr } = await supabaseAdmin
      .from("refunds")
      .update({ status, notes: [...prevNotes, noteEntry] as never })
      .eq("id", input.refundId);
    if (uErr) throw new Error(uErr.message);

    const customer = await orderUserId(refund.order_id);
    const amountLabel = `${refund.currency === "USD" ? "$" : "₹"}${Math.round(
      Number(refund.amount) || 0,
    ).toLocaleString()}`;
    const { notifyCustomer: notify } = await import("./customer-notify.server");
    const refundDeep = `/account/payments?order=${refund.order_id}`;
    const fireRefund = (title: string, body: string, priority: "low" | "normal" | "high") =>
      notify({
        userId: customer, category: "refund", type: "refund_update",
        title, body, link: refundDeep, priority,
        data: { order_id: refund.order_id, refund_id: refund.id }, actorId: userId,
      });
    if (input.action === "approve") {
      await fireRefund("Refund initiated", `Your refund of ${amountLabel} has been approved and is being processed.`, "high");
      await enqueueReturnEmail(refund.order_id, "refund-initiated", { refundAmount: Number(refund.amount) || 0, refundCurrency: refund.currency }, `refund-${refund.id}-initiated`);
    } else if (input.action === "complete") {
      await fireRefund("Refund completed", `Your refund of ${amountLabel} has been completed.`, "normal");
      await enqueueReturnEmail(refund.order_id, "refund-completed", { refundAmount: Number(refund.amount) || 0, refundCurrency: refund.currency }, `refund-${refund.id}-completed`);
    } else if (input.action === "reject") {
      await fireRefund("Refund update", `We've reviewed your refund request. ${input.note ?? "Please contact support for details."}`, "normal");
    } else if (input.action === "request_evidence") {
      await fireRefund("Information needed for your refund", input.note ?? "Please reply with supporting evidence (photos / details) so we can process your refund.", "high");
    }

    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: "support.refund.action",
      target: input.refundId,
      success: true,
      detail: { action: input.action, status, orderId: refund.order_id },
    });
    return { ok: true, status };
  });

/* ------------------------------ Return actions ---------------------------- */

export const returnActionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        returnId: z.string().uuid(),
        action: z.enum([
          "approve",
          "reject",
          "generate_label",
          "received",
          "refunded",
        ]),
        note: z.string().max(500).optional(),
        refundAmount: z.number().min(0).max(10_000_000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(
      userId,
      SUPPORT_STAFF,
      "support.return.action",
      input.returnId,
    );

    const { data: ret, error: gErr } = await supabaseAdmin
      .from("returns")
      .select("id, order_id, user_id, status, notes, refund_amount")
      .eq("id", input.returnId)
      .maybeSingle();
    if (gErr) throw new Error(gErr.message);
    if (!ret) throw new Error("Return not found.");

    const patch: Record<string, unknown> = {};
    let label: string | null = null;
    let title = "";
    let body = "";
    let category: "return" | "refund" = "return";
    let emailEvent: import("./return-emails.server").ReturnEmailEvent | null = null;
    let refundAmt: number | undefined;

    switch (input.action) {
      case "approve":
        patch.status = "approved";
        title = "Return approved";
        body = "Your return request has been approved. A return label will follow shortly.";
        emailEvent = "return-approved";
        break;
      case "reject":
        patch.status = "rejected";
        patch.resolved_at = new Date().toISOString();
        title = "Return update";
        body = input.note ?? "We were unable to approve this return. Please contact support for details.";
        emailEvent = "return-rejected";
        break;
      case "generate_label":
        patch.status = "approved";
        label = `RL-${ret.order_id.slice(0, 8).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        title = "Return label ready";
        body = `Your return label is ready. Reference: ${label}. Please ship the item back using this reference.`;
        break;
      case "received":
        patch.status = "received";
        title = "Return received";
        body = "We've received your returned item and started inspection.";
        break;
      case "refunded": {
        patch.status = "refunded";
        patch.refund_status = "completed";
        patch.resolved_at = new Date().toISOString();
        if (input.refundAmount != null) patch.refund_amount = input.refundAmount;
        const amt = input.refundAmount ?? (Number(ret.refund_amount) || 0);
        refundAmt = amt || undefined;
        category = "refund";
        title = "Return refunded";
        body = `Your return has been refunded${amt ? ` (₹${Math.round(amt).toLocaleString()})` : ""}.`;
        emailEvent = "refund-completed";
        break;
      }
    }

    const noteLine = `[${new Date().toISOString()}] ${primaryRole} ${input.action}${label ? ` label=${label}` : ""}${input.note ? ` — ${input.note}` : ""}`;
    patch.notes = ret.notes ? `${ret.notes}\n${noteLine}` : noteLine;

    const { error: uErr } = await supabaseAdmin
      .from("returns")
      .update(patch as never)
      .eq("id", input.returnId);
    if (uErr) throw new Error(uErr.message);

    // Centralized notification (in-app + audit + timeline), preference-aware.
    const customerId = ret.user_id ?? (await orderUserId(ret.order_id));
    const { notifyCustomer: notify } = await import("./customer-notify.server");
    await notify({
      userId: customerId,
      category,
      type: category === "refund" ? "refund_update" : "return_update",
      title,
      body,
      link: `/account/returns?return=${input.returnId}&order=${ret.order_id}`,
      priority: input.action === "generate_label" ? "high" : "normal",
      data: { return_id: input.returnId, order_id: ret.order_id },
      actorId: userId,
    });

    // Branded email for the lifecycle stages that warrant one.
    if (emailEvent) {
      await enqueueReturnEmail(
        ret.order_id,
        emailEvent,
        { refundAmount: refundAmt, reason: input.action === "reject" ? input.note ?? null : null },
        `return-${input.returnId}-${emailEvent}`,
      );
    }

    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: "support.return.action",
      target: input.returnId,
      success: true,
      detail: { action: input.action, label, orderId: ret.order_id },
    });
    return { ok: true, status: patch.status as string, label };
  });
