/**
 * Acquisition Intelligence engine (P2-B) — client-safe pure computation.
 *
 * Consumes the raw aggregate returned by `svc_acquisition_metrics` (all real
 * data) and derives KPIs, breakdown tables, attribution-model comparisons,
 * opportunity detection and actionable recommendations. No data is fabricated:
 * every value traces back to spend, attributed revenue, tracking events and
 * visitor touches.
 */
import { getAcquisitionMetricsFn } from "@/lib/acquisition-intelligence.functions";

export type TimeRange = "7d" | "30d" | "90d" | "365d";
export type AttrWindow = 1 | 7 | 30;
export type AttributionModel = "first" | "last" | "linear" | "time_decay";

export type DimensionRow = {
  key: string;
  id?: string | null;
  type?: string;
  revenue: number;
  orders: number;
  spend: number;
  visitors?: number;
};

export type AttributionRow = {
  campaign_id: string;
  key: string;
  type: string;
  spend: number;
  first_conversions: number;
  first_revenue: number;
  last_conversions: number;
  last_revenue: number;
  linear_conversions: number;
  linear_revenue: number;
  time_decay_conversions: number;
  time_decay_revenue: number;
};

export type AcquisitionRaw = {
  overall: { revenue: number; conversions: number; spend: number; aov: number };
  visitors: number;
  sessions: number;
  opens: number;
  clicks: number;
  new_orders: number;
  total_customer_orders: number;
  assisted_conversions: number;
  by_campaign: DimensionRow[];
  by_channel: DimensionRow[];
  by_source: DimensionRow[];
  by_medium: DimensionRow[];
  by_utm_campaign: DimensionRow[];
  by_country: DimensionRow[];
  by_region: DimensionRow[];
  by_device: DimensionRow[];
  attribution_models: AttributionRow[];
};

export type ExecutiveKpis = {
  revenue: number;
  spend: number;
  conversions: number;
  visitors: number;
  sessions: number;
  opens: number;
  clicks: number;
  roas: number;
  cac: number;
  cpa: number;
  conversionRate: number; // orders / visitors
  clickConversionRate: number; // orders / clicks
  revenuePerVisitor: number;
  revenuePerSession: number;
  aov: number;
  newCustomerRate: number;
  returningCustomerRate: number;
  assistedConversions: number;
};

function div(a: number, b: number): number {
  return b > 0 ? a / b : 0;
}

/** Fetch the raw acquisition aggregate via the staff-gated server function. */
export async function fetchAcquisition(
  range: TimeRange,
  attributionWindow: AttrWindow,
): Promise<AcquisitionRaw> {
  const raw = (await getAcquisitionMetricsFn({ data: { range, attributionWindow } })) as AcquisitionRaw | null;
  return (
    raw ?? {
      overall: { revenue: 0, conversions: 0, spend: 0, aov: 0 },
      visitors: 0, sessions: 0, opens: 0, clicks: 0,
      new_orders: 0, total_customer_orders: 0, assisted_conversions: 0,
      by_campaign: [], by_channel: [], by_source: [], by_medium: [],
      by_utm_campaign: [], by_country: [], by_region: [], by_device: [],
      attribution_models: [],
    }
  );
}

export function computeKpis(raw: AcquisitionRaw): ExecutiveKpis {
  const { revenue, conversions, spend, aov } = raw.overall;
  return {
    revenue,
    spend,
    conversions,
    visitors: raw.visitors,
    sessions: raw.sessions,
    opens: raw.opens,
    clicks: raw.clicks,
    roas: div(revenue, spend),
    cac: div(spend, conversions),
    cpa: div(spend, conversions),
    conversionRate: div(conversions, raw.visitors),
    clickConversionRate: div(conversions, raw.clicks),
    revenuePerVisitor: div(revenue, raw.visitors),
    revenuePerSession: div(revenue, raw.sessions),
    aov,
    newCustomerRate: div(raw.new_orders, raw.total_customer_orders),
    returningCustomerRate: div(raw.total_customer_orders - raw.new_orders, raw.total_customer_orders),
    assistedConversions: raw.assisted_conversions,
  };
}

/** Derived per-row KPIs for any breakdown dimension. */
export type DimensionKpi = DimensionRow & {
  roas: number;
  cac: number;
  cpa: number;
  aov: number;
  revenuePerVisitor: number;
};

