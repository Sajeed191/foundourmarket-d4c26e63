/**
 * Server-only admin guard & audit helpers.
 *
 * Used exclusively by `*.functions.ts` server functions to re-verify staff
 * roles on every privileged action (never trust client role state) and to
 * write tamper-proof authorization audit entries.
 *
 * NEVER import this from client code — it pulls in the service-role client.
 */
import { getRequestHeader } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type StaffRole =
  | "admin"
  | "super_admin"
  | "manager"
  | "editor"
  | "support"
  | "fulfillment"
  | "warehouse_staff";

/** Fetch all roles assigned to a user (server-trusted, bypasses RLS). */
export async function getRoles(userId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error("Could not verify permissions.");
  return (data ?? []).map((r) => r.role as string);
}

/** Best-effort source IP from the incoming request. */
export function clientIp(): string | null {
  try {
    const xff = getRequestHeader("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim();
    return getRequestHeader("x-real-ip") ?? null;
  } catch {
    return null;
  }
}

export type SecurityAuditEntry = {
  actorId: string | null;
  actorRole: string | null;
  action: string;
  target?: string | null;
  success: boolean;
  detail?: Record<string, unknown>;
};

/** Append an authorization/security audit record. Never throws. */
export async function logSecurity(entry: SecurityAuditEntry): Promise<void> {
  try {
    await supabaseAdmin.from("security_audit_log").insert({
      actor_id: entry.actorId,
      actor_role: entry.actorRole,
      action: entry.action,
      target: entry.target ?? null,
      source_ip: clientIp(),
      success: entry.success,
      detail: (entry.detail ?? {}) as never,
    });
  } catch {
    // Auditing must never break the request path.
  }
}

/**
 * Re-verify that `userId` holds at least one of the `allowed` staff roles.
 * Logs and throws (with an audit entry) on failure. Returns the matched
 * primary role and the full role list on success.
 */
export async function requireStaff(
  userId: string,
  allowed: StaffRole[],
  action: string,
  target?: string | null,
): Promise<{ roles: string[]; primaryRole: string }> {
  const roles = await getRoles(userId);
  const matched = roles.filter((r) => (allowed as string[]).includes(r));
  if (matched.length === 0) {
    await logSecurity({
      actorId: userId,
      actorRole: roles[0] ?? null,
      action,
      target,
      success: false,
      detail: { reason: "forbidden", attemptedRoles: roles },
    });
    throw new Error("You are not authorised to perform this action.");
  }
  return { roles, primaryRole: matched[0]! };
}

/** Loosely-typed admin RPC caller (svc_* wrappers aren't in generated types). */
export const adminRpc = supabaseAdmin.rpc as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;
