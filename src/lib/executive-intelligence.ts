import { supabase } from "@/integrations/supabase/client";
import {
  computeSummary, type FinancialData,
} from "@/lib/financial-metrics";
import type { Region } from "@/lib/customer-intelligence";
import {
  computeProfitAnalytics, campaignProfitability, customerProfitability,
  productProfitabilityReport, regionalProfitability, executiveKpis,
  financialMarketingScore, buildFinancialRecommendations, detectFinancialMarketingAlerts,
  type FinancialMarketingData, type CampaignProfit, type RegionalProfit,
  type FinancialRecommendation, type FinancialMarketingAlert,
} from "@/lib/financial-marketing";
import { inventoryFinancials } from "@/lib/use-financial-marketing";

/**
 * Executive Business Intelligence engine.
 *
 * Single CEO-level source of truth. Every figure is derived from real
 * database records (orders / order_items / products / returns / payments /
 * page_views / marketing_campaigns / customers / admin_activity_logs).
 * No simulated executive analytics — missing signals resolve to real
 * averages or zero, never fabricated.
 */

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const DAY = 86_400_000;

const PAID = new Set(["paid", "captured", "succeeded", "completed"]);
const isPaid = (o: { payment_status?: string; status: string }) =>
  PAID.has((o.payment_status ?? "").toLowerCase()) ||
  ["delivered", "shipped", "processing", "completed"].includes(o.status);

const isCompletedReturn = (r: { status: string; refund_status: string }) =>
  r.refund_status === "completed" || r.status === "completed" || r.status === "approved";

/* ----------------------------------------------------------- scorecard */

export type ExecutiveScorecard = {
  revenue: number;
  profit: number;            // net contribution
  netMargin: number;         // %
  orders: number;            // paid orders
  customers: number;
  conversionRate: number;    // %
  aov: number;
  ltv: number;
  inventoryValue: number;
  roi: number;               // campaign ROI ×
  growth: number;            // % vs prior 90d
};

function growthPct(d: FinancialData): number {
  const now = Date.now();
  let recent = 0, prior = 0;
  for (const o of d.orders) {
    if (!isPaid(o)) continue;
    const t = +new Date(o.created_at);
    const total = Number(o.total) || 0;
    if (t >= now - 90 * DAY) recent += total;
    else if (t >= now - 180 * DAY) prior += total;
  }
  return prior > 0 ? ((recent - prior) / prior) * 100 : recent > 0 ? 100 : 0;
}

/* ------------------------------------------------------- business health */

export type HealthBand = "low" | "medium" | "high";

export type BusinessHealth = {
  revenue: number;
  profit: number;
  customer: number;
  inventory: number;
  marketing: number;
  support: number;
  storefront: number;
  overall: number;
  trend: number;       // overall trend signal derived from growth (%)
  risk: HealthBand;    // risk level (inverse of health)
};

/* ------------------------------------------------------------- drivers */

export type DriverRow = { label: string; value: number; sub?: string };

export type ProfitDrivers = {
  products: DriverRow[];
  categories: DriverRow[];
  campaigns: DriverRow[];
  segments: DriverRow[];
  regions: DriverRow[];
};

export type LossDrivers = {
  products: DriverRow[];
  campaigns: DriverRow[];
  refundSources: DriverRow[];
  supportCostDrivers: DriverRow[];
  inventoryLoss: DriverRow[];
};

/* --------------------------------------------------------- opportunities */

export type Opportunity = {
  id: string;
  kind:
    | "increase_spend" | "vip_campaign" | "restock" | "clear_dead_stock"
    | "feature_high_margin" | "recover_at_risk" | "bundle" | "regional_expansion";
  title: string;
  detail: string;
  impact: number;
  to?: string;             // deep link for one-click navigation
  campaignId?: string;
  rec?: FinancialRecommendation;
};

export type ExecRisk = {
  id: string;
  kind:
    | "margin_collapse" | "inventory_risk" | "stockouts" | "refund_spike"
    | "support_spike" | "campaign_loss" | "customer_churn" | "dead_inventory";
  title: string;
  detail: string;
  severity: HealthBand;
  to?: string;
  campaignId?: string;
};

