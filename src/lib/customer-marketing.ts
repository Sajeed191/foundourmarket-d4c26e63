import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/components/admin/AdminShell";
import type { CustomerIntel, Region } from "@/lib/customer-intelligence";
import {
  createCampaign,
  launchCampaign,
  pauseCampaign,
  TEMPLATE_BY_KEY,
  type Campaign,
  type CampaignMetrics,
  type CampaignStatus,
  type RegionScope,
} from "@/lib/marketing-automation";
import { mapCampaignRow } from "@/lib/inventory-marketing";

/**
 * Customer ↔ Marketing Integration.
 *
 * Turns Customer Intelligence into the targeting engine for Marketing
 * Automation. EVERY audience, score and metric here is derived from real
 * customer records (CustomerIntel, computed from profiles / orders /
 * order_items / refunds / support / reviews) and real campaign records
 * (marketing_campaigns). No simulated audience data.
 *
 * It does three things:
 *  1. Builds real marketing audiences with full analytics.
 *  2. Scores every customer for loyalty / retention / engagement / spend /
 *     growth / churn-risk / referral-potential.
 *  3. Generates targeting recommendations + one-click actions that create real
 *     audience-linked campaigns (all audited).
 */

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

/* ------------------------------------------------------------- scores */

export type CustomerMarketingScore = {
  loyalty: number;
  retention: number;
  engagement: number;
  spend: number;
  growth: number;
  churnRisk: number;
  referral: number;
};

/** Per-customer marketing scores, normalised against the whole base. */
export function scoreCustomer(c: CustomerIntel, maxSpend: number): CustomerMarketingScore {
  const loyalty = clamp(
    Math.min(45, c.frequencyPerMonth * 30) +
      (c.ordersCount >= 2 ? 20 : 0) +
      Math.min(20, c.tenureDays / 36) +
      (c.tags.includes("Loyal") ? 15 : 0),
  );
  const retention = clamp(100 - c.churnRisk * 0.7 - Math.min(30, (c.recencyDays ?? 180) / 6));
  const engagement = clamp(
    Math.min(35, c.reviews * 12) +
      Math.min(25, c.questions * 8) +
      Math.min(25, c.wishlistCount * 6) +
      (c.ordersCount > 0 ? 15 : 0),
  );
  const spend = clamp(maxSpend > 0 ? (c.lifetimeSpend / maxSpend) * 100 : 0);
  const growth = clamp(
    50 + (c.trend === "up" ? 35 : c.trend === "down" ? -30 : 0) + Math.min(15, c.frequencyPerMonth * 8),
  );
  const churnRisk = clamp(c.churnRisk);
  const referral = clamp(
    loyalty * 0.4 + engagement * 0.35 + (1 - c.refundRate) * 25 - (c.supportTickets >= 3 ? 10 : 0),
  );
  return { loyalty, retention, engagement, spend, growth, churnRisk, referral };
}

/* ----------------------------------------------------------- audiences */

export type AudienceKey =
  | "vip"
  | "loyal"
  | "high_value"
  | "at_risk"
  | "dormant"
  | "new"
  | "refund_heavy"
  | "support_heavy"
  | "repeat"
  | "big_spenders";

export type AudienceRegionSplit = { region: Region; count: number; revenue: number; profit: number };

export type CustomerAudience = {
  key: AudienceKey;
  label: string;
  tone: "danger" | "warn" | "good" | "info";
  description: string;
  /** segment/tag selector recorded on campaigns for re-targeting */
  selector: { kind: "tag" | "segment" | "filter"; value: string };
  /** suggested one-click campaign template */
  template?: string;
  members: CustomerIntel[];
  count: number;
  revenue: number;
  profit: number;
  orders: number;
  aov: number;
  ltv: number;
  growth: "up" | "down" | "flat";
  growthPct: number; // recent vs prior 90d revenue change
  regions: AudienceRegionSplit[];
};

const DAY = 86_400_000;

