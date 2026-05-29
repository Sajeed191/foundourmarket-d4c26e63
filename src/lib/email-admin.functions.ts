import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ORDER_EMAIL_EVENTS, orderEmailMessageId } from "@/lib/order-emails.server";



const STAFF_ROLES = ["admin", "super_admin", "manager"];

async function assertEmailStaff(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error("Could not verify permissions.");
  const roles = (data ?? []).map((r) => r.role as string);
  if (!roles.some((r) => STAFF_ROLES.includes(r))) {
    throw new Error("You are not authorised to view email settings.");
  }
}

const querySchema = z.object({
  range: z.enum(["24h", "7d", "30d"]).default("7d"),
  template: z.string().trim().max(120).optional().nullable(),
  status: z.string().trim().max(40).optional().nullable(),
  limit: z.number().int().min(1).max(200).default(100),
});

type LogRow = {
  id: string;
  message_id: string | null;
  template_name: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  created_at: string;
};

/** Admin — read deduplicated email send log + summary stats. */
export const getEmailActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => querySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertEmailStaff(userId);

    const now = Date.now();
    const ms = data.range === "24h" ? 864e5 : data.range === "30d" ? 30 * 864e5 : 7 * 864e5;
    const since = new Date(now - ms).toISOString();

    const { data: rows, error } = await supabaseAdmin
      .from("email_send_log")
      .select("id, message_id, template_name, recipient_email, status, error_message, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000);

    if (error) throw new Error(error.message);

    // Deduplicate to latest status per message_id (rows already sorted desc).
    const seen = new Set<string>();
    let latest: LogRow[] = [];
    for (const r of (rows as LogRow[]) ?? []) {
      const key = r.message_id ?? r.id;
      if (seen.has(key)) continue;
      seen.add(key);
      latest.push(r);
    }

    const templates = Array.from(new Set(latest.map((r) => r.template_name))).sort();

    const stats = {
      total: latest.length,
      sent: latest.filter((r) => r.status === "sent").length,
      pending: latest.filter((r) => r.status === "pending").length,
      failed: latest.filter((r) => ["failed", "dlq", "bounced", "complained"].includes(r.status)).length,
      suppressed: latest.filter((r) => r.status === "suppressed").length,
    };

    if (data.template) latest = latest.filter((r) => r.template_name === data.template);
    if (data.status) {
      latest = latest.filter((r) =>
        data.status === "failed"
          ? ["failed", "dlq", "bounced", "complained"].includes(r.status)
          : r.status === data.status,
      );
    }

    return {
      stats,
      templates,
      logs: latest.slice(0, data.limit),
    };
  });

const opsSchema = z.object({
  range: z.enum(["24h", "7d", "30d"]).default("7d"),
  limit: z.number().int().min(1).max(200).default(100),
});

type FailedRow = {
  id: string;
  message_id: string | null;
  template_name: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  created_at: string;
};

type SuppressedRow = {
  id: string;
  email: string;
  reason: string;
  created_at: string;
};

/** Admin — failed send retries (DLQ / failed / bounced) + suppression list. */
export const getEmailOps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => opsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertEmailStaff(userId);

    const ms = data.range === "24h" ? 864e5 : data.range === "30d" ? 30 * 864e5 : 7 * 864e5;
    const since = new Date(Date.now() - ms).toISOString();

    const FAILURE_STATUSES = ["failed", "dlq", "bounced", "complained"];

    const [logRes, supRes] = await Promise.all([
      supabaseAdmin
        .from("email_send_log")
        .select("id, message_id, template_name, recipient_email, status, error_message, created_at")
        .gte("created_at", since)
        .in("status", FAILURE_STATUSES)
        .order("created_at", { ascending: false })
        .limit(2000),
      supabaseAdmin
        .from("suppressed_emails")
        .select("id, email, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(2000),
    ]);

    if (logRes.error) throw new Error(logRes.error.message);
    if (supRes.error) throw new Error(supRes.error.message);

    // Deduplicate failures to latest status per message_id.
    const seen = new Set<string>();
    const failed: FailedRow[] = [];
    for (const r of (logRes.data as FailedRow[]) ?? []) {
      const key = r.message_id ?? r.id;
      if (seen.has(key)) continue;
      seen.add(key);
      failed.push(r);
    }

    const suppressed = (supRes.data as SuppressedRow[]) ?? [];

    const failureStats = {
      total: failed.length,
      dlq: failed.filter((r) => r.status === "dlq").length,
      bounced: failed.filter((r) => r.status === "bounced").length,
      complained: failed.filter((r) => r.status === "complained").length,
      failed: failed.filter((r) => r.status === "failed").length,
    };

    const suppressionStats = {
      total: suppressed.length,
      unsubscribe: suppressed.filter((r) => r.reason === "unsubscribe").length,
      bounce: suppressed.filter((r) => r.reason === "bounce").length,
      complaint: suppressed.filter((r) => r.reason === "complaint").length,
    };

    return {
      failureStats,
      suppressionStats,
      failed: failed.slice(0, data.limit),
      suppressed: suppressed.slice(0, data.limit),
    };
  });

