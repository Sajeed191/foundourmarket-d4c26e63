/**
 * Staff-gated server function powering the admin System Health center.
 *
 * Returns database counts, referential-integrity issue counts (orphan
 * payments / order items / shipments) and operational error signals
 * (failed orders/payments, failed/pending emails) via the SECURITY DEFINER
 * `svc_database_health()` wrapper. Read-only; re-verifies staff on every call.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff, adminRpc, type StaffRole } from "./admin-guard.server";

const HEALTH_STAFF: StaffRole[] = ["admin", "super_admin", "manager"];

export type SystemHealth = {
  counts: {
    orders: number;
    payments: number;
    shipments: number;
    customers: number;
    products: number;
  };
  integrity: {
    orphan_payments: number;
    orphan_order_items: number;
    orphan_shipments: number;
  };
  errors: {
    failed_orders: number;
    failed_payments: number;
    failed_emails: number;
    pending_emails: number;
  };
};

export const getSystemHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    await requireStaff(userId, HEALTH_STAFF, "system.health.view");
    const { data, error } = await adminRpc("svc_database_health");
    if (error) {
      console.error("[system_health] rpc error", error.message);
      throw new Error(error.message);
    }
    return data as SystemHealth;
  });
