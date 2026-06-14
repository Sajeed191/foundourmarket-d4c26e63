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
  avatar_url: string | null;
  country: string | null;
  total_orders: number;
  lifetime_spend: number;
  successful_payments: number;
  refund_count: number;
  open_tickets: number;
  risk_score: number;
  account_status: "active" | "suspended" | "banned" | "deleted";
  ordering_blocked: boolean;
  reviews_disabled: boolean;
  deleted_at: string | null;
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

    const result = data as CustomerCenterResult;
    const rows = result.rows ?? [];

    // Enrich roster rows with profile avatars in a single query.
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id,avatar_url")
        .in("id", ids);
      const avatarMap = new Map<string, string | null>();
      for (const pr of profiles ?? []) avatarMap.set(pr.id as string, (pr.avatar_url as string | null) ?? null);
      for (const r of rows) r.avatar_url = avatarMap.get(r.id) ?? null;
    }

    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: "customers.center.list",
      success: true,
      detail: { search: input.search ?? null, page },
    });

    return result;
  });

export type AdminCustomer = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  country: string | null;
  total_orders: number;
  lifetime_spend: number;
  open_tickets: number;
  status: "active" | "paying" | "registered";
  last_active: string | null;
  created_at: string | null;
};

/**
 * Full customer roster for the admin dashboard tab — every registered customer
 * (not only those with orders), enriched with profile photo + a derived status.
 */
export const getAdminCustomersFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ search: z.string().max(120).optional() }).parse(input),
  )
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, CUST_STAFF, "customers.center.list");

    const { data, error } = await adminRpc("svc_customer_center", {
      _actor: userId,
      _search: input.search?.trim() || null,
      _limit: 500,
      _offset: 0,
    });
    if (error) {
      console.error("[getAdminCustomersFn] rpc error", error.message);
      throw new Error(error.message);
    }

    const result = data as CustomerCenterResult;
    const rows = result.rows ?? [];

    // Enrich with profile photos in a single query.
    const ids = rows.map((r) => r.id);
    const avatarMap = new Map<string, string | null>();
    if (ids.length) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id,avatar_url")
        .in("id", ids);
      for (const p of profiles ?? []) avatarMap.set(p.id as string, (p.avatar_url as string | null) ?? null);
    }

    const recentCutoff = Date.now() - 1000 * 60 * 60 * 24 * 30;
    const customers: AdminCustomer[] = rows.map((r) => {
      const recentlyActive = r.last_active ? new Date(r.last_active).getTime() >= recentCutoff : false;
      const status: AdminCustomer["status"] =
        r.total_orders > 0 ? (recentlyActive ? "active" : "paying") : "registered";
      return {
        id: r.id,
        full_name: r.full_name,
        email: r.email,
        phone: r.phone,
        avatar_url: avatarMap.get(r.id) ?? null,
        country: r.country,
        total_orders: r.total_orders,
        lifetime_spend: r.lifetime_spend,
        open_tickets: r.open_tickets,
        status,
        last_active: r.last_active,
        created_at: r.created_at,
      };
    });

    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: "customers.center.list",
      success: true,
      detail: { search: input.search ?? null, scope: "admin-tab" },
    });

    return { customers, total: result.total ?? customers.length };
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
    account_status: "active" | "suspended" | "banned" | "deleted";
    ordering_blocked: boolean;
    reviews_disabled: boolean;
    deleted_at: string | null;
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

// ============================================================
// Admin private notes for a customer (customer_notes table)
// ============================================================

export type CustomerNote = {
  id: string;
  note: string;
  pinned: boolean;
  author_id: string | null;
  created_at: string;
};

/** List private admin notes for a customer (most recent / pinned first). */
export const listCustomerNotesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ customerId: z.string().uuid() }).parse(input))
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    await requireStaff(userId, CUST_STAFF, "customers.notes.list", input.customerId);

    const { data, error } = await supabaseAdmin
      .from("customer_notes")
      .select("id,note,pinned,author_id,created_at")
      .eq("customer_id", input.customerId)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { notes: (data ?? []) as CustomerNote[] };
  });

/** Add a private admin note to a customer. */
export const addCustomerNoteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        customerId: z.string().uuid(),
        note: z.string().trim().min(1).max(2000),
        pinned: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, CUST_STAFF, "customers.notes.create", input.customerId);

    const { data, error } = await supabaseAdmin
      .from("customer_notes")
      .insert({
        customer_id: input.customerId,
        note: input.note,
        pinned: input.pinned ?? false,
        author_id: userId,
      })
      .select("id,note,pinned,author_id,created_at")
      .single();
    if (error) throw new Error(error.message);

    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: "customers.notes.create",
      target: input.customerId,
      success: true,
    });
    return { note: data as CustomerNote };
  });

