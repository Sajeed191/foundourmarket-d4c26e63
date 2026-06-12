/**
 * Staff-gated server function for the admin Returns & Refunds dashboard.
 *
 * Enriches each return with the requesting customer's details (name, email,
 * phone, shipping address) by joining orders/profiles via the service-role
 * admin client after re-verifying the caller's staff role.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireStaff, type StaffRole } from "./admin-guard.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RETURNS_STAFF: StaffRole[] = ["admin", "super_admin", "manager", "support"];

export type AdminReturnRow = {
  id: string;
  order_id: string;
  user_id: string;
  status: string;
  reason: string;
  notes: string | null;
  refund_amount: number;
  refund_status: string;
  created_at: string;
  photo_urls: string[] | null;
  return_items: { id: string; product_slug: string; quantity: number; reason: string | null }[];
  customer: {
    name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
  };
  order: {
    currency: string | null;
    total: number | null;
    payment_status: string | null;
    fulfillment_status: string | null;
    order_status: string | null;
    created_at: string | null;
    fulfilled_at: string | null;
  };
};

export const getReturnsAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminReturnRow[]> => {
    const { userId } = context as { userId: string };
    await requireStaff(userId, RETURNS_STAFF, "ops.returns.list");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: returns, error } = await supabaseAdmin
      .from("returns")
      .select(
        "id,order_id,user_id,status,reason,notes,refund_amount,refund_status,created_at,return_items(id,product_slug,quantity,reason)",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = (returns ?? []) as Omit<AdminReturnRow, "customer">[];
    const orderIds = [...new Set(rows.map((r) => r.order_id))];
    const userIds = [...new Set(rows.map((r) => r.user_id))];

    const [{ data: orders }, { data: profiles }] = await Promise.all([
      supabaseAdmin.from("orders").select("id,contact_email,shipping_address").in("id", orderIds),
      supabaseAdmin.from("profiles").select("id,full_name,phone").in("id", userIds),
    ]);

    const orderMap = new Map((orders ?? []).map((o: any) => [o.id, o]));
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    return rows.map((r) => {
      const o: any = orderMap.get(r.order_id);
      const p: any = profileMap.get(r.user_id);
      const addr = o?.shipping_address ?? {};
      const addressParts = [addr.line1, addr.line2, addr.city, addr.state, addr.postal, addr.country]
        .filter(Boolean)
        .join(", ");
      return {
        ...r,
        customer: {
          name: addr.full_name || p?.full_name || null,
          email: o?.contact_email || null,
          phone: addr.phone || p?.phone || null,
          address: addressParts || null,
        },
      };
    });
  });
