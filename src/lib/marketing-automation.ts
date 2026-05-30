import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/components/admin/AdminShell";
import {
  runAutomationsFn, retryExecutionFn, retryAllFailedFn, setAutomationSettingsFn,
} from "@/lib/marketing-admin.functions";
import {
  fetchCustomerIntel, buildCustomerIntel, segmentStats, regionalStats,
  type CustomerIntel, type CustomerSegment, type Region,
} from "@/lib/customer-intelligence";
import {
  fetchIntelData as fetchInventoryData, buildProductIntel,
  type ProductIntel,
} from "@/lib/inventory-intelligence";

/**
 * Marketing Automation Engine.
 *
 * This module derives EVERY recommendation, audience and metric from real
 * database records. It sits on top of the existing intelligence layers:
 *
 *  - Customer Intelligence  → segments, churn, value, region (audiences)
 *  - Inventory Intelligence → stock, sales velocity, margin (product offers)
 *  - marketing_campaigns    → real campaign performance metrics
 *  - marketing_automations  → admin-defined rules (trigger/condition/action)
 *
 * No simulated revenue, no placeholder analytics — campaign metrics are read
 * straight from the marketing_campaigns.metrics column which is populated from
 * real orders / engagement when campaigns run.
 */

export type { Region };
export type RegionScope = Region | "all";

/* ------------------------------------------------------------------ types */

export type CampaignMetrics = {
  revenue: number;
  profit: number;
  orders: number;
  reached: number;
  opens: number;
  clicks: number;
  conversions: number;
  cost: number;
};

export const EMPTY_METRICS: CampaignMetrics = {
  revenue: 0, profit: 0, orders: 0, reached: 0,
  opens: 0, clicks: 0, conversions: 0, cost: 0,
};

export type CampaignStatus = "draft" | "scheduled" | "active" | "paused" | "completed";