/** Delete a private admin note. */
export const deleteCustomerNoteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ customerId: z.string().uuid(), noteId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    await requireStaff(userId, CUST_STAFF, "customers.notes.delete", input.customerId);

    const { error } = await supabaseAdmin
      .from("customer_notes")
      .delete()
      .eq("id", input.noteId)
      .eq("customer_id", input.customerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================
// Reviews + wishlist for the customer 360 profile
// ============================================================

export type CustomerReview = {
  id: string;
  product_slug: string;
  rating: number;
  title: string | null;
  body: string | null;
  created_at: string;
};

export type CustomerWishlistItem = {
  id: string;
  product_slug: string;
  created_at: string;
};

export const getCustomerExtrasFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ customerId: z.string().uuid() }).parse(input))
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    await requireStaff(userId, CUST_STAFF, "customers.extras.view", input.customerId);

    const [{ data: reviews }, { data: wishlist }] = await Promise.all([
      supabaseAdmin
        .from("product_reviews")
        .select("id,product_slug,rating,title,body,created_at")
        .eq("user_id", input.customerId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("wishlist")
        .select("id,product_slug,created_at")
        .eq("user_id", input.customerId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    return {
      reviews: (reviews ?? []) as CustomerReview[],
      wishlist: (wishlist ?? []) as CustomerWishlistItem[],
    };
  });

// ============================================================
// Email history (PRIORITY 5) + tags + activity timeline (PRIORITY 6)
// ============================================================

export type CustomerEmail = {
  id: string;
  recipient: string | null;
  template: string | null;
  subject: string | null;
  status: string | null;
  provider: string | null;
  error: string | null;
  body: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  trigger_source: string | null;
  created_at: string;
};

/**
 * Full email history for a customer (most recent first). Reads the
 * customer-linked `email_logs` mirror and overlays the latest operational
 * status from `email_send_log` (sent / failed / dlq / bounced / suppressed)
 * keyed by message id, so support can see real delivery outcomes.
 */
export const listCustomerEmailsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ customerId: z.string().uuid() }).parse(input))
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    await requireStaff(userId, CUST_STAFF, "customers.emails.list", input.customerId);

    const { data, error } = await supabaseAdmin
      .from("email_logs")
      .select(
        "id,recipient,template,subject,status,provider,error,payload,sent_at,delivered_at,provider_message_id,message_id,created_at",
      )
      .eq("user_id", input.customerId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const rows = data ?? [];

    // Overlay the latest operational status from email_send_log per message id.
    const ids = [
      ...new Set(
        rows
          .map((r) => (r.provider_message_id as string | null) ?? (r.message_id as string | null))
          .filter(Boolean) as string[],
      ),
    ];
    const statusMap = new Map<string, { status: string; error: string | null }>();
    if (ids.length) {
      const { data: sends } = await supabaseAdmin
        .from("email_send_log")
        .select("message_id,status,error_message,created_at")
        .in("message_id", ids)
        .order("created_at", { ascending: false });
      for (const s of sends ?? []) {
        const mid = s.message_id as string;
        if (!mid || statusMap.has(mid)) continue; // first row = latest (desc order)
        statusMap.set(mid, {
          status: s.status as string,
          error: (s.error_message as string | null) ?? null,
        });
      }
    }

    const emails: CustomerEmail[] = rows.map((r) => {
      const payload = (r.payload ?? {}) as Record<string, unknown>;
      const mid = (r.provider_message_id as string | null) ?? (r.message_id as string | null);
      const overlay = mid ? statusMap.get(mid) : undefined;
      const trigger =
        (payload.event as string | undefined) ||
        (payload.context as string | undefined) ||
        (r.provider as string | null) ||
        null;
      return {
        id: r.id as string,
        recipient: (r.recipient as string | null) ?? null,
        template: (r.template as string | null) ?? null,
        subject: (r.subject as string | null) ?? null,
        status: overlay?.status ?? (r.status as string | null) ?? null,
        provider: (r.provider as string | null) ?? null,
        error: overlay?.error ?? (r.error as string | null) ?? null,
        body: (payload.body as string | null) ?? null,
        sent_at: (r.sent_at as string | null) ?? (r.created_at as string),
        delivered_at: (r.delivered_at as string | null) ?? null,
        trigger_source: trigger,
        created_at: r.created_at as string,
      };
    });
    return { emails };
  });

