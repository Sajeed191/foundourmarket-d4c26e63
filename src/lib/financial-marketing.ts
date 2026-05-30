import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/components/admin/AdminShell";
import {
  fetchFinancialData, computeSummary, productProfitability,
  type FinancialData, type OrderRec, type Summary,
} from "@/lib/financial-metrics";
import {
  fetchCustomerIntel, buildCustomerIntel, segmentStats, regionalStats,
  type CustomerIntel, type Region,
} from "@/lib/customer-intelligence";
import {
  createCampaign, launchCampaign, pauseCampaign, completeCampaign,
  campaignRates, fmtCurrency,
  type Campaign, type RegionScope,
} from "@/lib/marketing-automation";
import { mapCampaignRow } from "@/lib/inventory-marketing";

/**
 * Financial ↔ Marketing Integration.
 *
 * Makes every marketing decision profit-driven, not revenue-driven. EVERY
 * figure here is derived from real database records:
 *   - orders / order_items / products → revenue, COGS, profit, margin
 *   - returns → refund + reverse-logistics costs
 *   - payments → settlement signals
 *   - marketing_campaigns → real campaign revenue / profit / cost / ROI / ROAS
 *   - customer intelligence → segment + customer profitability
 *
 * No simulated financial intelligence — unavailable signals are derived from
 * real averages or reported as zero, never fabricated.
 */

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

const PAID = new Set(["paid", "captured", "succeeded", "completed"]);
const isPaid = (o: OrderRec) =>
  PAID.has((o.payment_status ?? "").toLowerCase()) ||
  ["delivered", "shipped", "processing", "completed"].includes(o.status);

const regionOf = (o: OrderRec): Region =>
  (o.shipping_address?.country || "").toLowerCase() === "india" ? "india" : "international";

const isCompletedReturn = (r: { status: string; refund_status: string }) =>
  r.refund_status === "completed" || r.status === "completed" || r.status === "approved";

/* --------------------------------------------------------------- data load */

export type FinancialMarketingData = {
  financial: FinancialData;
  campaigns: Campaign[];
  customers: CustomerIntel[];
};

export async function fetchFinancialMarketing(days = 365): Promise<FinancialMarketingData> {
  const [financial, campRes, custData] = await Promise.all([
    fetchFinancialData(days),
    supabase.from("marketing_campaigns").select("*").order("created_at", { ascending: false }),
    fetchCustomerIntel(),
  ]);
  return {
    financial,
    campaigns: ((campRes.data as Record<string, unknown>[]) ?? []).map(mapCampaignRow),
    customers: buildCustomerIntel(custData),
  };
}

/* ------------------------------------------------------- profit analytics */

export type ProfitAnalytics = {
  revenue: number;
  profit: number;        // gross profit (revenue - cogs)
  grossMargin: number;   // %
  netMargin: number;     // %
  marketingSpend: number; // campaign cost across active/completed
  returnCosts: number;    // estimated reverse-logistics (real avg shipping × completed returns)
  refundCosts: number;    // refunded amount
  supportCosts: number;   // not tracked as currency → 0 (support load reported separately)
  campaignCosts: number;  // = marketingSpend
  netContribution: number; // profit after all marketing + operational costs
  cogs: number;
  shipping: number;
  tax: number;
  supportTickets: number; // real support load
};