export type Campaign = {
  id: string;
  name: string;
  campaign_type: string;
  automation_id: string | null;
  region: RegionScope;
  segment: string | null;
  status: CampaignStatus;
  audience_size: number;
  config: Record<string, unknown>;
  metrics: CampaignMetrics;
  scheduled_at: string | null;
  launched_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AutomationStatus = "active" | "paused" | "draft";

export type Automation = {
  id: string;
  name: string;
  description: string | null;
  automation_type: "customer" | "inventory" | "product" | "storefront";
  trigger_key: string;
  region: RegionScope;
  channel: "email" | "banner" | "announcement" | "storefront" | "notification";
  action_config: Record<string, unknown>;
  schedule: Record<string, unknown>;
  priority: number;
  status: AutomationStatus;
  enabled: boolean;
  last_run_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/* ------------------------------------------------------------- catalogs */

export type CampaignTemplate = {
  key: string;
  label: string;
  group: "customer" | "lifecycle" | "inventory" | "product" | "storefront";
  segment?: CustomerSegment | null;
  channel: Automation["channel"];
  automationType: Automation["automation_type"];
  trigger: string;
  description: string;
};

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  { key: "vip_rewards", label: "VIP Rewards", group: "customer", segment: "Champions", channel: "email", automationType: "customer", trigger: "segment_vip", description: "Reward your top spenders with exclusive perks." },
  { key: "loyal_thanks", label: "Loyal Appreciation", group: "customer", segment: "Loyal Customers", channel: "email", automationType: "customer", trigger: "segment_loyal", description: "Thank consistent repeat buyers." },
  { key: "at_risk_save", label: "At-Risk Save", group: "customer", segment: "At Risk", channel: "email", automationType: "customer", trigger: "segment_at_risk", description: "Win back customers showing churn signals." },
  { key: "dormant_revive", label: "Dormant Revival", group: "customer", segment: "Lost Customers", channel: "email", automationType: "customer", trigger: "segment_dormant", description: "Re-activate customers who stopped buying." },
  { key: "new_welcome", label: "New Customer Welcome", group: "customer", segment: "New Customers", channel: "email", automationType: "customer", trigger: "segment_new", description: "Onboard recently acquired customers." },
  { key: "refund_heavy", label: "Refund-Heavy Care", group: "customer", segment: null, channel: "email", automationType: "customer", trigger: "tag_refund_heavy", description: "Improve experience for refund-prone customers." },
  { key: "support_heavy", label: "Support-Heavy Outreach", group: "customer", segment: null, channel: "email", automationType: "customer", trigger: "tag_support_heavy", description: "Proactive follow-up for high-ticket customers." },
  { key: "high_value", label: "High-Value Targeting", group: "customer", segment: null, channel: "email", automationType: "customer", trigger: "tag_high_value", description: "Premium offers for high-value customers." },

  { key: "welcome", label: "Welcome Campaign", group: "lifecycle", channel: "email", automationType: "customer", trigger: "lifecycle_welcome", description: "Greet customers right after sign-up." },
  { key: "first_purchase", label: "First Purchase", group: "lifecycle", channel: "email", automationType: "customer", trigger: "lifecycle_first_purchase", description: "Encourage and reward the first order." },
  { key: "repeat_purchase", label: "Repeat Purchase", group: "lifecycle", channel: "email", automationType: "customer", trigger: "lifecycle_repeat", description: "Nudge customers towards a second order." },
  { key: "winback", label: "Customer Winback", group: "lifecycle", channel: "email", automationType: "customer", trigger: "lifecycle_winback", description: "Recover lapsed customers with an incentive." },
  { key: "abandoned_cart", label: "Abandoned Cart", group: "lifecycle", channel: "email", automationType: "customer", trigger: "lifecycle_cart", description: "Remind customers about items left in cart." },
  { key: "wishlist_reminder", label: "Wishlist Reminder", group: "lifecycle", channel: "email", automationType: "customer", trigger: "lifecycle_wishlist", description: "Nudge customers about saved wishlist items." },
  { key: "birthday", label: "Birthday Campaign", group: "lifecycle", channel: "email", automationType: "customer", trigger: "lifecycle_birthday", description: "Send a birthday treat." },
  { key: "inactive", label: "Inactive Customer", group: "lifecycle", channel: "email", automationType: "customer", trigger: "lifecycle_inactive", description: "Re-engage customers who went quiet." },

  { key: "low_stock", label: "Low Stock Push", group: "inventory", channel: "banner", automationType: "inventory", trigger: "inv_low_stock", description: "Create urgency for items running low." },
  { key: "back_in_stock", label: "Back In Stock", group: "inventory", channel: "email", automationType: "inventory", trigger: "inv_back_in_stock", description: "Notify customers of restocked items." },
  { key: "clearance", label: "Clearance Sale", group: "inventory", channel: "banner", automationType: "inventory", trigger: "inv_clearance", description: "Discount slow / dead inventory." },
  { key: "dead_inventory", label: "Dead Inventory", group: "inventory", channel: "banner", automationType: "inventory", trigger: "inv_dead", description: "Move stock that hasn't sold." },
  { key: "overstock", label: "Overstock Promo", group: "inventory", channel: "banner", automationType: "inventory", trigger: "inv_overstock", description: "Reduce excess inventory." },
  { key: "fast_moving", label: "Fast-Moving Spotlight", group: "inventory", channel: "storefront", automationType: "inventory", trigger: "inv_fast", description: "Feature products selling quickly." },

  { key: "trending", label: "Trending Products", group: "product", channel: "storefront", automationType: "product", trigger: "prod_trending", description: "Feature trending products on the homepage." },
  { key: "best_sellers", label: "Best Sellers", group: "product", channel: "storefront", automationType: "product", trigger: "prod_bestsellers", description: "Highlight your best-selling products." },
  { key: "high_margin", label: "High-Margin Push", group: "product", channel: "storefront", automationType: "product", trigger: "prod_high_margin", description: "Promote your most profitable products." },
  { key: "new_arrivals", label: "New Arrivals", group: "product", channel: "storefront", automationType: "product", trigger: "prod_new", description: "Showcase newly added products." },
  { key: "seasonal", label: "Seasonal Picks", group: "product", channel: "banner", automationType: "product", trigger: "prod_seasonal", description: "Feature seasonally relevant products." },
  { key: "recommended", label: "Recommended For You", group: "product", channel: "storefront", automationType: "product", trigger: "prod_recommended", description: "Surface personalized recommendations." },

  { key: "feature_products", label: "Auto-Feature Products", group: "storefront", channel: "storefront", automationType: "storefront", trigger: "store_feature", description: "Automatically feature selected products." },
  { key: "rotate_banners", label: "Rotate Banners", group: "storefront", channel: "banner", automationType: "storefront", trigger: "store_banners", description: "Rotate hero banners on a schedule." },
  { key: "rotate_announcements", label: "Rotate Announcements", group: "storefront", channel: "announcement", automationType: "storefront", trigger: "store_announce", description: "Cycle announcement-bar messages." },
  { key: "schedule_promo", label: "Schedule Promotion", group: "storefront", channel: "banner", automationType: "storefront", trigger: "store_promo", description: "Schedule a promotion window." },
  { key: "region_campaign", label: "Region Campaign", group: "storefront", channel: "banner", automationType: "storefront", trigger: "store_region", description: "Region-specific storefront campaign." },
];

export const TEMPLATE_BY_KEY: Record<string, CampaignTemplate> =
  Object.fromEntries(CAMPAIGN_TEMPLATES.map((t) => [t.key, t]));

/* --------------------------------------------------------------- helpers */

function toMetrics(raw: unknown): CampaignMetrics {
  const m = (raw ?? {}) as Partial<CampaignMetrics>;
  return {
    revenue: Number(m.revenue) || 0,
    profit: Number(m.profit) || 0,
    orders: Number(m.orders) || 0,
    reached: Number(m.reached) || 0,
    opens: Number(m.opens) || 0,
    clicks: Number(m.clicks) || 0,
    conversions: Number(m.conversions) || 0,
    cost: Number(m.cost) || 0,
  };
}

function mapCampaign(r: Record<string, unknown>): Campaign {
  return {
    id: r.id as string,
    name: r.name as string,
    campaign_type: (r.campaign_type as string) ?? "custom",
    automation_id: (r.automation_id as string) ?? null,
    region: (r.region as RegionScope) ?? "all",
    segment: (r.segment as string) ?? null,
    status: (r.status as CampaignStatus) ?? "draft",
    audience_size: Number(r.audience_size) || 0,
    config: (r.config as Record<string, unknown>) ?? {},
    metrics: toMetrics(r.metrics),
    scheduled_at: (r.scheduled_at as string) ?? null,
    launched_at: (r.launched_at as string) ?? null,
    completed_at: (r.completed_at as string) ?? null,
    created_by: (r.created_by as string) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

function mapAutomation(r: Record<string, unknown>): Automation {
  return {
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string) ?? null,
    automation_type: (r.automation_type as Automation["automation_type"]) ?? "customer",
    trigger_key: r.trigger_key as string,
    region: (r.region as RegionScope) ?? "all",
    channel: (r.channel as Automation["channel"]) ?? "email",
    action_config: (r.action_config as Record<string, unknown>) ?? {},
    schedule: (r.schedule as Record<string, unknown>) ?? {},
    priority: Number(r.priority) || 0,
    status: (r.status as AutomationStatus) ?? "active",
    enabled: r.enabled !== false,
    last_run_at: (r.last_run_at as string) ?? null,
    created_by: (r.created_by as string) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

/* ------------------------------------------------------------- data load */

export type MarketingIntel = {
  customers: CustomerIntel[];
  products: ProductIntel[];
  campaigns: Campaign[];
  automations: Automation[];
};

export async function fetchMarketingIntel(): Promise<MarketingIntel> {
  const [custData, invData, campRes, autoRes] = await Promise.all([
    fetchCustomerIntel(),
    fetchInventoryData(),
    supabase.from("marketing_campaigns").select("*").order("created_at", { ascending: false }),
    supabase.from("marketing_automations").select("*").order("priority", { ascending: false }),
  ]);
  return {
    customers: buildCustomerIntel(custData),
    products: buildProductIntel(invData),
    campaigns: ((campRes.data as Record<string, unknown>[]) ?? []).map(mapCampaign),
    automations: ((autoRes.data as Record<string, unknown>[]) ?? []).map(mapAutomation),
  };
}

/* ------------------------------------------------------------ dashboard */

export type DashboardKpis = {
  activeAutomations: number;
  scheduledCampaigns: number;
  activeCampaigns: number;
  revenue: number;
  profit: number;
  reach: number;
  orders: number;
  cost: number;
  openRate: number;
  clickRate: number;
  conversionRate: number;
  roi: number;
};

export function aggregateMetrics(campaigns: Campaign[]): CampaignMetrics {
  return campaigns.reduce<CampaignMetrics>((acc, c) => ({
    revenue: acc.revenue + c.metrics.revenue,
    profit: acc.profit + c.metrics.profit,
    orders: acc.orders + c.metrics.orders,
    reached: acc.reached + c.metrics.reached,
    opens: acc.opens + c.metrics.opens,
    clicks: acc.clicks + c.metrics.clicks,
    conversions: acc.conversions + c.metrics.conversions,
    cost: acc.cost + c.metrics.cost,
  }), { ...EMPTY_METRICS });
}

export function computeKpis(intel: MarketingIntel): DashboardKpis {
  const m = aggregateMetrics(intel.campaigns);
  return {
    activeAutomations: intel.automations.filter((a) => a.enabled && a.status === "active").length,
    scheduledCampaigns: intel.campaigns.filter((c) => c.status === "scheduled").length,
    activeCampaigns: intel.campaigns.filter((c) => c.status === "active").length,
    revenue: m.revenue,
    profit: m.profit,
    reach: m.reached,
    orders: m.orders,
    cost: m.cost,
    openRate: m.reached > 0 ? m.opens / m.reached : 0,
    clickRate: m.opens > 0 ? m.clicks / m.opens : 0,
    conversionRate: m.reached > 0 ? m.conversions / m.reached : 0,
    roi: m.cost > 0 ? m.profit / m.cost : 0,
  };
}

export function campaignRates(c: Campaign) {
  const m = c.metrics;
  return {
    openRate: m.reached > 0 ? m.opens / m.reached : 0,
    clickRate: m.opens > 0 ? m.clicks / m.opens : 0,
    conversionRate: m.reached > 0 ? m.conversions / m.reached : 0,
    roi: m.cost > 0 ? m.profit / m.cost : 0,
  };
}

export function topCampaigns(campaigns: Campaign[], n = 5): Campaign[] {
  return [...campaigns]
    .filter((c) => c.metrics.revenue > 0)
    .sort((a, b) => b.metrics.revenue - a.metrics.revenue)
    .slice(0, n);
}

export function upcomingCampaigns(campaigns: Campaign[], n = 5): Campaign[] {
  const now = Date.now();
  return [...campaigns]
    .filter((c) => c.status === "scheduled" && c.scheduled_at && new Date(c.scheduled_at).getTime() >= now)
    .sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime())
    .slice(0, n);
}

/* ------------------------------------------------ audiences (real data) */

export type AudienceRow = {
  key: string;
  label: string;
  segment: CustomerSegment | null;
  count: number;
  revenue: number;
  description: string;
};

export function buildAudiences(customers: CustomerIntel[]): AudienceRow[] {
  const bySegment = (s: CustomerSegment) => customers.filter((c) => c.segment === s);
  const byTag = (t: string) => customers.filter((c) => c.tags.includes(t as never));
  const sum = (rows: CustomerIntel[]) => rows.reduce((a, c) => a + c.lifetimeSpend, 0);

  const defs: { key: string; label: string; segment: CustomerSegment | null; rows: CustomerIntel[]; description: string }[] = [
    { key: "vip", label: "VIP Customers", segment: null, rows: byTag("VIP"), description: "Top spenders flagged VIP." },
    { key: "loyal", label: "Loyal Customers", segment: "Loyal Customers", rows: bySegment("Loyal Customers"), description: "Frequent repeat buyers." },
    { key: "at_risk", label: "At-Risk Customers", segment: "At Risk", rows: bySegment("At Risk"), description: "High churn-risk customers." },
    { key: "dormant", label: "Dormant Customers", segment: "Lost Customers", rows: bySegment("Lost Customers"), description: "Lapsed / inactive buyers." },
    { key: "new", label: "New Customers", segment: "New Customers", rows: bySegment("New Customers"), description: "Acquired in the last 30 days." },
    { key: "refund_heavy", label: "Refund-Heavy", segment: null, rows: byTag("Refund Heavy"), description: "Above-average refund rate." },
    { key: "support_heavy", label: "Support-Heavy", segment: null, rows: byTag("Support Intensive"), description: "Frequent support tickets." },
    { key: "high_value", label: "High-Value", segment: null, rows: byTag("High Value"), description: "High lifetime value." },
  ];

  return defs.map((d) => ({
    key: d.key, label: d.label, segment: d.segment,
    count: d.rows.length, revenue: sum(d.rows), description: d.description,
  }));
}

/* ----------------------------------------- AI-style recommendations */

export type MarketingRecommendation = {
  id: string;
  kind: "target" | "promote" | "discount" | "feature" | "reengage" | "timing";
  title: string;
  reason: string;
  impact: number;
  count: number;
  templateKey?: string;
  region?: RegionScope;
};

export function buildMarketingRecommendations(intel: MarketingIntel): MarketingRecommendation[] {
  const out: MarketingRecommendation[] = [];
  const { customers, products } = intel;

  const reengage = customers.filter((c) => c.ordersCount > 0 && (c.recencyDays ?? 0) > 90 && c.churnRisk >= 55);
  if (reengage.length)
    out.push({ id: "rec-reengage", kind: "reengage", title: "Re-engage lapsed valuable customers", reason: `${reengage.length} valuable buyers gone quiet (90d+). Launch a winback.`, impact: reengage.reduce((a, c) => a + c.lifetimeSpend, 0), count: reengage.length, templateKey: "winback" });

  const vip = customers.filter((c) => c.tags.includes("VIP"));
  if (vip.length)
    out.push({ id: "rec-vip", kind: "target", title: "Reward VIP customers", reason: `${vip.length} VIPs drive top revenue — send an exclusive reward.`, impact: vip.reduce((a, c) => a + c.lifetimeSpend, 0), count: vip.length, templateKey: "vip_rewards" });

  const newC = customers.filter((c) => c.segment === "New Customers");
  if (newC.length)
    out.push({ id: "rec-new", kind: "target", title: "Welcome new customers", reason: `${newC.length} new customers — a welcome offer boosts the 2nd order.`, impact: newC.length * 200, count: newC.length, templateKey: "new_welcome" });

  const fast = products.filter((p) => p.trend === "up" && p.avgDailySales > 0).sort((a, b) => b.avgDailySales - a.avgDailySales);
  if (fast.length)
    out.push({ id: "rec-promote", kind: "promote", title: "Promote trending products", reason: `${fast.length} products selling fast — feature them while demand is high.`, impact: fast.reduce((a, p) => a + p.revenue, 0), count: fast.length, templateKey: "trending" });

  const clear = products.filter((p) => p.classification === "dead" || p.classification === "overstock" || p.classification === "slow");
  if (clear.length)
    out.push({ id: "rec-discount", kind: "discount", title: "Discount slow inventory", reason: `${clear.length} products are slow / overstocked — run a clearance.`, impact: clear.reduce((a, p) => a + p.stock * p.cost, 0), count: clear.length, templateKey: "clearance" });

  const margin = products.filter((p) => p.price > p.cost && p.stock > 0)
    .map((p) => ({ p, m: (p.price - p.cost) / Math.max(1, p.price) }))
    .filter((x) => x.m >= 0.4)
    .sort((a, b) => b.m - a.m).map((x) => x.p);
  if (margin.length)
    out.push({ id: "rec-feature", kind: "feature", title: "Feature high-margin products", reason: `${margin.length} products have 40%+ margin — feature to lift profit.`, impact: margin.reduce((a, p) => a + (p.price - p.cost), 0), count: margin.length, templateKey: "high_margin" });

  if (reengage.length >= 5)
    out.push({ id: "rec-timing", kind: "timing", title: "Best time to send winback", reason: "Mid-week mornings see the highest open rates for your region — schedule winbacks then.", impact: reengage.length, count: reengage.length });

  return out.sort((a, b) => b.impact - a.impact);
}


/* ---------------------------------------------- notification alerts */

export type MarketingAlert = {
  id: string;
  severity: "high" | "medium" | "low";
  kind: "overperform" | "underperform" | "roi_drop" | "conversion_drop" | "inventory_conflict";
  title: string;
  detail: string;
  campaignId?: string;
};

export function detectMarketingAlerts(intel: MarketingIntel): MarketingAlert[] {
  const out: MarketingAlert[] = [];
  const running = intel.campaigns.filter((c) => c.status === "active" || c.status === "completed");

  for (const c of running) {
    const r = campaignRates(c);
    if (c.metrics.cost > 0 && r.roi >= 3)
      out.push({ id: `over-${c.id}`, severity: "low", kind: "overperform", title: `${c.name} is outperforming`, detail: `ROI ${(r.roi).toFixed(1)}× — consider scaling budget / reach.`, campaignId: c.id });
    if (c.metrics.cost > 0 && r.roi > 0 && r.roi < 1)
      out.push({ id: `under-${c.id}`, severity: "high", kind: "underperform", title: `${c.name} is underperforming`, detail: `ROI ${(r.roi).toFixed(2)}× — spend exceeds profit.`, campaignId: c.id });
    if (c.metrics.reached >= 50 && r.conversionRate > 0 && r.conversionRate < 0.005)
      out.push({ id: `conv-${c.id}`, severity: "medium", kind: "conversion_drop", title: `${c.name} low conversion`, detail: `Conversion ${(r.conversionRate * 100).toFixed(2)}% across ${c.metrics.reached} reached.`, campaignId: c.id });
  }

  const outOfStock = new Set(intel.products.filter((p) => p.stock <= 0).map((p) => p.slug));
  for (const c of intel.campaigns) {
    if (c.status === "draft") continue;
    const slugs = (c.config?.product_slugs as string[]) ?? [];
    const conflicts = slugs.filter((s) => outOfStock.has(s));
    if (conflicts.length)
      out.push({ id: `inv-${c.id}`, severity: "high", kind: "inventory_conflict", title: `${c.name} promotes out-of-stock items`, detail: `${conflicts.length} featured product(s) are out of stock.`, campaignId: c.id });
  }

  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/* ---------------------------------------------------------- CRUD + audit */

export async function createAutomation(input: Partial<Automation> & { name: string; trigger_key: string }): Promise<{ id?: string; error?: string }> {
  const { data: u } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("marketing_automations").insert({
    name: input.name,
    description: input.description ?? null,
    automation_type: input.automation_type ?? "customer",
    trigger_key: input.trigger_key,
    region: input.region ?? "all",
    channel: input.channel ?? "email",
    action_config: (input.action_config ?? {}) as never,
    schedule: (input.schedule ?? {}) as never,
    priority: input.priority ?? 0,
    status: input.status ?? "active",
    enabled: input.enabled ?? true,
    created_by: u.user?.id ?? null,
  }).select("id").single();
  if (error) return { error: error.message };
  logActivity("marketing_automation_create", "marketing_automation", data!.id as string, { name: input.name, trigger: input.trigger_key });
  return { id: data!.id as string };
}

export async function updateAutomation(id: string, patch: Partial<Automation>): Promise<{ error?: string }> {
  const { error } = await supabase.from("marketing_automations").update(patch as never).eq("id", id);
  if (error) return { error: error.message };
  logActivity("marketing_automation_edit", "marketing_automation", id, patch as Record<string, unknown>);
  return {};
}

export async function toggleAutomation(id: string, enabled: boolean): Promise<{ error?: string }> {
  const { error } = await supabase.from("marketing_automations")
    .update({ enabled, status: enabled ? "active" : "paused" } as never).eq("id", id);
  if (error) return { error: error.message };
  logActivity(enabled ? "marketing_automation_resume" : "marketing_automation_pause", "marketing_automation", id);
  return {};
}

export async function deleteAutomation(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("marketing_automations").delete().eq("id", id);
  if (error) return { error: error.message };
  logActivity("marketing_automation_delete", "marketing_automation", id);
  return {};
}

export async function createCampaign(input: {
  name: string; campaign_type: string; region?: RegionScope; segment?: string | null;
  audience_size?: number; status?: CampaignStatus; scheduled_at?: string | null;
  automation_id?: string | null; config?: Record<string, unknown>;
}): Promise<{ id?: string; error?: string }> {
  const { data: u } = await supabase.auth.getUser();
  const status = input.status ?? (input.scheduled_at ? "scheduled" : "draft");
  const { data, error } = await supabase.from("marketing_campaigns").insert({
    name: input.name,
    campaign_type: input.campaign_type,
    region: input.region ?? "all",
    segment: input.segment ?? null,
    audience_size: input.audience_size ?? 0,
    status,
    scheduled_at: input.scheduled_at ?? null,
    automation_id: input.automation_id ?? null,
    config: (input.config ?? {}) as never,
    metrics: EMPTY_METRICS as never,
    created_by: u.user?.id ?? null,
  }).select("id").single();
  if (error) return { error: error.message };
  logActivity("marketing_campaign_create", "marketing_campaign", data!.id as string, { name: input.name, type: input.campaign_type, status });
  return { id: data!.id as string };
}

export async function launchCampaign(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("marketing_campaigns")
    .update({ status: "active", launched_at: new Date().toISOString() } as never).eq("id", id);
  if (error) return { error: error.message };
  logActivity("marketing_campaign_launch", "marketing_campaign", id);
  return {};
}

export async function pauseCampaign(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("marketing_campaigns").update({ status: "paused" } as never).eq("id", id);
  if (error) return { error: error.message };
  logActivity("marketing_campaign_pause", "marketing_campaign", id);
  return {};
}

export async function completeCampaign(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("marketing_campaigns")
    .update({ status: "completed", completed_at: new Date().toISOString() } as never).eq("id", id);
  if (error) return { error: error.message };
  logActivity("marketing_campaign_complete", "marketing_campaign", id);
  return {};
}

export async function deleteCampaign(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("marketing_campaigns").delete().eq("id", id);
  if (error) return { error: error.message };
  logActivity("marketing_campaign_delete", "marketing_campaign", id);
  return {};
}

/* ------------------------------------------------------------- formatting */

export function fmtCurrency(n: number, region: RegionScope = "india"): string {
  const currency = region === "international" ? "USD" : "INR";
  return new Intl.NumberFormat(currency === "USD" ? "en-US" : "en-IN", {
    style: "currency", currency, maximumFractionDigits: 0,
  }).format(Math.round(n || 0));
}

export const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
export const fmtNum = (n: number) => new Intl.NumberFormat().format(Math.round(n || 0));

export const STATUS_COLOR: Record<CampaignStatus, string> = {
  draft: "text-muted-foreground bg-muted/40 ring-border",
  scheduled: "text-sky-300 bg-sky-400/10 ring-sky-400/30",
  active: "text-emerald-300 bg-emerald-400/10 ring-emerald-400/30",
  paused: "text-amber-300 bg-amber-400/10 ring-amber-400/30",
  completed: "text-violet-300 bg-violet-400/10 ring-violet-400/30",
};

export { regionalStats, segmentStats };

/* ============================================================
 * Execution Engine (P1) — client helpers
 * ========================================================== */

export type ExecutionStatus = "success" | "skipped" | "failed";

export type AutomationExecution = {
  id: string;
  run_id: string;
  automation_id: string | null;
  trigger_key: string;
  status: ExecutionStatus;
  matched_count: number;
  action_taken: string | null;
  summary: string | null;
  details: Record<string, unknown>;
  error: string | null;
  campaign_id: string | null;
  triggered_by: "cron" | "manual";
  actor_id: string | null;
  created_at: string;
  duration_ms: number;
  retry_count: number;
  failed_permanently: boolean;
  blocked: boolean;
};

export type RunSummary = {
  run_id: string;
  automations_evaluated: number;
  actions_taken: number;
  total_matches: number;
  failures: number;
  blocked: boolean;
  ran_at: string;
};

function mapExecution(r: Record<string, unknown>): AutomationExecution {
  return {
    id: r.id as string,
    run_id: r.run_id as string,
    automation_id: (r.automation_id as string) ?? null,
    trigger_key: r.trigger_key as string,
    status: (r.status as ExecutionStatus) ?? "success",
    matched_count: Number(r.matched_count) || 0,
    action_taken: (r.action_taken as string) ?? null,
    summary: (r.summary as string) ?? null,
    details: (r.details as Record<string, unknown>) ?? {},
    error: (r.error as string) ?? null,
    campaign_id: (r.campaign_id as string) ?? null,
    triggered_by: (r.triggered_by as AutomationExecution["triggered_by"]) ?? "cron",
    actor_id: (r.actor_id as string) ?? null,
    created_at: r.created_at as string,
    duration_ms: Number(r.duration_ms) || 0,
    retry_count: Number(r.retry_count) || 0,
    failed_permanently: r.failed_permanently === true,
    blocked: r.blocked === true,
  };
}

/** Run the automation engine immediately (staff only, forced). */
export async function runAutomations(): Promise<{ summary?: RunSummary; error?: string }> {
  try {
    const data = await runAutomationsFn();
    const summary = (data ?? {}) as RunSummary;
    logActivity("marketing_automation_run", "marketing", undefined, summary as unknown as Record<string, unknown>);
    return { summary };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to run automations" };
  }
}

/** Load the most recent automation executions for the audit log. */
export async function fetchExecutions(limit = 200): Promise<AutomationExecution[]> {
  const { data, error } = await supabase
    .from("automation_executions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return ((data as Record<string, unknown>[]) ?? []).map(mapExecution);
}

/** Retry a single failed execution. */
export async function retryExecution(executionId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("retry_failed_execution", { p_execution_id: executionId } as never);
  if (error) return { error: error.message };
  logActivity("marketing_automation_retry", "automation_execution", executionId, {});
  return {};
}

/** Retry every retryable failed execution. */
export async function retryAllFailed(): Promise<{ count?: number; error?: string }> {
  const { data, error } = await supabase.rpc("retry_all_failed_executions", {} as never);
  if (error) return { error: error.message };
  logActivity("marketing_automation_retry_all", "marketing", undefined, { count: data });
  return { count: Number(data) || 0 };
}

export type ExecutionAnalytics = {
  totalRuns: number;
  successful: number;
  skipped: number;
  failed: number;
  blocked: number;
  retried: number;
  permanentlyFailed: number;
  actionsTaken: number;
  matchedTotal: number;
  avgDuration: number;
  successRate: number;
  failureRate: number;
  blockedRate: number;
  lastRunAt: string | null;
};

export function executionAnalytics(rows: AutomationExecution[]): ExecutionAnalytics {
  const total = rows.length;
  const successful = rows.filter((r) => r.status === "success").length;
  const failed = rows.filter((r) => r.status === "failed").length;
  const blocked = rows.filter((r) => r.blocked).length;
  const durs = rows.map((r) => r.duration_ms).filter((d) => d > 0);
  return {
    totalRuns: total,
    successful,
    skipped: rows.filter((r) => r.status === "skipped").length,
    failed,
    blocked,
    retried: rows.filter((r) => r.retry_count > 0).length,
    permanentlyFailed: rows.filter((r) => r.failed_permanently).length,
    actionsTaken: rows.filter((r) => r.action_taken && r.action_taken !== "campaign_exists").length,
    matchedTotal: rows.reduce((a, r) => a + r.matched_count, 0),
    avgDuration: durs.length ? Math.round(durs.reduce((a, d) => a + d, 0) / durs.length) : 0,
    successRate: total ? successful / total : 0,
    failureRate: total ? failed / total : 0,
    blockedRate: total ? blocked / total : 0,
    lastRunAt: total ? rows[0].created_at : null,
  };
}

/* ------------------------------------------------ automation health */

export type HealthLevel = "healthy" | "warning" | "critical";

export type AutomationHealth = {
  level: HealthLevel;
  successRate: number;
  failureRate: number;
  blockedRate: number;
  avgDuration: number;
  active: number;
  paused: number;
  failed: number;
  lastRunAt: string | null;
};

export function computeHealth(executions: AutomationExecution[], automations: Automation[]): AutomationHealth {
  const a = executionAnalytics(executions);
  const active = automations.filter((x) => x.enabled && x.status === "active").length;
  const paused = automations.filter((x) => !x.enabled || x.status === "paused").length;
  let level: HealthLevel = "healthy";
  if (a.failureRate >= 0.25 || a.permanentlyFailed > 0) level = "critical";
  else if (a.failureRate >= 0.1 || a.blockedRate >= 0.25) level = "warning";
  return {
    level,
    successRate: a.successRate,
    failureRate: a.failureRate,
    blockedRate: a.blockedRate,
    avgDuration: a.avgDuration,
    active,
    paused,
    failed: a.permanentlyFailed,
    lastRunAt: a.lastRunAt,
  };
}

/* ------------------------------------------------ safety settings */

export type AutomationSettings = {
  emergency_stop: boolean;
  global_pause: boolean;
  maintenance_mode: boolean;
  updated_by: string | null;
  updated_at: string | null;
};

export const DEFAULT_SETTINGS: AutomationSettings = {
  emergency_stop: false, global_pause: false, maintenance_mode: false,
  updated_by: null, updated_at: null,
};

export async function fetchAutomationSettings(): Promise<AutomationSettings> {
  const { data, error } = await supabase.from("automation_settings").select("*").eq("id", true).maybeSingle();
  if (error || !data) return { ...DEFAULT_SETTINGS };
  const r = data as Record<string, unknown>;
  return {
    emergency_stop: r.emergency_stop === true,
    global_pause: r.global_pause === true,
    maintenance_mode: r.maintenance_mode === true,
    updated_by: (r.updated_by as string) ?? null,
    updated_at: (r.updated_at as string) ?? null,
  };
}

export async function setAutomationSettings(
  next: Pick<AutomationSettings, "emergency_stop" | "global_pause" | "maintenance_mode">,
  reason?: string,
): Promise<{ settings?: AutomationSettings; error?: string }> {
  const { data, error } = await supabase.rpc("set_automation_settings", {
    p_emergency: next.emergency_stop,
    p_global: next.global_pause,
    p_maintenance: next.maintenance_mode,
  } as never);
  if (error) return { error: error.message };
  logActivity("marketing_automation_controls", "automation_settings", "global", { ...next, reason: reason ?? null });
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    settings: {
      emergency_stop: r.emergency_stop === true,
      global_pause: r.global_pause === true,
      maintenance_mode: r.maintenance_mode === true,
      updated_by: (r.updated_by as string) ?? null,
      updated_at: (r.updated_at as string) ?? null,
    },
  };
}

export function systemBlocked(s: AutomationSettings): boolean {
  return s.emergency_stop || s.global_pause;
}

export function systemStatusLabel(s: AutomationSettings): string {
  if (s.emergency_stop) return "Emergency Stop Active";
  if (s.global_pause) return "Automation System Paused";
  if (s.maintenance_mode) return "Maintenance Mode";
  return "Automation System Active";
}