/** Tags assigned to a customer. */
export const listCustomerTagsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ customerId: z.string().uuid() }).parse(input))
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    await requireStaff(userId, CUST_STAFF, "customers.tags.list", input.customerId);

    const { data, error } = await supabaseAdmin
      .from("customer_tags")
      .select("tag")
      .eq("customer_id", input.customerId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { tags: (data ?? []).map((r) => r.tag as string) };
  });

export type TimelineEvent = {
  kind:
    | "account_created"
    | "order"
    | "payment"
    | "shipment"
    | "review"
    | "notification"
    | "email"
    | "support_ticket"
    | "admin_action";
  at: string;
  title: string;
  detail?: string | null;
  link?: string | null;
};

/** Unified chronological activity timeline for a customer. */
export const getCustomerTimelineFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ customerId: z.string().uuid() }).parse(input))
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    await requireStaff(userId, CUST_STAFF, "customers.timeline.view", input.customerId);
    const cid = input.customerId;

    const [
      prof,
      orders,
      payments,
      shipments,
      reviews,
      notifications,
      emails,
      tickets,
      audit,
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("created_at").eq("id", cid).maybeSingle(),
      supabaseAdmin.from("orders").select("id,total,currency,status,created_at").eq("user_id", cid).order("created_at", { ascending: false }).limit(100),
      supabaseAdmin.from("payments").select("id,amount,currency,status,created_at").eq("user_id", cid).order("created_at", { ascending: false }).limit(100),
      supabaseAdmin.from("shipments").select("id,status,carrier,created_at").eq("user_id", cid).order("created_at", { ascending: false }).limit(100),
      supabaseAdmin.from("product_reviews").select("id,product_slug,rating,created_at").eq("user_id", cid).order("created_at", { ascending: false }).limit(100),
      supabaseAdmin.from("notifications").select("id,title,type,created_at").eq("user_id", cid).order("created_at", { ascending: false }).limit(100),
      supabaseAdmin.from("email_logs").select("id,subject,status,template,created_at").eq("user_id", cid).order("created_at", { ascending: false }).limit(100),
      supabaseAdmin.from("support_tickets").select("id,subject,status,created_at").eq("user_id", cid).order("created_at", { ascending: false }).limit(100),
      supabaseAdmin.from("security_audit_log").select("action,detail,success,created_at").eq("target", cid).order("created_at", { ascending: false }).limit(100),
    ]);

    const events: TimelineEvent[] = [];
    const created = (prof.data?.created_at as string | null) ?? null;
    if (created) events.push({ kind: "account_created", at: created, title: "Account created" });

    for (const o of orders.data ?? []) {
      events.push({
        kind: "order",
        at: o.created_at as string,
        title: `Order ${(o.status as string) ?? "placed"}`,
        detail: o.total != null ? `${o.currency ?? ""} ${o.total}` : null,
        link: `/admin-orders-ops?order=${o.id}`,
      });
    }
    for (const p of payments.data ?? []) {
      events.push({ kind: "payment", at: p.created_at as string, title: `Payment ${(p.status as string) ?? ""}`.trim(), detail: p.amount != null ? `${p.currency ?? ""} ${p.amount}` : null });
    }
    for (const s of shipments.data ?? []) {
      events.push({ kind: "shipment", at: s.created_at as string, title: `Shipment ${(s.status as string) ?? ""}`.trim(), detail: (s.carrier as string | null) ?? null });
    }
    for (const r of reviews.data ?? []) {
      events.push({ kind: "review", at: r.created_at as string, title: `Reviewed ${(r.product_slug as string) ?? "a product"}`, detail: `${r.rating}★` });
    }
    for (const n of notifications.data ?? []) {
      events.push({ kind: "notification", at: n.created_at as string, title: (n.title as string) ?? "Notification" });
    }
    for (const e of emails.data ?? []) {
      events.push({ kind: "email", at: e.created_at as string, title: (e.subject as string) ?? (e.template as string) ?? "Email", detail: (e.status as string | null) ?? null });
    }
    for (const t of tickets.data ?? []) {
      events.push({ kind: "support_ticket", at: t.created_at as string, title: (t.subject as string) ?? "Support ticket", detail: (t.status as string | null) ?? null });
    }
    for (const a of audit.data ?? []) {
      events.push({
        kind: "admin_action",
        at: a.created_at as string,
        title: (a.action as string) ?? "Admin action",
        detail: (a.success as boolean) ? null : "failed",
      });
    }

    events.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
    return { events: events.slice(0, 300) };
  });