/* ------------------------------------------------------------ AI insights */

export type AIInsight = {
  id: string;
  whatHappened: string;
  whyHappened: string;
  whatToDo: string;
  expectedImpact: string;
  confidence: number;       // 0-100
  tone: "good" | "warn" | "danger" | "info";
};

/* ----------------------------------------------------------- the model */

export type ExecutiveModel = {
  currency: string;
  scorecard: ExecutiveScorecard;
  health: BusinessHealth;
  opportunities: Opportunity[];
  risks: ExecRisk[];
  profitDrivers: ProfitDrivers;
  lossDrivers: LossDrivers;
  regions: RegionalProfit[];
  insights: AIInsight[];
  alerts: FinancialMarketingAlert[];
  topCampaigns: CampaignProfit[];
  worstCampaigns: CampaignProfit[];
};

export function computeExecutiveModel(data: FinancialMarketingData): ExecutiveModel {
  const d = data.financial;
  const summary = computeSummary(d);
  const pa = computeProfitAnalytics(data);
  const campaigns = campaignProfitability(data.campaigns);
  const custProf = customerProfitability(data.customers);
  const products = productProfitabilityReport(data);
  const regions = regionalProfitability(data);
  const kpis = executiveKpis(pa, campaigns, products, custProf);
  const score = financialMarketingScore(pa, campaigns, data);
  const recs = buildFinancialRecommendations(data, campaigns, products, custProf);
  const alerts = detectFinancialMarketingAlerts(pa, campaigns, regions);
  const inv = inventoryFinancials(data);

  const views = d.pageViews.length;
  const conversionRate = views > 0 ? (summary.paidOrders / views) * 100 : 0;
  const customers = data.customers.length;
  const ltv = customers > 0 ? summary.revenue / customers : 0;
  const roi = pa.marketingSpend > 0 ? kpis.campaignProfit / pa.marketingSpend : 0;
  const growth = growthPct(d);

  const scorecard: ExecutiveScorecard = {
    revenue: summary.revenue,
    profit: pa.netContribution,
    netMargin: pa.netMargin,
    orders: summary.paidOrders,
    customers,
    conversionRate,
    aov: summary.aov,
    ltv,
    inventoryValue: inv?.inventoryValue ?? 0,
    roi,
    growth,
  };

  /* ---- health ---- */
  const repeatCustomers = data.customers.filter((c) => (c.ordersCount ?? 0) > 1).length;
  const repeatRate = customers > 0 ? (repeatCustomers / customers) * 100 : 0;
  const profitableShare = customers > 0
    ? (data.customers.filter((c) => c.profit > 0).length / customers) * 100 : 0;
  const refundRate = summary.revenue > 0 ? (summary.refunds / summary.revenue) * 100 : 0;
  const supportPerCustomer = customers > 0 ? pa.supportTickets / customers : 0;
  const invRiskRatio = (inv && inv.inventoryValue > 0) ? (inv.profitAtRisk / inv.inventoryValue) * 100 : 0;

  const revenueHealth = clamp(50 + growth * 0.6 + (summary.revenue > 0 ? 10 : -40));
  const profitHealth = clamp(score.profit * 0.6 + score.margin * 0.4);
  const customerHealth = clamp(profitableShare * 0.5 + repeatRate * 0.6 + 15);
  const inventoryHealth = clamp(100 - invRiskRatio * 1.2);
  const marketingHealth = clamp(score.roi * 0.55 + score.efficiency * 0.45);
  const supportHealth = clamp(100 - supportPerCustomer * 120);
  const storefrontHealth = clamp(conversionRate * 22 + (summary.aov > 0 ? 18 : 0));
  const overall = clamp(
    revenueHealth * 0.2 + profitHealth * 0.22 + customerHealth * 0.16 +
    inventoryHealth * 0.12 + marketingHealth * 0.14 + supportHealth * 0.08 +
    storefrontHealth * 0.08,
  );

  const health: BusinessHealth = {
    revenue: revenueHealth,
    profit: profitHealth,
    customer: customerHealth,
    inventory: inventoryHealth,
    marketing: marketingHealth,
    support: supportHealth,
    storefront: storefrontHealth,
    overall,
    trend: growth,
    risk: overall >= 70 ? "low" : overall >= 50 ? "medium" : "high",
  };

  /* ---- opportunities (8 types) ---- */
  const opportunities: Opportunity[] = [];
  const winner = campaigns.find((c) => c.cost > 0 && c.roi >= 2);
  if (winner)
    opportunities.push({ id: `opp-spend-${winner.id}`, kind: "increase_spend", title: `Increase ad spend — ${winner.name}`, detail: `ROI ${winner.roi.toFixed(1)}× with headroom. Scale budget to capture more profit.`, impact: winner.profit, campaignId: winner.id, to: "/admin-financial?view=campaigns" });
  if (custProf.vipProfit > 0)
    opportunities.push({ id: "opp-vip", kind: "vip_campaign", title: "Launch VIP campaign", detail: `VIPs hold ${custProf.vipShare.toFixed(0)}% of profit. Reward to retain spend.`, impact: custProf.vipProfit, to: "/admin-customer-intelligence?view=vip" });
  if (inv && inv.restockRoi > 0 && products.mostProfitable[0])
    opportunities.push({ id: "opp-restock", kind: "restock", title: `Restock bestseller — ${products.mostProfitable[0].name}`, detail: `Restock ROI ${inv.restockRoi.toFixed(1)}×. Reinvest in top sellers before stockout.`, impact: products.mostProfitable[0].profit, to: "/admin-inventory-intelligence?view=opportunities" });
  if (inv && inv.deadStockLoss > 0)
    opportunities.push({ id: "opp-clear", kind: "clear_dead_stock", title: "Clear dead stock", detail: `Recover ~${(inv.clearanceImpact).toFixed(0)} via clearance on idle inventory.`, impact: inv.clearanceImpact, to: "/admin-inventory-intelligence?view=opportunities" });
  const hiMargin = products.highestMargin.filter((p) => p.margin >= 40);
  if (hiMargin.length)
    opportunities.push({ id: "opp-feature", kind: "feature_high_margin", title: "Feature high-margin product", detail: `${hiMargin.length} products carry 40%+ margin. Feature to lift profit.`, impact: hiMargin.reduce((a, p) => a + p.profit, 0), to: "/admin-products?view=marketing" });
  const atRisk = custProf.mostProfitableSegments.find((s) => s.segment === "At Risk");
  if (atRisk && atRisk.profit > 0)
    opportunities.push({ id: "opp-recover", kind: "recover_at_risk", title: "Recover at-risk customers", detail: `At-risk segment holds ${atRisk.profit.toFixed(0)} profit. Launch retention.`, impact: atRisk.profit, to: "/admin-customer-intelligence?view=risk" });
  if (hiMargin.length >= 2)
    opportunities.push({ id: "opp-bundle", kind: "bundle", title: "Bundle opportunity", detail: "Pair high-margin items into bundles to raise average order profit.", impact: hiMargin.slice(0, 3).reduce((a, p) => a + p.profit, 0), to: "/admin-marketing-automation?action=create" });
  const bestRegion = [...regions].filter((r) => r.profit > 0 && r.margin >= 20).sort((a, b) => b.margin - a.margin)[0];
  if (bestRegion)
    opportunities.push({ id: `opp-region-${bestRegion.region}`, kind: "regional_expansion", title: `Regional expansion — ${bestRegion.region}`, detail: `${bestRegion.region} runs ${bestRegion.margin.toFixed(0)}% margin. Shift budget here.`, impact: bestRegion.profit, to: "/admin-financial?view=regions" });
  opportunities.sort((a, b) => b.impact - a.impact);

  /* ---- risks (8 types) ---- */
  const risks: ExecRisk[] = [];
  if (pa.revenue > 0 && pa.netMargin < 8)
    risks.push({ id: "risk-margin", kind: "margin_collapse", title: pa.netMargin < 0 ? "Margin collapse" : "Margin under pressure", detail: `Net margin ${pa.netMargin.toFixed(1)}% after all costs.`, severity: pa.netMargin < 0 ? "high" : "medium", to: "/admin-financial?view=profit" });
  if (inv && invRiskRatio > 20)
    risks.push({ id: "risk-inv", kind: "inventory_risk", title: "Inventory risk", detail: `${invRiskRatio.toFixed(0)}% of inventory value at profit risk.`, severity: invRiskRatio > 40 ? "high" : "medium", to: "/admin-inventory-intelligence?view=risk" });
  const lowStock = d.products.filter((p) => Number(p.stock_quantity) <= Number(p.low_stock_threshold ?? 0) && Number(p.stock_quantity) >= 0).length;
  if (lowStock > 0)
    risks.push({ id: "risk-stockout", kind: "stockouts", title: "Stockout risk", detail: `${lowStock} products at or below reorder threshold.`, severity: lowStock > 5 ? "high" : "medium", to: "/admin-inventory-intelligence?view=risk" });
  if (refundRate > 8)
    risks.push({ id: "risk-refund", kind: "refund_spike", title: "Refund spike", detail: `Refunds are ${refundRate.toFixed(1)}% of revenue.`, severity: refundRate > 15 ? "high" : "medium", to: "/admin-returns" });
  if (pa.supportTickets > 0 && supportPerCustomer > 0.5)
    risks.push({ id: "risk-support", kind: "support_spike", title: "Support spike", detail: `${pa.supportTickets} open tickets (${supportPerCustomer.toFixed(1)}/customer).`, severity: supportPerCustomer > 1 ? "high" : "medium", to: "/admin-support" });
  const loser = campaigns.find((c) => c.cost > 0 && c.roi < 0);
  if (loser)
    risks.push({ id: `risk-camp-${loser.id}`, kind: "campaign_loss", title: `Campaign loss — ${loser.name}`, detail: `Losing money (ROI ${loser.roi.toFixed(2)}×). Pause to protect margin.`, severity: "high", campaignId: loser.id, to: "/admin-financial?view=campaigns" });
  if (atRisk && atRisk.count > 0)
    risks.push({ id: "risk-churn", kind: "customer_churn", title: "Customer churn", detail: `${atRisk.count} at-risk customers holding ${atRisk.profit.toFixed(0)} profit.`, severity: "medium", to: "/admin-customer-intelligence?view=risk" });
  if (inv && inv.deadStockLoss > 0)
    risks.push({ id: "risk-dead", kind: "dead_inventory", title: "Dead inventory", detail: `${(inv.deadStockLoss).toFixed(0)} capital locked in non-selling stock.`, severity: "medium", to: "/admin-inventory-intelligence?view=opportunities" });
  const rank = { high: 0, medium: 1, low: 2 };
  risks.sort((a, b) => rank[a.severity] - rank[b.severity]);

  /* ---- drivers ---- */
  const profitDrivers: ProfitDrivers = {
    products: products.mostProfitable.slice(0, 5).map((p) => ({ label: p.name, value: p.profit, sub: `${p.margin.toFixed(0)}% margin` })),
    categories: categoryDrivers(d).slice(0, 5),
    campaigns: campaigns.slice(0, 5).map((c) => ({ label: c.name, value: c.profit, sub: `ROI ${c.roi.toFixed(1)}×` })),
    segments: custProf.mostProfitableSegments.map((s) => ({ label: s.segment, value: s.profit, sub: `${s.count} customers` })),
    regions: [...regions].sort((a, b) => b.profit - a.profit).map((r) => ({ label: r.region, value: r.profit, sub: `${r.margin.toFixed(0)}% margin` })),
  };

  const lossDrivers: LossDrivers = {
    products: products.lowestMargin.filter((p) => p.margin < 20).slice(0, 5).map((p) => ({ label: p.name, value: p.revenue, sub: `${p.margin.toFixed(0)}% margin` })),
    campaigns: [...campaigns].filter((c) => c.cost > 0 && c.roi < 1).sort((a, b) => a.roi - b.roi).slice(0, 5).map((c) => ({ label: c.name, value: c.profit, sub: `ROI ${c.roi.toFixed(2)}×` })),
    refundSources: refundDrivers(d).slice(0, 5),
    supportCostDrivers: custProf.supportHeavy.slice(0, 5).map((c) => ({ label: c.name || c.email || "Customer", value: c.supportTickets, sub: "tickets" })),
    inventoryLoss: inv ? [
      { label: "Dead stock", value: inv.deadStockLoss },
      { label: "Overstock capital", value: inv.overstockCost },
    ].filter((r) => r.value > 0) : [],
  };

  /* ---- AI insights ---- */
  const insights = buildInsights(scorecard, health, campaigns, opportunities, risks);

  return {
    currency: d.currency,
    scorecard, health, opportunities, risks,
    profitDrivers, lossDrivers, regions, insights, alerts,
    topCampaigns: campaigns.slice(0, 6),
    worstCampaigns: [...campaigns].filter((c) => c.cost > 0).sort((a, b) => a.roi - b.roi).slice(0, 6),
  };
}

