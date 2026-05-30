/**
 * Staff-gated server functions for Marketing Automation control.
 *
 * All privileged automation RPCs are revoked from anon/authenticated at the
 * database level (P1-8). These server functions are the ONLY path: they
 * re-verify staff roles server-side, call the service_role-only `svc_*`
 * wrappers via the admin client, and write security audit entries.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff, logSecurity, adminRpc, type StaffRole } from "./admin-guard.server";

const MKT_RUN: StaffRole[] = ["admin", "super_admin", "manager", "editor"];
const MKT_CONTROLS: StaffRole[] = ["admin", "super_admin", "manager"];

/** Run Now — force a manual automation pass. */
export const runAutomationsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, MKT_RUN, "marketing.run_now", "marketing");
    const { data, error } = await adminRpc("svc_run_marketing_automations", {
      _actor: userId,
      p_force: true,
      p_triggered_by: "manual",
    });
    await logSecurity({
      actorId: userId, actorRole: primaryRole, action: "marketing.run_now",
      target: "marketing", success: !error,
      detail: error ? { error: error.message } : { summary: data },
    });
    if (error) throw new Error(error.message);
    return data;
  });

/** Retry a single failed execution. */
export const retryExecutionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ executionId: z.string().uuid() }).parse(input))
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, MKT_RUN, "marketing.retry", input.executionId);
    const { data, error } = await adminRpc("svc_retry_failed_execution", {
      _actor: userId,
      p_execution_id: input.executionId,
    });
    await logSecurity({
      actorId: userId, actorRole: primaryRole, action: "marketing.retry",
      target: input.executionId, success: !error,
      detail: error ? { error: error.message } : {},
    });
    if (error) throw new Error(error.message);
    return data;
  });

/** Retry all retryable failed executions. */
export const retryAllFailedFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, MKT_RUN, "marketing.retry_all", "marketing");
    const { data, error } = await adminRpc("svc_retry_all_failed_executions", { _actor: userId });
    await logSecurity({
      actorId: userId, actorRole: primaryRole, action: "marketing.retry_all",
      target: "marketing", success: !error,
      detail: error ? { error: error.message } : { result: data },
    });
    if (error) throw new Error(error.message);
    return data;
  });

/** Pause / Resume / Emergency Stop / Maintenance Mode controls. */
export const setAutomationSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      emergency_stop: z.boolean(),
      global_pause: z.boolean(),
      maintenance_mode: z.boolean(),
      reason: z.string().max(500).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, MKT_CONTROLS, "marketing.controls", "automation_settings");
    const { data, error } = await adminRpc("svc_set_automation_settings", {
      _actor: userId,
      p_emergency: input.emergency_stop,
      p_global: input.global_pause,
      p_maintenance: input.maintenance_mode,
    });
    await logSecurity({
      actorId: userId, actorRole: primaryRole, action: "marketing.controls",
      target: "automation_settings", success: !error,
      detail: {
        emergency_stop: input.emergency_stop,
        global_pause: input.global_pause,
        maintenance_mode: input.maintenance_mode,
        reason: input.reason ?? null,
        ...(error ? { error: error.message } : {}),
      },
    });
    if (error) throw new Error(error.message);
    return data;
  });
