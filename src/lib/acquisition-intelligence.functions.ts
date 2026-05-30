/**
 * Staff-gated Acquisition Intelligence server function (P2-B).
 *
 * Re-verifies staff roles server-side on every call (admin-guard) and writes a
 * security audit entry. The heavy aggregation runs inside a service_role-only
 * SECURITY DEFINER RPC (`svc_acquisition_metrics`) so privileged data never
 * touches the client and direct RPC access is impossible for non-staff.
 *
 * Every number returned is derived from real rows:
 *   - spend          → marketing_campaigns.spend (real recorded ad spend)
 *   - revenue        → order_attributions.revenue (real attributed orders)
 *   - opens/clicks   → campaign_events (real tracking pixel / redirect events)
 *   - visitors       → attribution_touches (real UTM capture)
 * No simulated or hard-coded metrics exist in this path.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff, logSecurity, adminRpc, type StaffRole } from "./admin-guard.server";

const ANALYTICS: StaffRole[] = ["admin", "super_admin", "manager", "editor"];

function sinceFromRange(range: "7d" | "30d" | "90d" | "365d"): string {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : 365;
  return new Date(Date.now() - days * 86400_000).toISOString();
}

export const getAcquisitionMetricsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        range: z.enum(["7d", "30d", "90d", "365d"]).default("30d"),
        attributionWindow: z.union([z.literal(1), z.literal(7), z.literal(30)]).default(30),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, ANALYTICS, "acquisition.metrics", "acquisition");
    const { data: payload, error } = await adminRpc("svc_acquisition_metrics", {
      p_since: sinceFromRange(data.range),
      p_window_days: data.attributionWindow,
    });
    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: "acquisition.metrics",
      target: "acquisition",
      success: !error,
      detail: { range: data.range, window: data.attributionWindow },
    });
    if (error) throw new Error(error.message);
    return (payload ?? null) as unknown;
  });
