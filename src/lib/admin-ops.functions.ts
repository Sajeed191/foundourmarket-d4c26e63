/**
 * Staff-gated server functions for admin operational dashboards.
 *
 * `admin_order_operations`, `admin_staff_performance` and `admin_user_directory`
 * are revoked from anon/authenticated at the DB level (P1-8). These read-only
 * server functions re-verify staff roles and call the service_role-only
 * `svc_*` wrappers via the admin client.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff, adminRpc, logSecurity, type StaffRole } from "./admin-guard.server";

const OPS_STAFF: StaffRole[] = [
  "admin", "super_admin", "manager", "support", "fulfillment", "warehouse_staff",
];
const DIR_STAFF: StaffRole[] = ["admin", "super_admin", "manager", "support", "editor"];

/** Order operations aggregate (war room, KPIs, fulfilment, etc.). */
export const getOrderOpsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ limit: z.number().int().min(1).max(1000).optional() }).parse(input),
  )
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    await requireStaff(userId, OPS_STAFF, "ops.order_operations");
    const { data, error } = await adminRpc("svc_admin_order_operations", {
      _actor: userId,
      _limit: input.limit ?? 400,
    });
    if (error) {
      console.error("[admin_order_operations] rpc error", error.message);
      throw new Error(error.message);
    }
    return data;
  });

/** Staff performance aggregate. */
export const getStaffPerformanceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    await requireStaff(userId, OPS_STAFF, "ops.staff_performance");
    const { data, error } = await adminRpc("svc_admin_staff_performance", { _actor: userId });
    if (error) throw new Error(error.message);
    return data;
  });

/** Customer & staff directory (user intelligence). */
export const getUserDirectoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    await requireStaff(userId, DIR_STAFF, "ops.user_directory");
    const { data, error } = await adminRpc("svc_admin_user_directory", { _actor: userId });
    if (error) throw new Error(error.message);
    return data;
  });