export function computeProfitAnalytics(d: FinancialMarketingData): ProfitAnalytics {
  const s: Summary = computeSummary(d.financial);

  const live = d.campaigns.filter((c) => c.status === "active" || c.status === "completed");
  const marketingSpend = live.reduce((a, c) => a + c.metrics.cost, 0);

  // reverse-logistics estimate from real averages
  const paidOrders = d.financial.orders.filter(isPaid);
  const avgShipping = paidOrders.length ? s.shipping / paidOrders.length : 0;
  const completedReturns = d.financial.returns.filter(isCompletedReturn).length;
  const returnCosts = avgShipping * completedReturns;

  const supportTickets = d.customers.reduce((a, c) => a + (c.supportTickets ?? 0), 0);

  const netContribution = s.netEarnings - marketingSpend - returnCosts;

  return {
    revenue: s.revenue,
    profit: s.grossProfit,
    grossMargin: s.revenue > 0 ? (s.grossProfit / s.revenue) * 100 : 0,
    netMargin: s.revenue > 0 ? (netContribution / s.revenue) * 100 : 0,
    marketingSpend,
    returnCosts,
    refundCosts: s.refunds,
    supportCosts: 0,
    campaignCosts: marketingSpend,
    netContribution,
    cogs: s.cogs,
    shipping: s.shipping,
    tax: s.tax,
    supportTickets,
  };
}

/* ---------------------------------------------------- campaign profitability */

export type CampaignProfit = {
  id: string;
  name: string;
  status: Campaign["status"];
  region: RegionScope;
  revenue: number;
  profit: number;
  orders: number;
  customers: number;
  cost: number;
  roi: number;     // profit / cost
  roas: number;    // revenue / cost
  margin: number;  // profit / revenue (%)
  conversionRate: number;
};

export function campaignProfitability(campaigns: Campaign[]): CampaignProfit[] {
  return campaigns
    .filter((c) => c.metrics.revenue > 0 || c.metrics.cost > 0)
    .map((c) => {
      const r = campaignRates(c);
      const m = c.metrics;
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        region: c.region,
        revenue: m.revenue,
        profit: m.profit,
        orders: m.orders,
        customers: m.conversions,
        cost: m.cost,
        roi: r.roi,
        roas: m.cost > 0 ? m.revenue / m.cost : 0,
        margin: m.revenue > 0 ? (m.profit / m.revenue) * 100 : 0,
        conversionRate: r.conversionRate,
      };
    })
    .sort((a, b) => b.profit - a.profit);
}

/* ---------------------------------------------------- customer profitability */

export type CustomerProfitability = {
  topCustomers: CustomerIntel[];
  mostProfitableSegments: { segment: string; profit: number; revenue: number; count: number }[];
  leastProfitableSegments: { segment: string; profit: number; revenue: number; count: number }[];
  refundHeavy: CustomerIntel[];
  supportHeavy: CustomerIntel[];
  vipProfit: number;
  vipShare: number; // % of total profit from VIPs
};

export function customerProfitability(customers: CustomerIntel[]): CustomerProfitability {
  const segs = segmentStats(customers).filter((s) => s.count > 0);
  const byProfit = [...segs].sort((a, b) => b.profit - a.profit);
  const totalProfit = customers.reduce((a, c) => a + c.profit, 0);
  const vip = customers.filter((c) => c.tags.includes("VIP" as never));
  const vipProfit = vip.reduce((a, c) => a + c.profit, 0);

  return {
    topCustomers: [...customers].filter((c) => c.profit > 0).sort((a, b) => b.profit - a.profit).slice(0, 8),
    mostProfitableSegments: byProfit.slice(0, 4),
    leastProfitableSegments: [...byProfit].reverse().slice(0, 4),
    refundHeavy: customers.filter((c) => c.tags.includes("Refund Heavy" as never)).sort((a, b) => b.refundRate - a.refundRate).slice(0, 6),
    supportHeavy: customers.filter((c) => (c.supportTickets ?? 0) >= 3).sort((a, b) => b.supportTickets - a.supportTickets).slice(0, 6),
    vipProfit,
    vipShare: totalProfit > 0 ? (vipProfit / totalProfit) * 100 : 0,
  };
}

/* ----------------------------------------------------- product profitability */

export type ProductProfitRegion = { slug: string; name: string; profit: number; margin: number; units: number };