function aggregate(members: CustomerIntel[]): Omit<CustomerAudience, "key" | "label" | "tone" | "description" | "selector" | "template" | "members"> {
  const count = members.length;
  const revenue = members.reduce((s, c) => s + c.lifetimeSpend, 0);
  const profit = members.reduce((s, c) => s + c.profit, 0);
  const orders = members.reduce((s, c) => s + c.ordersCount, 0);
  const aov = orders ? revenue / orders : 0;
  const ltv = count ? revenue / count : 0;

  // growth: recent 90d order count vs prior 90d (recency-based proxy on real orders)
  const cut1 = Date.now() - 90 * DAY;
  const recent = members.filter((c) => c.lastOrderAt && +new Date(c.lastOrderAt) >= cut1).length;
  const prior = members.filter((c) => {
    const t = c.lastOrderAt ? +new Date(c.lastOrderAt) : 0;
    return t >= cut1 - 90 * DAY && t < cut1;
  }).length;
  const growthPct = prior > 0 ? (recent - prior) / prior : recent > 0 ? 1 : 0;
  const growth = growthPct > 0.05 ? "up" : growthPct < -0.05 ? "down" : "flat";

  const regions: AudienceRegionSplit[] = (["india", "international"] as Region[]).map((region) => {
    const r = members.filter((c) => c.region === region);
    return {
      region,
      count: r.length,
      revenue: r.reduce((s, c) => s + c.lifetimeSpend, 0),
      profit: r.reduce((s, c) => s + c.profit, 0),
    };
  });

  return { count, revenue, profit, orders, aov, ltv, growth, growthPct, regions };
}

export function buildCustomerAudiences(rows: CustomerIntel[]): CustomerAudience[] {
  const byTag = (t: string) => rows.filter((c) => c.tags.includes(t as never));
  const bySegment = (s: string) => rows.filter((c) => c.segment === s);
  const spendSorted = [...rows].filter((c) => c.ordersCount > 0).sort((a, b) => b.lifetimeSpend - a.lifetimeSpend);
  const bigCut = spendSorted[Math.max(0, Math.floor(spendSorted.length * 0.1) - 1)]?.lifetimeSpend ?? Infinity;

  const defs: Omit<CustomerAudience, keyof ReturnType<typeof aggregate>>[] = [
    { key: "vip", label: "VIP Customers", tone: "good", description: "Top spenders flagged VIP.", selector: { kind: "tag", value: "VIP" }, template: "vip_rewards", members: byTag("VIP") },
    { key: "loyal", label: "Loyal Customers", tone: "good", description: "Frequent repeat buyers.", selector: { kind: "segment", value: "Loyal Customers" }, template: "loyal_thanks", members: bySegment("Loyal Customers") },
    { key: "high_value", label: "High-Value Customers", tone: "good", description: "High lifetime value.", selector: { kind: "tag", value: "High Value" }, template: "high_value", members: byTag("High Value") },
    { key: "at_risk", label: "At-Risk Customers", tone: "warn", description: "High churn-risk customers.", selector: { kind: "segment", value: "At Risk" }, template: "at_risk_save", members: bySegment("At Risk") },
    { key: "dormant", label: "Dormant Customers", tone: "danger", description: "Lapsed / inactive buyers.", selector: { kind: "segment", value: "Lost Customers" }, template: "dormant_revive", members: rows.filter((c) => c.ordersCount > 0 && (c.recencyDays ?? 0) > 120) },
    { key: "new", label: "New Customers", tone: "info", description: "Acquired in the last 30 days.", selector: { kind: "segment", value: "New Customers" }, template: "new_welcome", members: bySegment("New Customers") },
    { key: "refund_heavy", label: "Refund-Heavy Customers", tone: "danger", description: "Above-average refund rate.", selector: { kind: "tag", value: "Refund Heavy" }, template: "refund_heavy", members: byTag("Refund Heavy") },
    { key: "support_heavy", label: "Support-Heavy Customers", tone: "warn", description: "Frequent support tickets.", selector: { kind: "tag", value: "Support Intensive" }, template: "support_heavy", members: byTag("Support Intensive") },
    { key: "repeat", label: "Repeat Buyers", tone: "good", description: "Two or more paid orders.", selector: { kind: "filter", value: "repeat" }, template: "repeat_purchase", members: rows.filter((c) => c.ordersCount >= 2) },
    { key: "big_spenders", label: "Big Spenders", tone: "good", description: "Top 10% by lifetime spend.", selector: { kind: "filter", value: "big_spenders" }, template: "high_value", members: rows.filter((c) => c.ordersCount > 0 && c.lifetimeSpend >= bigCut) },
  ];

  return defs.map((d) => ({ ...d, ...aggregate(d.members) })).filter((a) => a.count > 0);
}

/* ----------------------------------------------------- recommendations */

export type CustomerRecAction =
  | "vip_reward"
  | "loyalty"
  | "winback"
  | "reactivation"
  | "upsell"
  | "cross_sell"
  | "retention"
  | "referral"
  | "review_request";

export type CustomerRecommendation = {
  id: string;
  action: CustomerRecAction;
  title: string;
  detail: string;
  tone: "danger" | "warn" | "good" | "info";
  template: string;
  audienceKey: AudienceKey;
  count: number;
  impact: number; // revenue / LTV at stake
};