type QueueRow = {
  queue: string;
  queued: number;
  in_flight: number;
  dlq: number;
  archived: number;
};

/** Admin — live pgmq email queue depths (queued / in-flight / DLQ / archived). */
export const getEmailQueueStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    await assertEmailStaff(userId);

    const { data, error } = await supabaseAdmin.rpc("email_queue_status");
    if (error) throw new Error(error.message);

    const queues = (data as QueueRow[] | null) ?? [];
    const totals = queues.reduce(
      (acc, q) => ({
        queued: acc.queued + Number(q.queued ?? 0),
        in_flight: acc.in_flight + Number(q.in_flight ?? 0),
        dlq: acc.dlq + Number(q.dlq ?? 0),
        archived: acc.archived + Number(q.archived ?? 0),
      }),
      { queued: 0, in_flight: 0, dlq: 0, archived: 0 },
    );

    return { queues, totals, fetchedAt: new Date().toISOString() };
  });

const deliverySchema = z.object({
  range: z.enum(["24h", "7d", "30d", "all"]).default("30d"),
  search: z.string().trim().max(120).optional().nullable(),
  limit: z.number().int().min(1).max(100).default(40),
});

const EVENT_LABELS: Record<string, string> = {
  "order-confirmed": "Order confirmed",
  "payment-verified": "Payment verified",
  "order-shipped": "Shipped",
  "out-for-delivery": "Out for delivery",
  "order-delivered": "Delivered",
  "refund-processed": "Refund processed",
};

type DeliveryStatus = "sent" | "pending" | "failed" | "suppressed" | "not_sent";

function normaliseStatus(raw: string): DeliveryStatus {
  if (raw === "sent") return "sent";
  if (raw === "pending") return "pending";
  if (raw === "suppressed") return "suppressed";
  if (["failed", "dlq", "bounced", "complained"].includes(raw)) return "failed";
  return "not_sent";
}

/** Admin — per-order email delivery status across each transactional event. */
export const getOrderEmailDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => deliverySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertEmailStaff(userId);

    let orderQuery = supabaseAdmin
      .from("orders")
      .select("id, contact_email, total, currency, status, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.range !== "all") {
      const ms = data.range === "24h" ? 864e5 : data.range === "30d" ? 30 * 864e5 : 7 * 864e5;
      orderQuery = orderQuery.gte("created_at", new Date(Date.now() - ms).toISOString());
    }
    if (data.search) {
      const term = data.search.trim();
      orderQuery = orderQuery.or(`id.eq.${term},contact_email.ilike.%${term}%`);
    }

    const { data: orders, error } = await orderQuery;
    if (error) throw new Error(error.message);
    const orderRows = orders ?? [];

    // Build the full set of candidate message_ids (orderId × event) and the
    // reverse map back to (orderId, event).
    const idToOrderEvent = new Map<string, { orderId: string; event: string }>();
    for (const o of orderRows) {
      for (const ev of ORDER_EMAIL_EVENTS) {
        idToOrderEvent.set(orderEmailMessageId(o.id as string, ev), { orderId: o.id as string, event: ev });
      }
    }

    const allIds = Array.from(idToOrderEvent.keys());
    const logByKey = new Map<string, { status: string; error_message: string | null; created_at: string }>();

    if (allIds.length > 0) {
      const { data: logs, error: logErr } = await supabaseAdmin
        .from("email_send_log")
        .select("message_id, status, error_message, created_at")
        .in("message_id", allIds)
        .order("created_at", { ascending: false });
      if (logErr) throw new Error(logErr.message);

      // Rows are sorted desc — first seen per message_id is the latest.
      for (const row of logs ?? []) {
        const key = row.message_id as string;
        if (!key || logByKey.has(key)) continue;
        logByKey.set(key, {
          status: row.status as string,
          error_message: (row.error_message as string | null) ?? null,
          created_at: row.created_at as string,
        });
      }
    }

    const ordersOut = orderRows.map((o) => {
      const events = ORDER_EMAIL_EVENTS.map((ev) => {
        const mid = orderEmailMessageId(o.id as string, ev);
        const log = logByKey.get(mid);
        return {
          event: ev,
          label: EVENT_LABELS[ev] ?? ev,
          status: log ? normaliseStatus(log.status) : ("not_sent" as DeliveryStatus),
          error: log?.error_message ?? null,
          at: log?.created_at ?? null,
        };
      });
      return {
        id: o.id as string,
        number: String(o.id).slice(0, 8).toUpperCase(),
        recipient: (o.contact_email as string | null) ?? null,
        orderStatus: (o.status as string | null) ?? null,
        createdAt: o.created_at as string,
        events,
      };
    });

    const totals = { sent: 0, pending: 0, failed: 0, suppressed: 0, not_sent: 0 };
    for (const o of ordersOut) {
      for (const e of o.events) totals[e.status] += 1;
    }

    return { orders: ordersOut, totals, events: ORDER_EMAIL_EVENTS.map((ev) => ({ event: ev, label: EVENT_LABELS[ev] })) };
  });

