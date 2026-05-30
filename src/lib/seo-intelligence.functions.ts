/**
 * Staff-gated SEO Intelligence server functions (P2-C).
 *
 * Every call re-verifies staff roles server-side (admin-guard) and writes a
 * security audit entry. Heavy aggregation runs inside the service_role-only
 * SECURITY DEFINER RPC `svc_seo_intelligence`; live sitemap / broken-link
 * checks and Google Search Console pulls run server-side only. No simulated
 * metrics — every number derives from real rows or live HTTP checks.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff, logSecurity, adminRpc, type StaffRole } from "./admin-guard.server";
import { checkSitemap, fetchSearchConsole } from "./seo-intelligence.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SeoRaw, SitemapHealth } from "./seo-intelligence";

const ANALYTICS: StaffRole[] = ["admin", "super_admin", "manager", "editor"];

function sinceFromRange(range: "7d" | "30d" | "90d" | "365d"): string {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : 365;
  return new Date(Date.now() - days * 86400_000).toISOString();
}

async function getSiteUrl(): Promise<string> {
  const { data } = await supabaseAdmin.from("seo_settings").select("site_url").limit(1).maybeSingle();
  return (data?.site_url as string) || "https://foundourmarket.com";
}

/** Full SEO intelligence bundle: metadata audit, Search Console, revenue, sitemap health. */
export const getSeoIntelligenceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        range: z.enum(["7d", "30d", "90d", "365d"]).default("30d"),
        checkSitemap: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, ANALYTICS, "seo.intelligence", "seo");

    const { data: payload, error } = await adminRpc("svc_seo_intelligence", { p_since: sinceFromRange(data.range) });

    let sitemap: SitemapHealth | null = null;
    if (data.checkSitemap) {
      try {
        sitemap = (await checkSitemap(await getSiteUrl())) as SitemapHealth;
      } catch {
        sitemap = null;
      }
    }

    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: "seo.intelligence",
      target: "seo",
      success: !error,
      detail: { range: data.range, sitemap: !!sitemap },
    });

    if (error) throw new Error(error.message);
    return { intelligence: (payload ?? null) as SeoRaw | null, sitemap };
  });

/** Pull fresh Google Search Console data and persist a snapshot. */
export const syncSearchConsoleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ days: z.union([z.literal(7), z.literal(28), z.literal(90)]).default(28) }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, ANALYTICS, "seo.sync", "seo");

    const siteUrl = await getSiteUrl();
    const result = await fetchSearchConsole(siteUrl, data.days);

    if (!result.connected) {
      await logSecurity({ actorId: userId, actorRole: primaryRole, action: "seo.sync", target: "seo", success: false, detail: { reason: "not_connected" } });
      return { connected: false, inserted: 0, error: result.error };
    }
    if (result.error) {
      await logSecurity({ actorId: userId, actorRole: primaryRole, action: "seo.sync", target: "seo", success: false, detail: { error: result.error } });
      return { connected: true, inserted: 0, error: result.error };
    }

    const today = new Date().toISOString().slice(0, 10);
    // Replace today's snapshot so re-syncing is idempotent.
    await supabaseAdmin.from("seo_search_console").delete().eq("snapshot_date", today);

    const rows = [...result.query_rows, ...result.page_rows].map((r) => ({
      snapshot_date: today,
      dimension: r.dimension,
      keyword: r.keyword,
      page: r.page,
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    }));

    let inserted = 0;
    if (rows.length > 0) {
      const { error: insErr } = await supabaseAdmin.from("seo_search_console").insert(rows);
      if (insErr) {
        await logSecurity({ actorId: userId, actorRole: primaryRole, action: "seo.sync", target: "seo", success: false, detail: { error: insErr.message } });
        throw new Error(insErr.message);
      }
      inserted = rows.length;
    }

    await supabaseAdmin
      .from("seo_settings")
      .update({ last_sync_at: new Date().toISOString(), last_sync_status: `ok:${inserted}`, updated_at: new Date().toISOString() })
      .neq("id", "00000000-0000-0000-0000-000000000000");

    await logSecurity({ actorId: userId, actorRole: primaryRole, action: "seo.sync", target: "seo", success: true, detail: { inserted, days: data.days } });
    return { connected: true, inserted, error: undefined as string | undefined };
  });