const REC_DEFS: { action: CustomerRecAction; key: AudienceKey; template: string; title: string; tone: CustomerRecommendation["tone"]; reason: (a: CustomerAudience) => string }[] = [
  { action: "vip_reward", key: "vip", template: "vip_rewards", title: "VIP Reward Campaign", tone: "good", reason: (a) => `Reward ${a.count} VIPs driving ${fmtC(a.revenue)} lifetime revenue with exclusive perks.` },
  { action: "loyalty", key: "loyal", template: "loyal_thanks", title: "Loyalty Campaign", tone: "good", reason: (a) => `Recognise ${a.count} loyal repeat buyers to deepen retention.` },
  { action: "winback", key: "at_risk", template: "at_risk_save", title: "Winback Campaign", tone: "warn", reason: (a) => `${a.count} at-risk customers (${fmtC(a.revenue)} LTV) show churn signals — win them back.` },
  { action: "reactivation", key: "dormant", template: "dormant_revive", title: "Reactivation Campaign", tone: "danger", reason: (a) => `Re-activate ${a.count} dormant buyers worth ${fmtC(a.revenue)} historically.` },
  { action: "upsell", key: "repeat", template: "repeat_purchase", title: "Upsell Campaign", tone: "good", reason: (a) => `${a.count} repeat buyers (AOV ${fmtC(a.aov)}) are primed for higher-value offers.` },
  { action: "cross_sell", key: "big_spenders", template: "high_value", title: "Cross-Sell Campaign", tone: "good", reason: (a) => `Cross-sell complementary products to ${a.count} big spenders.` },
  { action: "retention", key: "high_value", template: "high_value", title: "Retention Campaign", tone: "info", reason: (a) => `Protect ${fmtC(a.revenue)} of revenue across ${a.count} high-value customers.` },
  { action: "review_request", key: "loyal", template: "loyal_thanks", title: "Review Request Campaign", tone: "info", reason: (a) => `Ask ${a.count} happy loyal customers for reviews to build social proof.` },
];

export function buildCustomerRecommendations(audiences: CustomerAudience[]): CustomerRecommendation[] {
  const map = new Map(audiences.map((a) => [a.key, a]));
  const recs: CustomerRecommendation[] = [];
  for (const d of REC_DEFS) {
    const a = map.get(d.key);
    if (!a || a.count === 0) continue;
    recs.push({
      id: `crec-${d.action}`,
      action: d.action,
      title: d.title,
      detail: d.reason(a),
      tone: d.tone,
      template: d.template,
      audienceKey: a.key,
      count: a.count,
      impact: a.revenue || a.count,
    });
  }
  // Referral campaign — from high referral-potential customers
  const referralBase = audiences.find((a) => a.key === "loyal") ?? audiences.find((a) => a.key === "vip");
  if (referralBase) {
    recs.push({
      id: "crec-referral",
      action: "referral",
      title: "Referral Campaign",
      detail: `Turn ${referralBase.count} loyal advocates into referrers with a refer-a-friend offer.`,
      tone: "good",
      template: referralBase.template ?? "loyal_thanks",
      audienceKey: referralBase.key,
      count: referralBase.count,
      impact: referralBase.revenue,
    });
  }
  return recs.sort((a, b) => b.impact - a.impact);
}

/* ----------------------------------------------------------- alerts */

export type CustomerMarketingAlert = {
  id: string;
  severity: "high" | "medium" | "low";
  kind: "vip_inactive" | "high_value_risk" | "loyal_churn" | "dormant_opportunity" | "referral_opportunity" | "review_opportunity";
  title: string;
  detail: string;
  customerId: string;
};