function categoryDrivers(d: FinancialData): DriverRow[] {
  const costMap = new Map(d.products.map((p) => [p.slug, Number(p.cost) || 0]));
  const map = new Map<string, number>();
  for (const o of d.orders) {
    if (!isPaid(o)) continue;
    for (const it of o.order_items ?? []) {
      const cat = (it.product_slug ?? it.name ?? "other").split("-")[0] || "other";
      const qty = it.quantity ?? 0;
      const rev = Number(it.line_total) || (Number(it.unit_price) || 0) * qty;
      const profit = rev - (costMap.get(it.product_slug ?? "") ?? 0) * qty;
      map.set(cat, (map.get(cat) ?? 0) + profit);
    }
  }
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function refundDrivers(d: FinancialData): DriverRow[] {
  const map = new Map<string, { count: number; amount: number }>();
  for (const r of d.returns) {
    if (!isCompletedReturn(r)) continue;
    const reason = (r.reason || "other").trim();
    const cur = map.get(reason) ?? { count: 0, amount: 0 };
    cur.count += 1; cur.amount += Number(r.refund_amount) || 0;
    map.set(reason, cur);
  }
  return [...map.entries()].map(([label, v]) => ({ label, value: v.amount, sub: `${v.count}×` })).sort((a, b) => b.value - a.value);
}

function buildInsights(
  sc: ExecutiveScorecard, h: BusinessHealth, campaigns: CampaignProfit[],
  opps: Opportunity[], risks: ExecRisk[],
): AIInsight[] {
  const out: AIInsight[] = [];

  out.push({
    id: "ai-overview",
    whatHappened: `Revenue is ${sc.revenue.toFixed(0)} with ${sc.netMargin.toFixed(1)}% net margin across ${sc.orders} paid orders.`,
    whyHappened: sc.growth >= 0
      ? `Demand grew ${sc.growth.toFixed(0)}% vs the prior 90 days, lifting top-line and contribution.`
      : `Demand fell ${Math.abs(sc.growth).toFixed(0)}% vs the prior 90 days, compressing contribution.`,
    whatToDo: sc.netMargin < 8 ? "Protect margin: pause loss-making campaigns and reprice thin-margin products." : "Reinvest contribution into proven winners to compound growth.",
    expectedImpact: `Overall business health is ${h.overall}/100 (${h.risk} risk).`,
    confidence: clamp(60 + Math.min(35, sc.orders)),
    tone: sc.netMargin < 0 ? "danger" : sc.netMargin < 8 ? "warn" : "good",
  });

  const win = campaigns.find((c) => c.cost > 0 && c.roi >= 2);
  if (win)
    out.push({
      id: "ai-winner",
      whatHappened: `"${win.name}" returned ${win.roi.toFixed(1)}× ROI (${win.roas.toFixed(1)}× ROAS).`,
      whyHappened: "Spend is converting efficiently with above-target return.",
      whatToDo: `Scale budget on "${win.name}" by ~50% while ROI holds.`,
      expectedImpact: `Projected additional profit ≈ ${(win.profit * 0.5).toFixed(0)}.`,
      confidence: clamp(55 + win.roi * 6),
      tone: "good",
    });

  const loss = campaigns.find((c) => c.cost > 0 && c.roi < 0);
  if (loss)
    out.push({
      id: "ai-loss",
      whatHappened: `"${loss.name}" is losing money at ${loss.roi.toFixed(2)}× ROI.`,
      whyHappened: "Acquisition cost exceeds the profit it generates.",
      whatToDo: `Pause "${loss.name}" and redirect budget to a proven winner.`,
      expectedImpact: `Recover ≈ ${Math.abs(loss.profit).toFixed(0)} in protected margin.`,
      confidence: 82,
      tone: "danger",
    });

  if (opps[0])
    out.push({
      id: "ai-opp",
      whatHappened: `Top opportunity: ${opps[0].title}.`,
      whyHappened: opps[0].detail,
      whatToDo: "Action it this week from one-click actions below.",
      expectedImpact: `Estimated upside ≈ ${opps[0].impact.toFixed(0)}.`,
      confidence: 70,
      tone: "info",
    });

  if (risks[0] && risks[0].severity === "high")
    out.push({
      id: "ai-risk",
      whatHappened: `Critical risk: ${risks[0].title}.`,
      whyHappened: risks[0].detail,
      whatToDo: "Open the risk and resolve before it compounds.",
      expectedImpact: "Prevents avoidable margin and revenue loss.",
      confidence: 78,
      tone: "danger",
    });

  return out;
}

/* --------------------------------------------------------- today snapshot */

export type TodaySnapshot = {
  orders: number;
  revenue: number;
  profit: number;
  newCustomers: number;
  refunds: number;
  returns: number;
  supportTickets: number;
  campaignProfit: number;
  activeCampaigns: number;
};

export async function fetchTodaySnapshot(): Promise<TodaySnapshot> {
  const since = new Date(); since.setHours(0, 0, 0, 0);
  const sinceISO = since.toISOString();

  const [ordersRes, productsRes, returnsRes, custRes, ticketsRes, campRes] = await Promise.all([
    supabase.from("orders")
      .select("total,payment_status,status,user_id,contact_email,created_at,order_items(quantity,product_slug)")
      .eq("is_seeded", false).gte("created_at", sinceISO).limit(1000),
    supabase.from("products").select("slug,cost"),
    supabase.from("returns").select("refund_amount,status,refund_status,created_at").eq("is_seeded", false).gte("created_at", sinceISO).limit(1000),
    supabase.from("profiles").select("id").gte("created_at", sinceISO).limit(1000),
    supabase.from("support_tickets").select("id,status,created_at").gte("created_at", sinceISO).limit(1000),
    supabase.from("marketing_campaigns").select("status,metrics").eq("status", "active"),
  ]);

  const orders = (ordersRes.data as { total: number; payment_status: string; status: string; order_items?: { quantity: number; product_slug: string }[] }[]) ?? [];
  const costMap = new Map(((productsRes.data as { slug: string; cost: number }[]) ?? []).map((p) => [p.slug, Number(p.cost) || 0]));
  const paid = orders.filter(isPaid);
  const revenue = paid.reduce((a, o) => a + (Number(o.total) || 0), 0);
  const cogs = paid.reduce((a, o) => a + (o.order_items ?? []).reduce((s, it) => s + (costMap.get(it.product_slug) ?? 0) * (it.quantity ?? 0), 0), 0);

  const returns = (returnsRes.data as { refund_amount: number; status: string; refund_status: string }[]) ?? [];
  const refunds = returns.filter(isCompletedReturn).reduce((a, r) => a + (Number(r.refund_amount) || 0), 0);

  const camps = (campRes.data as { metrics: { profit?: number } | null }[]) ?? [];
  const campaignProfit = camps.reduce((a, c) => a + (Number(c.metrics?.profit) || 0), 0);

  return {
    orders: orders.length,
    revenue,
    profit: revenue - cogs - refunds,
    newCustomers: (custRes.data?.length ?? 0),
    refunds,
    returns: returns.length,
    supportTickets: (ticketsRes.data?.length ?? 0),
    campaignProfit,
    activeCampaigns: camps.length,
  };
}

/* ------------------------------------------------------- executive timeline */

export type TimelineEvent = {
  id: string;
  kind: "order" | "refund" | "return" | "campaign" | "inventory" | "support" | "cms" | "admin";
  title: string;
  detail: string;
  at: string;
};

const ADMIN_KIND: Record<string, TimelineEvent["kind"]> = {
  inventory: "inventory", cms: "cms", banner: "cms", page: "cms",
  marketing_campaign: "campaign", support: "support", support_ticket: "support",
};

export async function fetchExecutiveTimeline(limit = 40): Promise<TimelineEvent[]> {
  const since = new Date(Date.now() - 14 * DAY).toISOString();
  const [ordersRes, returnsRes, campRes, logsRes] = await Promise.all([
    supabase.from("orders").select("id,total,status,created_at").eq("is_seeded", false).gte("created_at", since).order("created_at", { ascending: false }).limit(limit),
    supabase.from("returns").select("id,reason,refund_amount,status,refund_status,created_at").eq("is_seeded", false).gte("created_at", since).order("created_at", { ascending: false }).limit(limit),
    supabase.from("marketing_campaigns").select("id,name,status,created_at,updated_at").order("updated_at", { ascending: false }).limit(limit),
    supabase.from("admin_activity_logs").select("id,action,entity_type,entity_id,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(limit),
  ]);

  const out: TimelineEvent[] = [];

  for (const o of (ordersRes.data as { id: string; total: number; status: string; created_at: string }[]) ?? [])
    out.push({ id: `o-${o.id}`, kind: "order", title: "New order", detail: `${Number(o.total).toFixed(0)} · ${o.status}`, at: o.created_at });

  for (const r of (returnsRes.data as { id: string; reason: string; refund_amount: number; status: string; refund_status: string; created_at: string }[]) ?? [])
    out.push({ id: `r-${r.id}`, kind: isCompletedReturn(r) ? "refund" : "return", title: isCompletedReturn(r) ? "Refund processed" : "Return opened", detail: `${(r.reason || "—")} · ${Number(r.refund_amount).toFixed(0)}`, at: r.created_at });

  for (const c of (campRes.data as { id: string; name: string; status: string; created_at: string; updated_at: string }[]) ?? [])
    out.push({ id: `c-${c.id}`, kind: "campaign", title: `Campaign ${c.status}`, detail: c.name, at: c.updated_at || c.created_at });

  for (const l of (logsRes.data as unknown as { id: number; action: string; entity_type: string | null; created_at: string }[]) ?? [])
    out.push({ id: `a-${l.id}`, kind: ADMIN_KIND[l.entity_type ?? ""] ?? "admin", title: l.action.replace(/_/g, " "), detail: l.entity_type ?? "admin action", at: l.created_at });

  return out.sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, limit);
}

/* ------------------------------------------------------------- map data */

export type RegionMapRow = { region: Region; revenue: number; profit: number; orders: number };

export function executiveMap(regions: RegionalProfit[]): {
  topRegions: RegionMapRow[]; topRevenue: RegionMapRow[]; topProfit: RegionMapRow[];
} {
  const rows: RegionMapRow[] = regions.map((r) => ({ region: r.region, revenue: r.revenue, profit: r.profit, orders: r.orders }));
  return {
    topRegions: [...rows].sort((a, b) => b.revenue + b.profit - (a.revenue + a.profit)),
    topRevenue: [...rows].sort((a, b) => b.revenue - a.revenue),
    topProfit: [...rows].sort((a, b) => b.profit - a.profit),
  };
}