const deliverabilitySchema = z.object({
  range: z.enum(["7d", "30d", "90d"]).default("30d"),
});

type DeliverRow = {
  message_id: string | null;
  id: string;
  status: string;
  created_at: string;
};

/** Admin — bounce/complaint/delivery rates bucketed over time. */
export const getEmailDeliverability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => deliverabilitySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertEmailStaff(userId);

    const days = data.range === "7d" ? 7 : data.range === "90d" ? 90 : 30;
    const since = new Date(Date.now() - days * 864e5).toISOString();

    const { data: rows, error } = await supabaseAdmin
      .from("email_send_log")
      .select("id, message_id, status, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(10000);

    if (error) throw new Error(error.message);

    // Deduplicate to latest status per message_id.
    const seen = new Set<string>();
    const latest: DeliverRow[] = [];
    for (const r of (rows as DeliverRow[]) ?? []) {
      const key = r.message_id ?? r.id;
      if (seen.has(key)) continue;
      seen.add(key);
      latest.push(r);
    }

    // Bucket by day (or week for 90d).
    const weekly = data.range === "90d";
    const bucketMs = weekly ? 7 * 864e5 : 864e5;
    const buckets = new Map<
      string,
      { ts: number; sent: number; bounced: number; complained: number; failed: number; total: number }
    >();

    const keyFor = (iso: string) => {
      const t = new Date(iso).getTime();
      const bucketStart = Math.floor(t / bucketMs) * bucketMs;
      return { key: new Date(bucketStart).toISOString().slice(0, 10), ts: bucketStart };
    };

    let totalSent = 0, totalBounced = 0, totalComplained = 0, totalFailed = 0, totalAttempted = 0;

    for (const r of latest) {
      // "Attempted" = anything that left the queue (not pending/suppressed).
      if (r.status === "pending" || r.status === "suppressed") continue;
      const { key, ts } = keyFor(r.created_at);
      const b = buckets.get(key) ?? { ts, sent: 0, bounced: 0, complained: 0, failed: 0, total: 0 };
      b.total += 1;
      totalAttempted += 1;
      if (r.status === "sent") { b.sent += 1; totalSent += 1; }
      else if (r.status === "bounced") { b.bounced += 1; totalBounced += 1; }
      else if (r.status === "complained") { b.complained += 1; totalComplained += 1; }
      else { b.failed += 1; totalFailed += 1; }
      buckets.set(key, b);
    }

    const series = Array.from(buckets.values())
      .sort((a, b) => a.ts - b.ts)
      .map((b) => ({
        date: new Date(b.ts).toISOString().slice(0, 10),
        sent: b.sent,
        bounced: b.bounced,
        complained: b.complained,
        failed: b.failed,
        total: b.total,
        deliveryRate: b.total ? +((b.sent / b.total) * 100).toFixed(1) : 0,
        bounceRate: b.total ? +((b.bounced / b.total) * 100).toFixed(1) : 0,
        complaintRate: b.total ? +((b.complained / b.total) * 100).toFixed(2) : 0,
      }));

    const pct = (n: number) => (totalAttempted ? +((n / totalAttempted) * 100).toFixed(2) : 0);

    return {
      series,
      bucket: weekly ? "week" : "day",
      totals: {
        attempted: totalAttempted,
        sent: totalSent,
        bounced: totalBounced,
        complained: totalComplained,
        failed: totalFailed,
        deliveryRate: pct(totalSent),
        bounceRate: pct(totalBounced),
        complaintRate: pct(totalComplained),
        failureRate: pct(totalFailed),
      },
    };
  });