export function detectCustomerMarketingAlerts(rows: CustomerIntel[]): CustomerMarketingAlert[] {
  const out: CustomerMarketingAlert[] = [];
  for (const c of rows) {
    if (c.tags.includes("VIP") && (c.recencyDays ?? 0) > 45)
      out.push({ id: `vipi-${c.id}`, severity: "high", kind: "vip_inactive", title: `VIP inactive — ${c.name}`, detail: `No order in ${c.recencyDays}d. Trigger a VIP reward.`, customerId: c.id });
    if (c.tags.includes("High Value") && c.churnRisk >= 60)
      out.push({ id: `hvr-${c.id}`, severity: "high", kind: "high_value_risk", title: `High-value at risk — ${c.name}`, detail: `Churn ${c.churnRisk}/100. Launch retention offer.`, customerId: c.id });
    if (c.tags.includes("Loyal") && c.churnRisk >= 55)
      out.push({ id: `lc-${c.id}`, severity: "medium", kind: "loyal_churn", title: `Loyal churn risk — ${c.name}`, detail: `Loyal buyer slipping (churn ${c.churnRisk}). Send a winback.`, customerId: c.id });
    if (c.ordersCount > 0 && (c.recencyDays ?? 0) > 150 && c.lifetimeSpend > 0)
      out.push({ id: `do-${c.id}`, severity: "low", kind: "dormant_opportunity", title: `Dormant opportunity — ${c.name}`, detail: `${fmtC(c.lifetimeSpend)} lifetime, dormant ${c.recencyDays}d. Reactivate.`, customerId: c.id });
    if (c.tags.includes("Loyal") && c.refundRate < 0.1 && c.reviews === 0 && c.ordersCount >= 2)
      out.push({ id: `ro-${c.id}`, severity: "low", kind: "review_opportunity", title: `Review opportunity — ${c.name}`, detail: `Happy repeat buyer with no reviews yet — ask for one.`, customerId: c.id });
    if ((c.tags.includes("VIP") || c.tags.includes("Loyal")) && c.refundRate < 0.05 && c.frequencyPerMonth >= 1)
      out.push({ id: `refo-${c.id}`, severity: "low", kind: "referral_opportunity", title: `Referral opportunity — ${c.name}`, detail: `Frequent, low-refund advocate — invite to refer friends.`, customerId: c.id });
  }
  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 40);
}

/* --------------------------------------------------------- analytics */

export type CustomerMarketingAnalytics = {
  audienceRevenue: number; // total LTV across targetable audiences
  audienceProfit: number;
  campaignRevenue: number; // revenue from active/completed customer campaigns
  campaignProfit: number;
  campaignCost: number;
  campaignRoi: number;
  retentionRate: number; // share of buyers with 2+ orders
  growthCustomers: number; // new in last 30d
  reachableCustomers: number; // customers in any targetable audience
};

export function buildCustomerMarketingAnalytics(
  rows: CustomerIntel[],
  audiences: CustomerAudience[],
  campaigns: Campaign[],
): CustomerMarketingAnalytics {
  const buyers = rows.filter((c) => c.ordersCount > 0);
  const retentionRate = buyers.length ? buyers.filter((c) => c.ordersCount >= 2).length / buyers.length : 0;
  const reachable = new Set<string>();
  let audienceRevenue = 0;
  let audienceProfit = 0;
  audiences.forEach((a) => {
    audienceRevenue += a.revenue;
    audienceProfit += a.profit;
    a.members.forEach((m) => reachable.add(m.id));
  });

  const live = campaigns.filter(
    (c) => (c.status === "active" || c.status === "completed") && isCustomerCampaign(c),
  );
  const campaignRevenue = live.reduce((s, c) => s + c.metrics.revenue, 0);
  const campaignProfit = live.reduce((s, c) => s + c.metrics.profit, 0);
  const campaignCost = live.reduce((s, c) => s + c.metrics.cost, 0);

  return {
    audienceRevenue,
    audienceProfit,
    campaignRevenue,
    campaignProfit,
    campaignCost,
    campaignRoi: campaignCost > 0 ? campaignProfit / campaignCost : 0,
    retentionRate,
    growthCustomers: rows.filter((c) => c.tenureDays <= 30).length,
    reachableCustomers: reachable.size,
  };
}

/* ----------------------------------------------------- campaign helpers */

function isCustomerCampaign(c: Campaign): boolean {
  return c.config?.source === "customer_intelligence" || !!c.config?.audience_key || c.campaign_type?.startsWith?.("customer");
}

/** Campaigns currently targeting a given audience (any non-completed status). */
export function campaignsForAudience(key: AudienceKey, campaigns: Campaign[]): Campaign[] {
  return campaigns.filter((c) => c.config?.audience_key === key && c.status !== "completed");
}

export async function fetchCustomerCampaigns(): Promise<Campaign[]> {
  const { data } = await supabase
    .from("marketing_campaigns")
    .select("*")
    .order("created_at", { ascending: false });
  return ((data as Record<string, unknown>[]) ?? []).map(mapCampaignRow);
}

/* ----------------------------------------------------- one-click actions */