export type ProductProfitabilityResult = {
  mostProfitable: { slug: string; name: string; profit: number; margin: number; units: number; revenue: number }[];
  highestMargin: { slug: string; name: string; profit: number; margin: number; units: number; revenue: number }[];
  lowestMargin: { slug: string; name: string; profit: number; margin: number; units: number; revenue: number }[];
  profitPerOrder: number;
  profitPerCustomer: number;
  byRegion: { region: Region; profit: number; revenue: number; top: ProductProfitRegion | null }[];
};

export function productProfitabilityReport(d: FinancialMarketingData): ProductProfitabilityResult {
  const all = productProfitability(d.financial); // top by profit (capped to 8 inside util)
  const withMargin = all.filter((p) => p.revenue > 0);
  const s = computeSummary(d.financial);
  const customers = new Set<string>();
  let orders = 0;
  for (const o of d.financial.orders) {
    if (!isPaid(o)) continue;
    orders += 1;
    const k = (o.user_id || o.contact_email || "").toLowerCase();
    if (k) customers.add(k);
  }

  // per-region profit from order items
  const costMap = new Map(d.financial.products.map((p) => [p.slug, Number(p.cost) || 0]));
  const regionAgg = new Map<Region, { profit: number; revenue: number; products: Map<string, ProductProfitRegion> }>();
  for (const region of ["india", "international"] as Region[])
    regionAgg.set(region, { profit: 0, revenue: 0, products: new Map() });
  for (const o of d.financial.orders) {
    if (!isPaid(o)) continue;
    const region = regionOf(o);
    const agg = regionAgg.get(region)!;
    for (const it of o.order_items ?? []) {
      const slug = it.product_slug ?? it.name;
      const qty = it.quantity ?? 0;
      const rev = Number(it.line_total) || (Number(it.unit_price) || 0) * qty;
      const profit = rev - (costMap.get(it.product_slug ?? "") ?? 0) * qty;
      agg.profit += profit;
      agg.revenue += rev;
      const rec = agg.products.get(slug) ?? { slug, name: it.name, profit: 0, margin: 0, units: 0 };
      rec.profit += profit; rec.units += qty;
      agg.products.set(slug, rec);
    }
  }

  return {
    mostProfitable: all.slice(0, 6),
    highestMargin: [...withMargin].sort((a, b) => b.margin - a.margin).slice(0, 6),
    lowestMargin: [...withMargin].sort((a, b) => a.margin - b.margin).slice(0, 6),
    profitPerOrder: orders > 0 ? s.grossProfit / orders : 0,
    profitPerCustomer: customers.size > 0 ? s.grossProfit / customers.size : 0,
    byRegion: (["india", "international"] as Region[]).map((region) => {
      const agg = regionAgg.get(region)!;
      const top = [...agg.products.values()].sort((a, b) => b.profit - a.profit)[0] ?? null;
      return { region, profit: agg.profit, revenue: agg.revenue, top };
    }),
  };
}

/* ----------------------------------------------------- regional profitability */

export type RegionalProfit = {
  region: Region;
  revenue: number;
  profit: number;
  margin: number;
  orders: number;
  customers: number;
  campaignRoi: number;
};

export function regionalProfitability(d: FinancialMarketingData): RegionalProfit[] {
  const costMap = new Map(d.financial.products.map((p) => [p.slug, Number(p.cost) || 0]));
  const custStats = regionalStats(d.customers);

  return (["india", "international"] as Region[]).map((region) => {
    let revenue = 0, cogs = 0, orders = 0;
    const customers = new Set<string>();
    for (const o of d.financial.orders) {
      if (!isPaid(o) || regionOf(o) !== region) continue;
      revenue += Number(o.total) || 0;
      orders += 1;
      const k = (o.user_id || o.contact_email || "").toLowerCase();
      if (k) customers.add(k);
      cogs += (o.order_items ?? []).reduce((sum, it) => sum + (costMap.get(it.product_slug ?? "") ?? 0) * (it.quantity ?? 0), 0);
    }
    const profit = revenue - cogs;

    const camps = d.campaigns.filter((c) => (c.region === region || c.region === "all") && (c.status === "active" || c.status === "completed"));
    const cCost = camps.reduce((a, c) => a + c.metrics.cost, 0);
    const cProfit = camps.reduce((a, c) => a + c.metrics.profit, 0);

    const fallbackCust = custStats.find((s) => s.region === region)?.customers ?? 0;

    return {
      region,
      revenue,
      profit,
      margin: revenue > 0 ? (profit / revenue) * 100 : 0,
      orders,
      customers: customers.size || fallbackCust,
      campaignRoi: cCost > 0 ? cProfit / cCost : 0,
    };
  });
}

