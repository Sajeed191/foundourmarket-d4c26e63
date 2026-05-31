/**
 * Staff-gated server functions for the Customer 360° Intelligence Center.
 *
 * Only `admin`, `super_admin` and `manager` may read customer intelligence.
 * Every list query and every profile lookup is re-verified server-side and
 * written to the security audit log. All data originates from real tables —
 * profiles, orders, payments, addresses, shipments, refunds, returns,
 * support_tickets, notifications and fraud_alerts. No mock data.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireStaff, adminRpc, logSecurity, type StaffRole } from "./admin-guard.server";

const CUST_STAFF: StaffRole[] = ["admin", "super_admin", "manager"];

export type CustomerKpis = {
  total_customers: number;
  paying_customers: number;
  total_revenue: number;
  open_tickets: number;
  new_today: number;
};

export type CustomerRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  total_orders: number;
  lifetime_spend: number;
  successful_payments: number;
  refund_count: number;
  open_tickets: number;
  risk_score: number;
  last_active: string | null;
  last_sign_in_at: string | null;
  last_order: string | null;
  created_at: string | null;
};

export type CustomerCenterResult = {
  kpis: CustomerKpis;
  rows: CustomerRow[];
  total: number;
};

/** KPI bar + server-side paginated / searched customer roster. */
export const getCustomerCenterFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        search: z.string().max(120).optional(),
        page: z.number().int().min(0).max(100000).optional(),
        pageSize: z.number().int().min(1).max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, CUST_STAFF, "customers.center.list");

    const pageSize = input.pageSize ?? 50;
    const page = input.page ?? 0;
    const { data, error } = await adminRpc("svc_customer_center", {
      _actor: userId,
      _search: input.search?.trim() || null,
      _limit: pageSize,
      _offset: page * pageSize,
    });
    if (error) {
      console.error("[svc_customer_center] rpc error", error.message);
      throw new Error(error.message);
    }

    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: "customers.center.list",
      success: true,
      detail: { search: input.search ?? null, page },
    });

    return data as CustomerCenterResult;
  });

export type CustomerProfile = {
  profile: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    phone: string | null;
    alt_phone: string | null;
    country: string | null;
    created_at: string | null;
    email: string | null;
    last_sign_in_at: string | null;
    email_confirmed_at: string | null;
  } | null;
  value: {
    lifetime_revenue: number;
    total_orders: number;
    delivered_orders: number;
    refund_count: number;
    return_count: number;
    succeeded_payments: number;
    failed_payments: number;
  };
  orders: Array<{
    id: string; status: string | null; payment_status: string | null; fulfillment_status: string | null;
    total: number | null; currency: string | null; created_at: string;
    tracking_number: string | null; razorpay_payment_id: string | null;
  }>;
  payments: Array<{
    id: string; order_id: string | null; method: string | null; status: string | null; amount: number | null;
    currency: string | null; transaction_id: string | null; razorpay_payment_id: string | null;
    fee: number | null; created_at: string;
  }>;
  addresses: Array<{
    id: string; label: string | null; full_name: string | null; phone: string | null; line1: string | null;
    line2: string | null; city: string | null; state: string | null; postal: string | null; country: string | null;
    is_default_shipping: boolean | null; is_default_billing: boolean | null;
    latitude: number | null; longitude: number | null;
  }>;
  shipments: Array<{
    id: string; order_id: string | null; carrier: string | null; tracking_number: string | null;
    tracking_url: string | null; status: string | null; shipped_at: string | null; delivered_at: string | null;
    estimated_delivery: string | null; created_at: string;
  }>;
  refunds: Array<{
    id: string; order_id: string | null; amount: number | null; currency: string | null;
    reason: string | null; status: string | null; razorpay_refund_id: string | null; created_at: string;
  }>;
  returns: Array<{
    id: string; order_id: string | null; status: string | null; reason: string | null; notes: string | null;
    refund_amount: number | null; refund_status: string | null; created_at: string;
  }>;
  tickets: Array<{
    id: string; subject: string | null; category: string | null; status: string | null; priority: string | null;
    order_id: string | null; last_message_at: string | null; resolved_at: string | null; created_at: string;
  }>;
  notifications: Array<{
    id: string; type: string | null; title: string | null; body: string | null; link: string | null;
    priority: string | null; read_at: string | null; created_at: string;
  }>;
  fraud: Array<{
    id: string; title: string | null; fraud_type: string | null; severity: string | null; score: number | null;
    status: string | null; detail: string | null; created_at: string;
  }>;
};