export async function createCustomerCampaign(opts: {
  template: string;
  audience: CustomerAudience;
  recommendationId?: string;
  launch?: boolean;
  scheduledAt?: string | null;
}): Promise<{ id?: string; error?: string }> {
  const tpl = TEMPLATE_BY_KEY[opts.template];
  const label = tpl ? tpl.label : "Customer Campaign";
  const name = `${label} — ${opts.audience.label}`;
  const status: CampaignStatus = opts.launch ? "active" : opts.scheduledAt ? "scheduled" : "draft";
  const res = await createCampaign({
    name,
    campaign_type: `customer_${opts.template}`,
    segment: opts.audience.selector.kind === "segment" ? opts.audience.selector.value : null,
    audience_size: opts.audience.count,
    status,
    scheduled_at: opts.scheduledAt ?? null,
    config: {
      source: "customer_intelligence",
      audience_key: opts.audience.key,
      audience_label: opts.audience.label,
      selector: opts.audience.selector,
      template: opts.template,
    },
  });
  if (res.error || !res.id) return { error: res.error ?? "Failed to create campaign" };
  if (opts.launch) {
    await supabase.from("marketing_campaigns")
      .update({ launched_at: new Date().toISOString() } as never).eq("id", res.id);
  }
  logActivity("customer_marketing_campaign", "marketing_campaign", res.id, {
    template: opts.template, audience: opts.audience.key, size: opts.audience.count,
    recommendation: opts.recommendationId, launched: !!opts.launch, scheduled: opts.scheduledAt ?? null,
  });
  return { id: res.id };
}

export async function launchCustomerCampaign(id: string): Promise<{ error?: string }> {
  const res = await launchCampaign(id);
  if (!res.error) logActivity("customer_marketing_launch", "marketing_campaign", id);
  return res;
}

export async function pauseCustomerCampaign(id: string): Promise<{ error?: string }> {
  const res = await pauseCampaign(id);
  if (!res.error) logActivity("customer_marketing_pause", "marketing_campaign", id);
  return res;
}

/** Duplicate a campaign as a fresh draft (audience + config preserved). */
export async function duplicateCustomerCampaign(c: Campaign): Promise<{ id?: string; error?: string }> {
  const res = await createCampaign({
    name: `${c.name} (copy)`,
    campaign_type: c.campaign_type,
    region: c.region,
    segment: c.segment,
    audience_size: c.audience_size,
    status: "draft",
    config: { ...c.config, duplicated_from: c.id },
  });
  if (res.error || !res.id) return { error: res.error ?? "Failed to duplicate" };
  logActivity("customer_marketing_duplicate", "marketing_campaign", res.id, { from: c.id });
  return { id: res.id };
}

/** Pause every active campaign targeting an audience. */
export async function pauseAudiencePromotions(key: AudienceKey, campaigns: Campaign[]): Promise<{ paused: number }> {
  const toPause = campaigns.filter((c) => c.status === "active" && c.config?.audience_key === key);
  for (const c of toPause) await pauseCampaign(c.id);
  if (toPause.length) logActivity("customer_marketing_pause_audience", "marketing_campaign", toPause.map((c) => c.id).join(","), { audience: key });
  return { paused: toPause.length };
}

/** Audited audience export — returns the rows; the UI handles the download. */
export function exportAudience(audience: CustomerAudience): Record<string, string | number>[] {
  logActivity("customer_marketing_export", "customer", undefined, { audience: audience.key, count: audience.count });
  return audience.members.map((c) => ({
    name: c.name,
    email: c.email ?? "",
    phone: c.phone ?? "",
    region: c.region,
    segment: c.segment,
    lifetime_spend: Math.round(c.lifetimeSpend),
    orders: c.ordersCount,
    aov: Math.round(c.aov),
    profit: Math.round(c.profit),
    churn_risk: c.churnRisk,
    recency_days: c.recencyDays ?? "",
    tags: c.tags.join("|"),
  }));
}

export function rejectCustomerRecommendation(rec: CustomerRecommendation): void {
  logActivity("customer_marketing_reject", "recommendation", rec.id, { action: rec.action, audience: rec.audienceKey });
}

/* ---------------------------------------------------------------- format */

export function fmtC(n: number, region: RegionScope = "india"): string {
  const currency = region === "international" ? "USD" : "INR";
  return new Intl.NumberFormat(currency === "USD" ? "en-US" : "en-IN", {
    style: "currency", currency, maximumFractionDigits: 0,
  }).format(Math.round(n || 0));
}

export const AUD_TONE: Record<CustomerAudience["tone"], string> = {
  danger: "ring-destructive/20",
  warn: "ring-amber-400/20",
  good: "ring-emerald-400/20",
  info: "ring-border",
};

export const REC_TONE: Record<CustomerRecommendation["tone"], string> = {
  danger: "border-destructive/40 bg-destructive/5",
  warn: "border-amber-400/30 bg-amber-400/5",
  good: "border-emerald-400/30 bg-emerald-400/5",
  info: "border-border bg-white/[0.02]",
};

export type { Campaign, CampaignMetrics, CampaignStatus, RegionScope } from "@/lib/marketing-automation";
