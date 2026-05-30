import { supabase } from "@/integrations/supabase/client";
import { includeSeedInAnalytics } from "@/lib/seed-filter";
import type { BlockRegion } from "@/lib/use-storefront-blocks";

export interface BlockStat {
  views: number;
  clicks: number;
  ctr: number;
  conversions: number;
  conversionRate: number;
  revenue: number;
  byRegion: Record<string, { views: number; clicks: number }>;
}

const EMPTY: BlockStat = {
  views: 0,
  clicks: 0,
  ctr: 0,
  conversions: 0,
  conversionRate: 0,
  revenue: 0,
  byRegion: {},
};

/**
 * Per-block engagement analytics. Reads the shared `analytics_events` feed and
 * filters by the block id stored in event metadata. Tracking is emitted by the
 * live storefront renderer via {@link trackBlockImpression}/{@link trackBlockClick}.
 */
export async function fetchBlockAnalytics(
  blockId: string,
  days = 30,
): Promise<BlockStat> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const includeSeed = await includeSeedInAnalytics();
  let query = supabase
    .from("analytics_events")
    .select("event,metadata")
    .in("event", ["block_impression", "block_click", "block_conversion"])
    .gte("created_at", since)
    .limit(10000);
  if (!includeSeed) query = query.eq("is_seeded", false);
  const { data, error } = await query;
  if (error || !data) return { ...EMPTY };

  const stat: BlockStat = { ...EMPTY, byRegion: {} };
  for (const row of data as { event: string; metadata: Record<string, unknown> | null }[]) {
    if (String(row.metadata?.block ?? "") !== blockId) continue;
    const region = String(row.metadata?.region ?? "all");
    const r = (stat.byRegion[region] ??= { views: 0, clicks: 0 });
    if (row.event === "block_impression") {
      stat.views += 1;
      r.views += 1;
    } else if (row.event === "block_click") {
      stat.clicks += 1;
      r.clicks += 1;
    } else if (row.event === "block_conversion") {
      stat.conversions += 1;
      stat.revenue += Number(row.metadata?.value ?? 0) || 0;
    }
  }
  stat.ctr = stat.views > 0 ? (stat.clicks / stat.views) * 100 : 0;
  stat.conversionRate = stat.clicks > 0 ? (stat.conversions / stat.clicks) * 100 : 0;
  return stat;
}

export function trackBlockImpression(blockId: string, region: BlockRegion) {
  void supabase.from("analytics_events").insert({
    event: "block_impression",
    metadata: { block: blockId, region },
  } as never);
}

export function trackBlockClick(blockId: string, region: BlockRegion) {
  void supabase.from("analytics_events").insert({
    event: "block_click",
    metadata: { block: blockId, region },
  } as never);
}