/* ------------------------------------------------ financial marketing score */

export type FinancialMarketingScore = {
  profit: number;
  margin: number;
  roi: number;
  roas: number;
  efficiency: number;
  growth: number;
  risk: number;
};

export function financialMarketingScore(
  pa: ProfitAnalytics,
  campaigns: CampaignProfit[],
  d: FinancialMarketingData,
): FinancialMarketingScore {
  const cost = campaigns.reduce((a, c) => a + c.cost, 0);
  const camProfit = campaigns.reduce((a, c) => a + c.profit, 0);
  const camRevenue = campaigns.reduce((a, c) => a + c.revenue, 0);
  const roi = cost > 0 ? camProfit / cost : 0;
  const roas = cost > 0 ? camRevenue / cost : 0;

  // growth: last 90d revenue vs prior 90d (real orders)
  const now = Date.now();
  const DAY = 86_400_000;
  let recent = 0, prior = 0;
  for (const o of d.financial.orders) {
    if (!isPaid(o)) continue;
    const t = +new Date(o.created_at);
    const total = Number(o.total) || 0;
    if (t >= now - 90 * DAY) recent += total;
    else if (t >= now - 180 * DAY) prior += total;
  }
  const growthPct = prior > 0 ? (recent - prior) / prior : recent > 0 ? 1 : 0;

  const refundRate = pa.revenue > 0 ? (pa.refundCosts / pa.revenue) * 100 : 0;
  const losers = campaigns.filter((c) => c.cost > 0 && c.roi < 0).length;

  return {
    profit: clamp(pa.netContribution > 0 ? Math.min(100, (pa.netContribution / Math.max(1, pa.revenue)) * 200) : 0),
    margin: clamp(pa.netMargin * 2.5),
    roi: clamp(50 + roi * 16),
    roas: clamp(roas * 22),
    efficiency: clamp(pa.marketingSpend > 0 ? (pa.netContribution / pa.marketingSpend) * 12 : pa.netContribution > 0 ? 70 : 40),
    growth: clamp(50 + growthPct * 50),
    risk: clamp(refundRate * 3 + losers * 18 + (pa.netMargin < 0 ? 40 : 0)),
  };
}

/* ------------------------------------------------------- recommendations */

export type FinRecAction =
  | "increase_spend" | "reduce_spend" | "pause" | "scale" | "feature_product"
  | "increase_margin" | "reduce_discounts" | "bundle" | "vip_campaign" | "retention_campaign";

export type FinancialRecommendation = {
  id: string;
  action: FinRecAction;
  title: string;
  detail: string;
  tone: "danger" | "warn" | "good" | "info";
  impact: number;
  template?: string;
  campaignId?: string;
  slugs?: string[];
};

