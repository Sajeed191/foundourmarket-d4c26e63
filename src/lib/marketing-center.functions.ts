/**
 * Marketing Automation & Growth Center — staff-gated server functions.
 *
 * Only `super_admin`, `admin` and `manager` may read growth intelligence.
 * All metrics are aggregated server-side by the `svc_marketing_intelligence`
 * SECURITY DEFINER RPC over real tables (orders, order_items, carts,
 * cart_items, products, profiles, wishlist, promo_codes, refunds, returns,
 * newsletter_subscribers, marketing_campaigns, marketing_automations,
 * automation_executions, campaign_events, notifications). Every read and
 * export is written to the security audit log. No mock data, no hard-coded
 * campaigns.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff, adminRpc, logSecurity, type StaffRole } from "./admin-guard.server";

const MK_STAFF: StaffRole[] = ["super_admin", "admin", "manager"];

export type MarketingIntelligence = {
  segments: {
    total_customers: number; buyers: number; new: number; returning: number;
    frequent: number; vip: number; high_ltv: number; dormant: number;
    abandoned_cart: number; refund_risk: number; high_return: number;
    newsletter: number; vip_threshold: number; avg_ltv: number;
  };
  segments_by_country: { k: string; customers: number; revenue: number }[];
  segments_by_city: { k: string; orders: number }[];
  abandoned: {
    bucket_30m: number; bucket_24h: number; bucket_3d: number; total_carts: number;
    value_at_risk: number; recovery_sent: number; recovered_orders: number; recovered_revenue: number;
  };
  top_carts: { user_id: string; name: string; value: number; item_count: number; hours_idle: number }[];
  coupons: {
    code: string; kind: string; value: number; active: boolean; uses: number;
    max_uses: number | null; expires_at: string | null; expired: boolean;
    order_count: number; revenue: number; discount_given: number;
  }[];
  products: {
    most_viewed: { slug: string; name: string; views_count: number }[];
    most_wishlisted: { slug: string; name: string; wishes: number }[];
    trending: { slug: string; name: string; units: number; revenue: number }[];
    dead: { slug: string; name: string; views_count: number; stock_quantity: number }[];
    needs_promotion: { slug: string; name: string; views_count: number; stock_quantity: number; units_sold: number }[];
  };
  campaigns: {
    total: number; active: number; scheduled: number; draft: number; spend: number; audience: number;
    list: { id: string; name: string; campaign_type: string; status: string; audience_size: number; spend: number; scheduled_at: string | null; launched_at: string | null }[];
  };
  automations: {
    total: number; enabled: number;
    list: { id: string; name: string; automation_type: string; trigger_key: string; channel: string; enabled: boolean; status: string; last_run_at: string | null; runs: number }[];
  };
  engagement: {
    opens: number; clicks: number; notifications_30d: number; notifications_read: number;
    by_type: { k: string; n: number; read: number }[];
  };
  generated_at: string;
};

/** Full growth-center payload aggregated from real records. */
export const getMarketingIntelligenceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, MK_STAFF, "marketing.growth.view");

    const { data, error } = await adminRpc("svc_marketing_intelligence", { _actor: userId });
    if (error) {
      console.error("[svc_marketing_intelligence] rpc error", error.message);
      throw new Error(error.message);
    }

    await logSecurity({ actorId: userId, actorRole: primaryRole, action: "marketing.growth.view", success: true });
    return data as MarketingIntelligence;
  });

/** Record a growth-report export action in the security audit log. */
export const logMarketingExportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ format: z.enum(["csv", "xlsx", "pdf"]), report: z.string().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, MK_STAFF, "marketing.growth.export");
    await logSecurity({
      actorId: userId, actorRole: primaryRole, action: "marketing.growth.export",
      success: true, detail: { format: data.format, report: data.report },
    });
    return { ok: true };
  });
