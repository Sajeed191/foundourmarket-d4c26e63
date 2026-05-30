import {
  getCampaignMetricsFn,
  getCampaignTimelineFn,
  createCampaignLinkFn,
  setCampaignSpendFn,
} from "@/lib/marketing-metrics.functions";

/** Raw row returned by the aggregation RPC. */
export type CampaignMetricRow = {
  campaign_id: string;
  name: string;
  campaign_type: string;
  status: string;
  spend: number;
  audience_size: number;
  launched_at: string | null;
  created_at: string;
  opens: number;
  clicks: number;
  last_conversions: number;
  last_revenue: number;
  first_conversions: number;
  first_revenue: number;
};

export type AttributionModel = "last" | "first";
export type TimeRange = "7d" | "30d" | "90d" | "365d";
export type AttrWindow = 1 | 7 | 30;

export type CampaignKpis = CampaignMetricRow & {
  conversions: number;
  revenue: number;
  roas: number; // revenue / spend
  cac: number; // spend / conversions
  cpa: number; // spend / conversions (per acquisition)
  conversionRate: number; // conversions / clicks
  clickRate: number; // clicks / opens
};

export type TimelinePoint = {
  day: string;
  opens: number;
  clicks: number;
  conversions: number;
  revenue: number;
};

function div(a: number, b: number): number {
  return b > 0 ? a / b : 0;
}

/** Derive ROAS/CAC/CPA/rates from a raw row using the chosen attribution model. */
export function toKpis(row: CampaignMetricRow, model: AttributionModel): CampaignKpis {
  const conversions = model === "last" ? row.last_conversions : row.first_conversions;
  const revenue = model === "last" ? row.last_revenue : row.first_revenue;
  return {
    ...row,
    conversions,
    revenue,
    roas: div(revenue, row.spend),
    cac: div(row.spend, conversions),
    cpa: div(row.spend, conversions),
    conversionRate: div(conversions, row.clicks),
    clickRate: div(row.clicks, row.opens),
  };
}

export async function fetchCampaignMetrics(
  range: TimeRange,
  attributionWindow: AttrWindow,
): Promise<CampaignMetricRow[]> {
  const rows = await getCampaignMetricsFn({ data: { range, attributionWindow } });
  return rows as unknown as CampaignMetricRow[];
}

export async function fetchCampaignTimeline(
  campaignId: string,
  range: TimeRange,
): Promise<TimelinePoint[]> {
  const rows = await getCampaignTimelineFn({ data: { campaignId, range } });
  return rows as unknown as TimelinePoint[];
}

export async function createCampaignLink(
  campaignId: string,
  targetUrl: string,
  label?: string | null,
): Promise<{ token: string; clickPath: string }> {
  return createCampaignLinkFn({ data: { campaignId, targetUrl, label: label ?? null } });
}

export async function setCampaignSpend(campaignId: string, spend: number): Promise<void> {
  await setCampaignSpendFn({ data: { campaignId, spend } });
}

/** Build a CSV export string from computed KPIs. */
export function metricsToCsv(rows: CampaignKpis[]): string {
  const headers = [
    "Campaign", "Type", "Status", "Spend", "Audience", "Opens", "Clicks",
    "Conversions", "Revenue", "ROAS", "CAC", "CPA", "Conversion Rate", "Click Rate",
  ];
  const lines = rows.map((r) =>
    [
      `"${r.name.replace(/"/g, '""')}"`,
      r.campaign_type,
      r.status,
      r.spend,
      r.audience_size,
      r.opens,
      r.clicks,
      r.conversions,
      r.revenue.toFixed(2),
      r.roas.toFixed(2),
      r.cac.toFixed(2),
      r.cpa.toFixed(2),
      (r.conversionRate * 100).toFixed(1) + "%",
      (r.clickRate * 100).toFixed(1) + "%",
    ].join(","),
  );
  return [headers.join(","), ...lines].join("\n");
}