/** Full 360 dossier for a single customer. */
export const getCustomerProfileFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ customerId: z.string().uuid() }).parse(input))
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(
      userId,
      CUST_STAFF,
      "customers.profile.view",
      input.customerId,
    );

    const { data, error } = await adminRpc("svc_customer_profile", {
      _actor: userId,
      _customer: input.customerId,
    });
    if (error) {
      console.error("[svc_customer_profile] rpc error", error.message);
      throw new Error(error.message);
    }

    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: "customers.profile.view",
      target: input.customerId,
      success: true,
    });

    return data as CustomerProfile;
  });

/** Risk score derived from real fraud signals + failed payments for a customer. */
export const getCustomerRiskFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ customerId: z.string().uuid() }).parse(input))
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    await requireStaff(userId, CUST_STAFF, "customers.profile.risk", input.customerId);

    const [{ data: alerts }, failed, attempts, addrCount] = await Promise.all([
      supabaseAdmin
        .from("fraud_alerts")
        .select("score,status")
        .eq("subject_id", input.customerId),
      supabaseAdmin
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("user_id", input.customerId)
        .eq("status", "failed"),
      supabaseAdmin
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("user_id", input.customerId),
      supabaseAdmin
        .from("addresses")
        .select("id", { count: "exact", head: true })
        .eq("user_id", input.customerId),
    ]);

    const rows = (alerts ?? []) as { score: number | null; status: string | null }[];
    const openAlerts = rows.filter((a) => a.status !== "resolved").length;
    const maxScore = rows.reduce((m, a) => Math.max(m, Number(a.score) || 0), 0);
    const failedCount = (failed as { count: number | null }).count ?? 0;
    const totalAttempts = (attempts as { count: number | null }).count ?? 0;
    const addresses = (addrCount as { count: number | null }).count ?? 0;

    const score = Math.min(
      100,
      maxScore + failedCount * 12 + (totalAttempts > 1 ? (totalAttempts - 1) * 6 : 0) + openAlerts * 10 + (addresses > 3 ? 8 : 0),
    );
    const level = score >= 70 ? "high" : score >= 35 ? "medium" : "low";

    return {
      score,
      level,
      open_alerts: openAlerts,
      failed_payments: failedCount,
      total_attempts: totalAttempts,
      address_count: addresses,
      chargeback_risk: failedCount >= 3 || score >= 70 ? "elevated" : score >= 35 ? "moderate" : "low",
    };
  });

/** Create a support ticket on behalf of a customer (staff action, audited). */
export const createCustomerTicketFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        customerId: z.string().uuid(),
        subject: z.string().min(3).max(200),
        category: z.string().min(2).max(60).optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
        orderId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(
      userId,
      CUST_STAFF,
      "customers.ticket.create",
      input.customerId,
    );

    const nowIso = new Date().toISOString();
    const { data: ticket, error } = await supabaseAdmin
      .from("support_tickets")
      .insert({
        user_id: input.customerId,
        order_id: input.orderId ?? null,
        subject: input.subject,
        category: input.category ?? "general",
        priority: input.priority ?? "normal",
        status: "open",
        last_message_at: nowIso,
        assigned_to: userId,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[createCustomerTicketFn] insert error", error.message);
      throw new Error(error.message);
    }

    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: "customers.ticket.create",
      target: input.customerId,
      success: true,
      detail: { ticketId: ticket.id },
    });

    return { id: ticket.id as string };
  });
