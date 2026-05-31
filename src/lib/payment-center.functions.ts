/**
 * Staff-gated server functions for the Admin Payment & Customer Intelligence Center.
 *
 * Only `admin`, `super_admin` and `manager` may read payment intelligence.
 * Every list query and every drawer lookup is re-verified server-side and
 * written to the security audit log. All data originates from real tables —
 * payments, orders, profiles, shipments, refunds, support_tickets and
 * fraud_alerts. No mock data, no hard-coded metrics.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireStaff, adminRpc, logSecurity, type StaffRole } from "./admin-guard.server";

const PAY_STAFF: StaffRole[] = ["admin", "super_admin", "manager"];

export type PaymentCenterKpis = {
  succeeded_count: number;
  pending_count: number;
  failed_count: number;
  refunded_count: number;
  total_revenue: number;
  refund_value: number;
  today_revenue: number;
  today_orders: number;
};

export type PaymentRow = {
  id: string;
  order_id: string | null;
  user_id: string | null;
  method: string | null;
  status: string | null;
  amount: number | null;
  currency: string | null;
  transaction_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_order_id: string | null;
  fee: number | null;
  gateway_tax: number | null;
  created_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  order_total: number | null;
  order_status: string | null;
  payment_status: string | null;
  tracking_number: string | null;
};

export type PaymentCenterResult = {
  kpis: PaymentCenterKpis;
  rows: PaymentRow[];
  total: number;
};

/** KPI bar + server-side paginated / searched payment list. */
export const getPaymentCenterFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        search: z.string().max(120).optional(),
        status: z.enum(["all", "succeeded", "pending", "failed"]).optional(),
        page: z.number().int().min(0).max(100000).optional(),
        pageSize: z.number().int().min(1).max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, PAY_STAFF, "payments.center.list");

    const pageSize = input.pageSize ?? 50;
    const page = input.page ?? 0;
    const { data, error } = await adminRpc("svc_payment_center", {
      _actor: userId,
      _search: input.search?.trim() || null,
      _status: input.status ?? "all",
      _limit: pageSize,
      _offset: page * pageSize,
    });
    if (error) {
      console.error("[svc_payment_center] rpc error", error.message);
      throw new Error(error.message);
    }

    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: "payments.center.list",
      success: true,
      detail: { search: input.search ?? null, status: input.status ?? "all", page },
    });

    return data as PaymentCenterResult;
  });

export type FraudIntel = {
  score: number;
  level: string;
  open_alerts: number;
  failed_payments: number;
  total_attempts: number;
  chargeback_risk: string;
  alerts: {
    id: string;
    title: string | null;
    fraud_type: string | null;
    severity: string | null;
    score: number | null;
    status: string | null;
    detail: string | null;
    created_at: string;
  }[];
};

/**
 * Fraud intelligence for a specific order's customer.
 * Pulls real fraud_alerts (by order id, user id and email) plus live
 * failed-payment / multiple-attempt counts.
 */
export const getPaymentFraudFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orderId: z.string().uuid(),
        userId: z.string().uuid().nullable().optional(),
        email: z.string().max(200).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(
      userId,
      PAY_STAFF,
      "payments.center.fraud",
      input.orderId,
    );

    const subjectIds = [input.orderId, input.userId, input.email].filter(
      (v): v is string => !!v,
    );

    const [{ data: alerts }, attempts, failed] = await Promise.all([
      supabaseAdmin
        .from("fraud_alerts")
        .select("id,title,fraud_type,severity,score,status,detail,created_at,subject_id")
        .in("subject_id", subjectIds)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("order_id", input.orderId),
      input.userId
        ? supabaseAdmin
            .from("payments")
            .select("id", { count: "exact", head: true })
            .eq("user_id", input.userId)
            .eq("status", "failed")
        : Promise.resolve({ count: 0 }),
    ]);

    const alertRows = (alerts ?? []) as FraudIntel["alerts"][number][] & {
      score: number | null;
    }[];
    const openAlerts = alertRows.filter((a) => a.status !== "resolved").length;
    const maxScore = alertRows.reduce((m, a) => Math.max(m, Number(a.score) || 0), 0);
    const failedCount = (failed as { count: number | null }).count ?? 0;
    const totalAttempts = (attempts as { count: number | null }).count ?? 0;

    // Deterministic risk score derived from real signals.
    const score = Math.min(
      100,
      maxScore +
        failedCount * 12 +
        (totalAttempts > 1 ? (totalAttempts - 1) * 8 : 0) +
        openAlerts * 10,
    );
    const level = score >= 70 ? "high" : score >= 35 ? "medium" : "low";
    const chargeback = failedCount >= 3 || score >= 70 ? "elevated" : score >= 35 ? "moderate" : "low";

    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: "payments.center.fraud.view",
      target: input.orderId,
      success: true,
    });

    return {
      score,
      level,
      open_alerts: openAlerts,
      failed_payments: failedCount,
      total_attempts: totalAttempts,
      chargeback_risk: chargeback,
      alerts: alertRows.map((a) => ({
        id: a.id,
        title: a.title,
        fraud_type: a.fraud_type,
        severity: a.severity,
        score: a.score,
        status: a.status,
        detail: a.detail,
        created_at: a.created_at,
      })),
    } satisfies FraudIntel;
  });

/** Create a support ticket on behalf of an order's customer (staff action, audited). */
export const createPaymentTicketFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orderId: z.string().uuid(),
        subject: z.string().min(3).max(200),
        category: z.string().min(2).max(60).optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(
      userId,
      PAY_STAFF,
      "payments.center.ticket.create",
      input.orderId,
    );

    const { data: order, error: oErr } = await supabaseAdmin
      .from("orders")
      .select("id,user_id,market_region")
      .eq("id", input.orderId)
      .maybeSingle();
    if (oErr || !order) throw new Error("Order not found.");
    if (!order.user_id) throw new Error("Order has no associated customer account.");

    const nowIso = new Date().toISOString();
    const { data: ticket, error } = await supabaseAdmin
      .from("support_tickets")
      .insert({
        user_id: order.user_id,
        order_id: order.id,
        subject: input.subject,
        category: input.category ?? "payment",
        priority: input.priority ?? "normal",
        status: "open",
        market_region: order.market_region ?? null,
        last_message_at: nowIso,
        assigned_to: userId,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[createPaymentTicketFn] insert error", error.message);
      throw new Error(error.message);
    }

    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: "payments.center.ticket.create",
      target: input.orderId,
      success: true,
      detail: { ticketId: ticket.id },
    });

    return { id: ticket.id as string };
  });