export function withKpis(rows: DimensionRow[]): DimensionKpi[] {
  return rows.map((r) => ({
    ...r,
    roas: div(r.revenue, r.spend),
    cac: div(r.spend, r.orders),
    cpa: div(r.spend, r.orders),
    aov: div(r.revenue, r.orders),
    revenuePerVisitor: r.visitors ? div(r.revenue, r.visitors) : 0,
  }));
}

export const MODEL_LABEL: Record<AttributionModel, string> = {
  first: "First-touch",
  last: "Last-touch",
  linear: "Linear",
  time_decay: "Time-decay",
};

export function modelValue(r: AttributionRow, model: AttributionModel): { conversions: number; revenue: number } {
  switch (model) {
    case "first": return { conversions: r.first_conversions, revenue: r.first_revenue };
    case "last": return { conversions: r.last_conversions, revenue: r.last_revenue };
    case "linear": return { conversions: r.linear_conversions, revenue: r.linear_revenue };
    case "time_decay": return { conversions: r.time_decay_conversions, revenue: r.time_decay_revenue };
  }
}

/* ------------------------------ Opportunities ----------------------------- */

export type Opportunity = {
  id: string;
  kind:
    | "best_roas" | "worst_roas" | "highest_cac" | "lowest_cac"
    | "growing_channel" | "declining_channel"
    | "high_spend_low_return" | "hidden_winner";
  severity: "positive" | "warning" | "critical" | "info";
  title: string;
  detail: string;
  recommendation: string;
  metric: string;
};

const money = (n: number) => "$" + new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Math.round(n));
const x = (n: number) => n.toFixed(2) + "×";

/**
 * Detect acquisition opportunities purely from computed real metrics and
 * generate actionable recommendations.
 */
