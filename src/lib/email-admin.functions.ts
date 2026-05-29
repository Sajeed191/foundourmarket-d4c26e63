import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