export function buildFinancialRecommendations(
  d: FinancialMarketingData,
  campaigns: CampaignProfit[],
  prod: ProductProfitabilityResult,
  cust: CustomerProfitability,
): FinancialRecommendation[] {
  const out: FinancialRecommendation[] = [];

  for (const c of campaigns) {
    if (c.cost > 0 && c.roi >= 3 && (c.status === "active" || c.status === "completed"))
      out.push({ id: `frec-scale-${c.id}`, action: "scale", tone: "good", title: `Scale "${c.name}"`, detail: `ROI ${c.roi.toFixed(1)}× (ROAS ${c.roas.toFixed(1)}×). Increase budget to capture more profit.`, impact: c.profit, campaignId: c.id });
    if (c.cost > 0 && c.roi < 0 && c.status === "active")
      out.push({ id: `frec-pause-${c.id}`, action: "pause", tone: "danger", title: `Pause "${c.name}"`, detail: `Losing money (ROI ${c.roi.toFixed(2)}×). Pause to protect margin.`, impact: Math.abs(c.profit), campaignId: c.id });
    if (c.cost > 0 && c.roi > 0 && c.roi < 1 && c.status === "active")
      out.push({ id: `frec-reduce-${c.id}`, action: "reduce_spend", tone: "warn", title: `Reduce spend on "${c.name}"`, detail: `Spend exceeds profit (ROI ${c.roi.toFixed(2)}×). Trim budget.`, impact: c.cost, campaignId: c.id });
    if (c.cost > 0 && c.roi >= 1.5 && c.roi < 3)
      out.push({ id: `frec-incr-${c.id}`, action: "increase_spend", tone: "good", title: `Increase spend on "${c.name}"`, detail: `Healthy ROI ${c.roi.toFixed(1)}× with headroom to grow.`, impact: c.profit, campaignId: c.id });
  }

  const margin = prod.highestMargin.filter((p) => p.margin >= 40);
  if (margin.length)
    out.push({ id: "frec-feature", action: "feature_product", tone: "good", template: "high_margin", title: "Feature high-margin products", detail: `${margin.length} products carry 40%+ margin. Feature them to lift profit.`, impact: margin.reduce((a, p) => a + p.profit, 0), slugs: margin.map((p) => p.slug) });

  const lowMargin = prod.lowestMargin.filter((p) => p.margin > 0 && p.margin < 15);
  if (lowMargin.length)
    out.push({ id: "frec-margin", action: "increase_margin", tone: "warn", title: "Raise margins on thin-profit products", detail: `${lowMargin.length} products sell under 15% margin. Reprice or cut costs.`, impact: lowMargin.reduce((a, p) => a + p.revenue, 0), slugs: lowMargin.map((p) => p.slug) });

  if (cust.vipProfit > 0)
    out.push({ id: "frec-vip", action: "vip_campaign", tone: "good", template: "vip_rewards", title: "Launch VIP profit campaign", detail: `VIPs drive ${fmt(cust.vipProfit)} profit (${cust.vipShare.toFixed(0)}% of total). Reward to retain.`, impact: cust.vipProfit });

  const atRisk = cust.mostProfitableSegments.find((s) => s.segment === "At Risk");
  if (atRisk && atRisk.profit > 0)
    out.push({ id: "frec-retention", action: "retention_campaign", tone: "warn", template: "at_risk_save", title: "Protect at-risk profit", detail: `At-risk customers hold ${fmt(atRisk.profit)} profit. Launch retention.`, impact: atRisk.profit });

  // discount drag: heavy discounting eroding margin
  const summary = computeSummary(d.financial);
  if (summary.revenue > 0 && summary.discount / summary.revenue > 0.12)
    out.push({ id: "frec-discount", action: "reduce_discounts", tone: "warn", title: "Reduce discounting", detail: `Discounts are ${((summary.discount / summary.revenue) * 100).toFixed(0)}% of revenue — eroding profit.`, impact: summary.discount });

  if (margin.length >= 2)
    out.push({ id: "frec-bundle", action: "bundle", tone: "info", template: "high_margin", title: "Bundle high-margin products", detail: `Pair high-margin items into bundles to raise average order profit.`, impact: margin.slice(0, 4).reduce((a, p) => a + p.profit, 0), slugs: margin.slice(0, 4).map((p) => p.slug) });

  return out.sort((a, b) => b.impact - a.impact);
}