export function detectOpportunities(raw: AcquisitionRaw): Opportunity[] {
  const out: Opportunity[] = [];
  const camps = withKpis(raw.by_campaign).filter((c) => c.id); // attributable only
  const channels = withKpis(raw.by_channel);
  const spending = camps.filter((c) => c.spend > 0);

  // Best ROAS campaign
  const best = [...spending].sort((a, b) => b.roas - a.roas)[0];
  if (best && best.roas > 0) {
    out.push({
      id: "best-" + best.id, kind: "best_roas", severity: "positive",
      title: `Best ROAS: ${best.key}`,
      detail: `${x(best.roas)} return on ${money(best.spend)} spend (${money(best.revenue)} revenue).`,
      recommendation: `Scale budget on “${best.key}” — it is your most efficient acquisition channel. Increase spend gradually while ROAS holds above target.`,
      metric: x(best.roas),
    });
  }

  // Worst ROAS campaign (with meaningful spend)
  const worst = [...spending].filter((c) => c.spend >= (best?.spend ?? 0) * 0.1).sort((a, b) => a.roas - b.roas)[0];
  if (worst && worst.id !== best?.id) {
    out.push({
      id: "worst-" + worst.id, kind: "worst_roas", severity: worst.roas < 1 ? "critical" : "warning",
      title: `Worst ROAS: ${worst.key}`,
      detail: `${x(worst.roas)} return on ${money(worst.spend)} spend.`,
      recommendation: worst.roas < 1
        ? `“${worst.key}” is losing money (ROAS below 1×). Pause or re-target before spending more.`
        : `Optimise creative/audience on “${worst.key}” or reallocate budget to higher-ROAS campaigns.`,
      metric: x(worst.roas),
    });
  }

  // Highest / lowest CAC source
  const sources = withKpis(raw.by_source).filter((s) => s.spend > 0 && s.orders > 0);
  const hiCac = [...sources].sort((a, b) => b.cac - a.cac)[0];
  const loCac = [...sources].sort((a, b) => a.cac - b.cac)[0];
  if (hiCac) {
    out.push({
      id: "hicac-" + hiCac.key, kind: "highest_cac", severity: "warning",
      title: `Highest CAC source: ${hiCac.key}`,
      detail: `${money(hiCac.cac)} to acquire each customer.`,
      recommendation: `Investigate “${hiCac.key}” — high acquisition cost erodes margin. Tighten targeting or shift budget toward “${loCac?.key ?? "lower-CAC"}”.`,
      metric: money(hiCac.cac),
    });
  }
  if (loCac && loCac.key !== hiCac?.key) {
    out.push({
      id: "locac-" + loCac.key, kind: "lowest_cac", severity: "positive",
      title: `Lowest CAC source: ${loCac.key}`,
      detail: `Only ${money(loCac.cac)} per acquired customer.`,
      recommendation: `Double down on “${loCac.key}” — cheapest acquisition source. Expand reach here first.`,
      metric: money(loCac.cac),
    });
  }

  // High spend / low return
  const totalSpend = raw.overall.spend;
  const drain = spending.find((c) => c.spend > totalSpend * 0.2 && c.roas < 1.5);
  if (drain) {
    out.push({
      id: "drain-" + drain.id, kind: "high_spend_low_return", severity: "critical",
      title: `High spend, low return: ${drain.key}`,
      detail: `Consumes ${money(drain.spend)} (${((drain.spend / totalSpend) * 100).toFixed(0)}% of spend) at only ${x(drain.roas)}.`,
      recommendation: `Reallocate budget away from “${drain.key}”. A large share of spend is producing weak returns.`,
      metric: x(drain.roas),
    });
  }

  // Hidden winner: strong ROAS but tiny spend share
  const hidden = spending.find((c) => c.roas >= Math.max(2, (best?.roas ?? 0) * 0.6) && c.spend < totalSpend * 0.08 && c.id !== best?.id);
  if (hidden) {
    out.push({
      id: "hidden-" + hidden.id, kind: "hidden_winner", severity: "info",
      title: `Hidden winner: ${hidden.key}`,
      detail: `Strong ${x(hidden.roas)} ROAS but only ${money(hidden.spend)} invested.`,
      recommendation: `Test scaling “${hidden.key}” — it punches above its weight and is under-funded.`,
      metric: x(hidden.roas),
    });
  }

  // Channel leaders / laggards (relative efficiency)
  const chSorted = channels.filter((c) => c.spend > 0).sort((a, b) => b.roas - a.roas);
  if (chSorted.length >= 2) {
    const lead = chSorted[0];
    const lag = chSorted[chSorted.length - 1];
    out.push({
      id: "growch-" + lead.key, kind: "growing_channel", severity: "positive",
      title: `Top channel: ${lead.key}`,
      detail: `${x(lead.roas)} ROAS — your most efficient channel.`,
      recommendation: `Prioritise “${lead.key}” in the channel mix.`,
      metric: x(lead.roas),
    });
    if (lag.key !== lead.key && lag.roas < 1.5) {
      out.push({
        id: "declch-" + lag.key, kind: "declining_channel", severity: "warning",
        title: `Weak channel: ${lag.key}`,
        detail: `${x(lag.roas)} ROAS — underperforming the channel mix.`,
        recommendation: `Review “${lag.key}” spend; consider shifting to “${lead.key}”.`,
        metric: x(lag.roas),
      });
    }
  }

  return out;
}

/* --------------------------------- Export --------------------------------- */

export function dimensionToCsv(title: string, rows: DimensionKpi[]): string {
  const headers = [title, "Revenue", "Orders", "Spend", "ROAS", "CAC", "CPA", "AOV"];
  const lines = rows.map((r) =>
    [
      `"${String(r.key).replace(/"/g, '""')}"`,
      r.revenue.toFixed(2), r.orders, r.spend.toFixed(2),
      r.roas.toFixed(2), r.cac.toFixed(2), r.cpa.toFixed(2), r.aov.toFixed(2),
    ].join(","),
  );
  return [headers.join(","), ...lines].join("\n");
}

export function attributionToCsv(rows: AttributionRow[]): string {
  const headers = [
    "Campaign", "Type", "Spend",
    "First Conv", "First Rev", "Last Conv", "Last Rev",
    "Linear Conv", "Linear Rev", "TimeDecay Conv", "TimeDecay Rev",
  ];
  const lines = rows.map((r) =>
    [
      `"${r.key.replace(/"/g, '""')}"`, r.type, r.spend.toFixed(2),
      r.first_conversions.toFixed(2), r.first_revenue.toFixed(2),
      r.last_conversions.toFixed(2), r.last_revenue.toFixed(2),
      r.linear_conversions.toFixed(2), r.linear_revenue.toFixed(2),
      r.time_decay_conversions.toFixed(2), r.time_decay_revenue.toFixed(2),
    ].join(","),
  );
  return [headers.join(","), ...lines].join("\n");
}
