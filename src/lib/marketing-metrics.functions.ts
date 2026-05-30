/**
 * Staff-gated marketing metrics server functions (P2-A).
 *
 * All campaign analytics, link generation and exports go through here. Every
 * call re-verifies staff roles server-side (admin-guard) and writes a security
 * audit entry. Aggregation runs via service_role-only SECURITY DEFINER RPCs.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireStaff, logSecurity, adminRpc, type StaffRole } from "./admin-guard.server";

const ANALYTICS: StaffRole[] = ["admin", "super_admin", "manager", "editor"];
const LINK_MANAGE: StaffRole[] = ["admin", "super_admin", "manager"];

function sinceFromRange(range: "7d" | "30d" | "90d" | "365d"): string {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : 365;
  return new Date(Date.now() - days * 86400_000).toISOString();
}

/** Aggregated campaign metrics for a time range + attribution window. */
export const getCampaignMetricsFn = createServerFn({ method: "POST" })
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
    const { primaryRole } = await requireStaff(userId, ANALYTICS, "marketing.metrics", "marketing");
    const { data: rows, error } = await adminRpc("svc_campaign_metrics", {
      p_since: sinceFromRange(data.range),
      p_window_days: data.attributionWindow,
    });
    await logSecurity({
      actorId: userId, actorRole: primaryRole, action: "marketing.metrics",
      target: "marketing", success: !error,
      detail: { range: data.range, window: data.attributionWindow },
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{ campaign_id: string; name: string; campaign_type: string; status: string; spend: number; audience_size: number; launched_at: string | null; created_at: string; opens: number; clicks: number; last_conversions: number; last_revenue: number; first_conversions: number; first_revenue: number; }>;
  });

/** Day-by-day timeline for a single campaign. */
export const getCampaignTimelineFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        campaignId: z.string().uuid(),
        range: z.enum(["7d", "30d", "90d", "365d"]).default("30d"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await requireStaff(userId, ANALYTICS, "marketing.timeline", data.campaignId);
    const { data: rows, error } = await adminRpc("svc_campaign_timeline", {
      p_campaign: data.campaignId,
      p_since: sinceFromRange(data.range),
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{ day: string; opens: number; clicks: number; conversions: number; revenue: number; }>;
  });

/** Register a trackable campaign link; returns the click-tracking URL. */
export const createCampaignLinkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        campaignId: z.string().uuid(),
        targetUrl: z.string().url().max(2000),
        label: z.string().max(120).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, LINK_MANAGE, "marketing.link_create", data.campaignId);

    const token = crypto.randomUUID().replace(/-/g, "");
    // Bake utm + campaign id into the destination so the landing page can
    // record a real attribution touch.
    const target = new URL(data.targetUrl);
    target.searchParams.set("utm_source", "campaign");
    target.searchParams.set("utm_medium", "email");
    target.searchParams.set("utm_campaign", data.campaignId);
    target.searchParams.set("fom_cid", data.campaignId);

    const { error } = await supabaseAdmin.from("campaign_links").insert({
      campaign_id: data.campaignId,
      token,
      label: data.label ?? null,
      target_url: target.toString(),
      utm: {
        utm_source: "campaign",
        utm_medium: "email",
        utm_campaign: data.campaignId,
      } as never,
    });
    await logSecurity({
      actorId: userId, actorRole: primaryRole, action: "marketing.link_create",
      target: data.campaignId, success: !error,
    });
    if (error) throw new Error(error.message);
    return { token, clickPath: `/api/public/track/click?t=${token}` };
  });

/** Update a campaign's recorded spend (for ROAS/CAC/CPA). */
export const setCampaignSpendFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ campaignId: z.string().uuid(), spend: z.number().min(0).max(1e12) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, LINK_MANAGE, "marketing.set_spend", data.campaignId);
    const { error } = await supabaseAdmin
      .from("marketing_campaigns")
      .update({ spend: data.spend })
      .eq("id", data.campaignId);
    await logSecurity({
      actorId: userId, actorRole: primaryRole, action: "marketing.set_spend",
      target: data.campaignId, success: !error, detail: { spend: data.spend },
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