/* --------------------------------------------------------------- alerts */

export type FinancialMarketingAlert = {
  id: string;
  severity: "high" | "medium" | "low";
  kind: "negative_roi" | "margin_collapse" | "high_refund" | "campaign_loss" | "profit_opportunity" | "regional_opportunity";
  title: string;
  detail: string;
  campaignId?: string;
};

export function detectFinancialMarketingAlerts(
  pa: ProfitAnalytics,
  campaigns: CampaignProfit[],
  regions: RegionalProfit[],
): FinancialMarketingAlert[] {
  const out: FinancialMarketingAlert[] = [];

  for (const c of campaigns) {
    if (c.cost > 0 && c.roi < 0)
      out.push({ id: `fa-roi-${c.id}`, severity: "high", kind: "negative_roi", title: `Negative ROI — ${c.name}`, detail: `Losing ${fmt(Math.abs(c.profit))} (ROI ${c.roi.toFixed(2)}×).`, campaignId: c.id });
    else if (c.cost > 0 && c.profit < 0)
      out.push({ id: `fa-loss-${c.id}`, severity: "high", kind: "campaign_loss", title: `Campaign loss — ${c.name}`, detail: `Profit is ${fmt(c.profit)}. Review or pause.`, campaignId: c.id });
  }

  if (pa.revenue > 0 && pa.netMargin < 5)
    out.push({ id: "fa-margin", severity: pa.netMargin < 0 ? "high" : "medium", kind: "margin_collapse", title: pa.netMargin < 0 ? "Net margin negative" : "Margin under pressure", detail: `Net margin is ${pa.netMargin.toFixed(1)}% after all marketing & operational costs.` });

  const refundRate = pa.revenue > 0 ? (pa.refundCosts / pa.revenue) * 100 : 0;
  if (refundRate > 8)
    out.push({ id: "fa-refund", severity: "medium", kind: "high_refund", title: "High refund cost", detail: `Refunds are ${refundRate.toFixed(1)}% of revenue (${fmt(pa.refundCosts)}).` });

  const winners = campaigns.filter((c) => c.cost > 0 && c.roi >= 3);
  if (winners.length)
    out.push({ id: "fa-opp", severity: "low", kind: "profit_opportunity", title: "Profit opportunity", detail: `${winners.length} campaign(s) over 3× ROI — scale budget to capture more profit.` });

  const best = [...regions].filter((r) => r.profit > 0 && r.margin >= 25).sort((a, b) => b.margin - a.margin)[0];
  if (best)
    out.push({ id: `fa-region-${best.region}`, severity: "low", kind: "regional_opportunity", title: `Regional opportunity — ${best.region}`, detail: `${best.region} runs ${best.margin.toFixed(0)}% margin. Shift more budget here.` });

  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/* --------------------------------------------------------- executive KPIs */

export type ExecutiveKpis = {
  totalRevenue: number;
  totalProfit: number;
  netMargin: number;
  campaignProfit: number;
  topCampaign: CampaignProfit | null;
  topProduct: { name: string; profit: number } | null;
  topSegment: { segment: string; profit: number } | null;
};

export function executiveKpis(
  pa: ProfitAnalytics,
  campaigns: CampaignProfit[],
  prod: ProductProfitabilityResult,
  cust: CustomerProfitability,
): ExecutiveKpis {
  return {
    totalRevenue: pa.revenue,
    totalProfit: pa.netContribution,
    netMargin: pa.netMargin,
    campaignProfit: campaigns.reduce((a, c) => a + c.profit, 0),
    topCampaign: campaigns[0] ?? null,
    topProduct: prod.mostProfitable[0] ? { name: prod.mostProfitable[0].name, profit: prod.mostProfitable[0].profit } : null,
    topSegment: cust.mostProfitableSegments[0] ? { segment: cust.mostProfitableSegments[0].segment, profit: cust.mostProfitableSegments[0].profit } : null,
  };
}

/* ----------------------------------------------------- one-click actions */

export async function scaleCampaign(c: CampaignProfit, factor = 1.5): Promise<{ error?: string }> {
  const { data: row } = await supabase.from("marketing_campaigns").select("config").eq("id", c.id).single();
  const config = ((row?.config as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  const currentBudget = Number(config.budget) || c.cost || 0;
  const nextBudget = Math.round(currentBudget * factor);
  const { error } = await supabase.from("marketing_campaigns")
    .update({ config: { ...config, budget: nextBudget, scaled_from: currentBudget } } as never)
    .eq("id", c.id);
  if (error) return { error: error.message };
  logActivity("financial_marketing_scale", "marketing_campaign", c.id, { from: currentBudget, to: nextBudget, roi: c.roi });
  return {};
}

export async function pauseFinancialCampaign(id: string): Promise<{ error?: string }> {
  const res = await pauseCampaign(id);
  if (!res.error) logActivity("financial_marketing_pause", "marketing_campaign", id);
  return res;
}

export async function duplicateFinancialCampaign(c: CampaignProfit): Promise<{ id?: string; error?: string }> {
  const { data: row } = await supabase.from("marketing_campaigns").select("*").eq("id", c.id).single();
  const src = row as Record<string, unknown> | null;
  const res = await createCampaign({
    name: `${c.name} (copy)`,
    campaign_type: (src?.campaign_type as string) ?? "custom",
    region: (src?.region as RegionScope) ?? "all",
    segment: (src?.segment as string) ?? null,
    audience_size: Number(src?.audience_size) || 0,
    status: "draft",
    config: { ...((src?.config as Record<string, unknown>) ?? {}), duplicated_from: c.id },
  });
  if (res.error || !res.id) return { error: res.error ?? "Failed to duplicate" };
  logActivity("financial_marketing_duplicate", "marketing_campaign", res.id, { from: c.id });
  return { id: res.id };
}

/** Launch a profit-focused campaign from a recommendation (high-margin / VIP / retention). */
export async function launchProfitCampaign(opts: {
  template: string;
  recommendationId?: string;
  slugs?: string[];
  launch?: boolean;
}): Promise<{ id?: string; error?: string }> {
  const res = await createCampaign({
    name: `Profit Campaign — ${opts.template.replace(/_/g, " ")}`,
    campaign_type: `financial_${opts.template}`,
    status: opts.launch ? "active" : "draft",
    config: { source: "financial_intelligence", template: opts.template, product_slugs: opts.slugs ?? [] },
  });
  if (res.error || !res.id) return { error: res.error ?? "Failed to create campaign" };
  if (opts.launch) await launchCampaign(res.id);
  logActivity("financial_marketing_profit_campaign", "marketing_campaign", res.id, {
    template: opts.template, recommendation: opts.recommendationId, slugs: opts.slugs, launched: !!opts.launch,
  });
  return { id: res.id };
}

export async function completeFinancialCampaign(id: string): Promise<{ error?: string }> {
  const res = await completeCampaign(id);
  if (!res.error) logActivity("financial_marketing_complete", "marketing_campaign", id);
  return res;
}

export function rejectFinancialRecommendation(rec: FinancialRecommendation): void {
  logActivity("financial_marketing_reject", "recommendation", rec.id, { action: rec.action });
}

/* --------------------------------------------------------------- format */

export function fmt(n: number): string {
  return fmtCurrency(n, "india");
}

export const REC_TONE: Record<FinancialRecommendation["tone"], string> = {
  danger: "border-destructive/40 bg-destructive/5",
  warn: "border-amber-400/30 bg-amber-400/5",
  good: "border-emerald-400/30 bg-emerald-400/5",
  info: "border-border bg-white/[0.02]",
};

export type { Campaign, Region } from "@/lib/marketing-automation";
