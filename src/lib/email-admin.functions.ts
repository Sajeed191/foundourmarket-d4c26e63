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
