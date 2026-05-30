import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/components/admin/AdminShell";
import type { ProductIntel } from "@/lib/inventory-intelligence";
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

/**
 * Inventory ↔ Marketing Integration.
 *
 * Turns Inventory Intelligence into marketing action. EVERY signal here is
 * derived from real inventory + sales data (ProductIntel, computed from
 * products / orders / order_items / returns) and real campaign records
 * (marketing_campaigns). No simulated inventory intelligence.
 *
 * It does three things:
 *  1. Classifies the catalogue into marketing opportunity buckets.
 *  2. Scores every product for promotion/clearance/demand/velocity/risk/margin.
 *  3. Generates store-level marketing recommendations + one-click actions that
 *     create real campaigns / flash sales / homepage features (all audited).
 */

/* ----------------------------------------------------------------- scoring */

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

export type InventoryMarketingScore = {
  promotion: number; // worth promoting (demand + margin + stock to move)
  clearance: number; // should be cleared (dead/overstock/slow)
  demand: number; // market pull
  velocity: number; // sell-through speed
  risk: number; // inventory risk (from intel)
  margin: number; // profit headroom
};

export function marginPct(p: ProductIntel): number {
  return p.price > 0 ? (p.price - p.cost) / p.price : 0;
}

export function scoreProduct(p: ProductIntel): InventoryMarketingScore {
  const mPct = marginPct(p);
  const margin = clamp(mPct * 100);
  const demand = clamp(
    Math.log10(p.unitsSold + 1) * 28 +
      (p.trend === "up" ? 25 : p.trend === "flat" ? 10 : 0) +
      Math.min(22, p.avgDailySales * 30),
  );
  const velocity = clamp(Math.min(60, p.avgDailySales * 120) + Math.log10(p.unitsSold + 1) * 18);
  const cover = p.daysRemaining;
  const clearance = clamp(
    (p.classification === "dead" ? 48 : p.classification === "overstock" ? 36 : p.classification === "slow" ? 20 : 0) +
      (p.avgDailySales === 0 && p.stock > 0 ? 22 : 0) +
      (cover !== null ? Math.min(24, cover / 8) : 0) -
      velocity * 0.15,
  );
  // Worth promoting: demand + margin, weighted up when there is stock to move
  // and down when stock is scarce (don't promote what you can't ship).
  const stockHeadroom = p.available > p.threshold ? Math.min(20, p.available / Math.max(1, p.threshold) * 4) : -25;
  const promotion = clamp(demand * 0.4 + margin * 0.35 + stockHeadroom + (p.trend === "up" ? 10 : 0));
  return { promotion, clearance, demand, velocity, risk: p.riskScore, margin };
}

/* --------------------------------------------------------------- buckets */

export type OpportunityKind =
  | "overstock"
  | "dead"
  | "slow"
  | "fast"
  | "bestseller"
  | "low_stock"
  | "out_of_stock"
  | "back_in_stock"
  | "high_margin"
  | "high_return";

export type OpportunityBucket = {
  kind: OpportunityKind;
  label: string;
  tone: "danger" | "warn" | "good" | "info";
  /** suggested one-click campaign template, when applicable */
  template?: string;
  /** suggested storefront action, when applicable */
  storefront?: "feature" | "trending" | "flash" | "bestseller";
  products: ProductIntel[];
  capital: number; // capital tied up (cost * stock) for the bucket
  revenue: number; // trailing revenue across bucket
};

export function buildOpportunityBuckets(intel: ProductIntel[]): OpportunityBucket[] {
  const sold = [...intel].filter((p) => p.unitsSold > 0).sort((a, b) => b.unitsSold - a.unitsSold);
  const bestsellerSlugs = new Set(sold.slice(0, Math.max(3, Math.ceil(sold.length * 0.1))).map((p) => p.slug));

  const pick = (fn: (p: ProductIntel) => boolean) => intel.filter(fn);
  const sum = (arr: ProductIntel[], f: (p: ProductIntel) => number) => arr.reduce((s, p) => s + f(p), 0);

  const make = (
    kind: OpportunityKind,
    label: string,
    tone: OpportunityBucket["tone"],
    products: ProductIntel[],
    extra: Partial<OpportunityBucket> = {},
  ): OpportunityBucket => ({
    kind,
    label,
    tone,
    products: products.sort((a, b) => b.cost * b.stock - a.cost * a.stock),
    capital: sum(products, (p) => p.cost * p.stock),
    revenue: sum(products, (p) => p.revenue),
    ...extra,
  });

  const buckets: OpportunityBucket[] = [
    make("out_of_stock", "Out of Stock", "danger", pick((p) => p.stock <= 0), {
      template: "back_in_stock",
    }),
    make("back_in_stock", "Restock Momentum", "good",
      pick((p) => p.stock > 0 && p.available <= p.threshold * 2 && p.trend === "up" && p.avgDailySales > 0),
      { template: "back_in_stock" }),
    make("low_stock", "Low Stock", "warn", pick((p) => p.stock > 0 && p.classification === "low")),
    make("dead", "Dead Inventory", "danger", pick((p) => p.classification === "dead"), {
      template: "clearance", storefront: "flash",
    }),
    make("overstock", "Overstock", "warn", pick((p) => p.classification === "overstock"), {
      template: "overstock", storefront: "flash",
    }),
    make("slow", "Slow Movers", "info", pick((p) => p.classification === "slow"), {
      template: "clearance",
    }),
    make("fast", "Fast Movers", "good",
      pick((p) => p.avgDailySales > 0 && p.trend !== "down" && p.classification === "healthy")
        .sort((a, b) => b.avgDailySales - a.avgDailySales).slice(0, 12),
      { template: "fast_moving", storefront: "trending" }),
    make("bestseller", "Best Sellers", "good", pick((p) => bestsellerSlugs.has(p.slug)), {
      template: "best_sellers", storefront: "bestseller",
    }),
    make("high_margin", "High Margin", "good",
      pick((p) => marginPct(p) >= 0.45 && p.stock > 0).sort((a, b) => marginPct(b) - marginPct(a)).slice(0, 12),
      { template: "high_margin" }),
    make("high_return", "High Return", "danger", pick((p) => p.returnRate >= 15 && p.returns >= 2)),
  ];

  return buckets.filter((b) => b.products.length > 0);
}

/* ------------------------------------------------------- recommendations */

export type RecAction =
  | "clearance"
  | "overstock"
  | "fast_mover"
  | "bestseller"
  | "back_in_stock"
  | "bundle"
  | "feature"
  | "pause"
  | "reduce_spend"
  | "increase_spend";

export type InventoryRecommendation = {
  id: string;
  action: RecAction;
  title: string;
  detail: string;
  tone: "danger" | "warn" | "good" | "info";
  template?: string; // campaign template key for create actions
  slugs: string[]; // products the action applies to
  impact: number; // capital or revenue at stake (for sorting / display)
};

export function buildInventoryRecommendations(
  intel: ProductIntel[],
  campaigns: Campaign[],
): InventoryRecommendation[] {
  const buckets = new Map(buildOpportunityBuckets(intel).map((b) => [b.kind, b]));
  const promotedSlugs = activeCampaignSlugs(campaigns);
  const recs: InventoryRecommendation[] = [];

  const b = (k: OpportunityKind) => buckets.get(k);

  const dead = b("dead");
  if (dead) recs.push({
    id: "rec-clearance", action: "clearance", template: "clearance", tone: "danger",
    title: "Create Clearance Campaign",
    detail: `${dead.products.length} dead products tie up ${fmt(dead.capital)} in capital. Clear them with a discount campaign.`,
    slugs: dead.products.map((p) => p.slug), impact: dead.capital,
  });

  const over = b("overstock");
  if (over) recs.push({
    id: "rec-overstock", action: "overstock", template: "overstock", tone: "warn",
    title: "Create Overstock Campaign",
    detail: `${over.products.length} overstocked products (${fmt(over.capital)} capital). Bundle or discount to reduce excess.`,
    slugs: over.products.map((p) => p.slug), impact: over.capital,
  });
  if (over && over.products.length >= 2) recs.push({
    id: "rec-bundle", action: "bundle", template: "overstock", tone: "info",
    title: "Create Bundle Campaign",
    detail: `Pair ${over.products.length} overstocked items into a bundle offer to lift average order value.`,
    slugs: over.products.slice(0, 4).map((p) => p.slug), impact: over.revenue,
  });

  const fast = b("fast");
  if (fast) recs.push({
    id: "rec-fast", action: "fast_mover", template: "fast_moving", tone: "good",
    title: "Create Fast Mover Campaign",
    detail: `${fast.products.length} products are selling quickly with healthy stock. Spotlight them to accelerate revenue.`,
    slugs: fast.products.map((p) => p.slug), impact: fast.revenue,
  });

  const best = b("bestseller");
  if (best) {
    recs.push({
      id: "rec-bestseller", action: "bestseller", template: "best_sellers", tone: "good",
      title: "Create Bestseller Campaign",
      detail: `Promote your top ${best.products.length} sellers (${fmt(best.revenue)} trailing revenue) to maximise momentum.`,
      slugs: best.products.map((p) => p.slug), impact: best.revenue,
    });
    const unfeatured = best.products.filter((p) => !promotedSlugs.has(p.slug)).slice(0, 6);
    if (unfeatured.length) recs.push({
      id: "rec-feature", action: "feature", tone: "good",
      title: "Feature On Homepage",
      detail: `${unfeatured.length} best sellers are not currently featured. Surface them on the homepage.`,
      slugs: unfeatured.map((p) => p.slug), impact: unfeatured.reduce((s, p) => s + p.revenue, 0),
    });
  }

  const oos = b("out_of_stock");
  if (oos) {
    const withDemand = oos.products.filter((p) => p.avgDailySales > 0);
    if (withDemand.length) recs.push({
      id: "rec-back-in-stock", action: "back_in_stock", template: "back_in_stock", tone: "warn",
      title: "Create Back-In-Stock Campaign",
      detail: `${withDemand.length} out-of-stock products still have demand. Capture waitlist signups for when they return.`,
      slugs: withDemand.map((p) => p.slug), impact: withDemand.reduce((s, p) => s + p.avgDailySales * p.price * 30, 0),
    });
  }

  // Promotion causing stock risk → pause promotions on low/critical stock items.
  const riskyPromoted = intel.filter(
    (p) => promotedSlugs.has(p.slug) && (p.stock <= 0 || p.classification === "low"),
  );
  if (riskyPromoted.length) recs.push({
    id: "rec-pause", action: "pause", tone: "danger",
    title: "Pause Promotions",
    detail: `${riskyPromoted.length} promoted products are low or out of stock. Pause to avoid overselling.`,
    slugs: riskyPromoted.map((p) => p.slug), impact: riskyPromoted.reduce((s, p) => s + p.revenue, 0),
  });

  // High return products being promoted → reduce spend.
  const ret = b("high_return");
  const promotedReturns = ret?.products.filter((p) => promotedSlugs.has(p.slug)) ?? [];
  if (promotedReturns.length) recs.push({
    id: "rec-reduce-spend", action: "reduce_spend", tone: "warn",
    title: "Reduce Marketing Spend",
    detail: `${promotedReturns.length} promoted products have high return rates. Cut spend until quality improves.`,
    slugs: promotedReturns.map((p) => p.slug), impact: promotedReturns.reduce((s, p) => s + p.returnRate, 0),
  });

  // High margin + rising demand not yet promoted → increase spend.
  const margin = b("high_margin");
  const scaleUp = margin?.products.filter((p) => p.trend === "up" && !promotedSlugs.has(p.slug)) ?? [];
  if (scaleUp.length) recs.push({
    id: "rec-increase-spend", action: "increase_spend", template: "high_margin", tone: "good",
    title: "Increase Marketing Spend",
    detail: `${scaleUp.length} high-margin products have rising demand and no active campaign. Scale up promotion.`,
    slugs: scaleUp.map((p) => p.slug), impact: scaleUp.reduce((s, p) => s + p.revenue, 0),
  });

  return recs.sort((a, b2) => b2.impact - a.impact);
}

/* -------------------------------------------------------------- analytics */

export type InventoryMarketingAnalytics = {
  inventoryRevenue: number; // trailing revenue across catalogue
  campaignRevenue: number; // revenue from active/completed campaigns
  campaignProfit: number;
  campaignCost: number;
  promotionRoi: number;
  inventoryRoi: number; // trailing profit / inventory cost value
  capitalAtRisk: number; // dead + overstock capital
  clearableCapital: number; // capital recoverable via clearance
  stockReductionUnits: number; // units that clearance/overstock could move
};

export function buildInventoryMarketingAnalytics(
  intel: ProductIntel[],
  campaigns: Campaign[],
): InventoryMarketingAnalytics {
  const inventoryRevenue = intel.reduce((s, p) => s + p.revenue, 0);
  const inventoryProfit = intel.reduce((s, p) => s + p.profit, 0);
  const inventoryCost = intel.reduce((s, p) => s + p.cost * p.stock, 0);

  const live = campaigns.filter((c) => c.status === "active" || c.status === "completed");
  const campaignRevenue = live.reduce((s, c) => s + c.metrics.revenue, 0);
  const campaignProfit = live.reduce((s, c) => s + c.metrics.profit, 0);
  const campaignCost = live.reduce((s, c) => s + c.metrics.cost, 0);

  const atRisk = intel.filter((p) => p.classification === "dead" || p.classification === "overstock");
  const capitalAtRisk = atRisk.reduce((s, p) => s + p.cost * p.stock, 0);
  const stockReductionUnits = atRisk.reduce((s, p) => s + p.stock, 0);

  return {
    inventoryRevenue,
    campaignRevenue,
    campaignProfit,
    campaignCost,
    promotionRoi: campaignCost > 0 ? campaignProfit / campaignCost : 0,
    inventoryRoi: inventoryCost > 0 ? inventoryProfit / inventoryCost : 0,
    capitalAtRisk,
    clearableCapital: capitalAtRisk,
    stockReductionUnits,
  };
}

/* ------------------------------------------------------ campaign helpers */

function activeCampaignSlugs(campaigns: Campaign[]): Set<string> {
  const set = new Set<string>();
  for (const c of campaigns) {
    if (c.status !== "active" && c.status !== "scheduled" && c.status !== "paused") continue;
    const slugs = c.config?.product_slugs;
    if (Array.isArray(slugs)) for (const s of slugs as string[]) set.add(s);
  }
  return set;
}

/** Campaigns currently linked to a specific product (any status except completed). */
export function campaignsForSlug(slug: string, campaigns: Campaign[]): Campaign[] {
  return campaigns.filter((c) => {
    const slugs = c.config?.product_slugs;
    return Array.isArray(slugs) && (slugs as string[]).includes(slug) && c.status !== "completed";
  });
}

export function mapCampaignRow(r: Record<string, unknown>): Campaign {
  const m = (r.metrics ?? {}) as Partial<CampaignMetrics>;
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
    metrics: {
      revenue: Number(m.revenue) || 0, profit: Number(m.profit) || 0, orders: Number(m.orders) || 0,
      reached: Number(m.reached) || 0, opens: Number(m.opens) || 0, clicks: Number(m.clicks) || 0,
      conversions: Number(m.conversions) || 0, cost: Number(m.cost) || 0,
    },
    scheduled_at: (r.scheduled_at as string) ?? null,
    launched_at: (r.launched_at as string) ?? null,
    completed_at: (r.completed_at as string) ?? null,
    created_by: (r.created_by as string) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

export async function fetchInventoryCampaigns(): Promise<Campaign[]> {
  const { data } = await supabase
    .from("marketing_campaigns")
    .select("*")
    .order("created_at", { ascending: false });
  return ((data as Record<string, unknown>[]) ?? []).map(mapCampaignRow);
}

/* ------------------------------------------------------ one-click actions */

/**
 * Create a campaign from an inventory opportunity. Links the products via
 * config.product_slugs so the existing notification/attribution layer treats
 * it like any other campaign. Audited via createCampaign + an accept log.
 */
export async function createInventoryCampaign(opts: {
  template: string;
  slugs: string[];
  recommendationId?: string;
  launch?: boolean;
}): Promise<{ id?: string; error?: string }> {
  const tpl = TEMPLATE_BY_KEY[opts.template];
  const label = tpl ? tpl.label : "Inventory Promotion";
  const name = `${label} — ${opts.slugs.length} product${opts.slugs.length === 1 ? "" : "s"}`;
  const res = await createCampaign({
    name,
    campaign_type: opts.template,
    status: opts.launch ? "active" : "draft",
    config: { product_slugs: opts.slugs, source: "inventory_intelligence", template: opts.template },
  });
  if (res.error || !res.id) return { error: res.error ?? "Failed to create campaign" };
  if (opts.launch) {
    await supabase.from("marketing_campaigns")
      .update({ launched_at: new Date().toISOString() } as never).eq("id", res.id);
  }
  logActivity("inventory_marketing_campaign", "marketing_campaign", res.id, {
    template: opts.template, slugs: opts.slugs, recommendation: opts.recommendationId, launched: !!opts.launch,
  });
  return { id: res.id };
}

/** Pause every active campaign that promotes any of the given products. */
export async function pauseInventoryPromotions(slugs: string[], campaigns: Campaign[]): Promise<{ paused: number }> {
  const target = new Set(slugs);
  const toPause = campaigns.filter(
    (c) => c.status === "active" &&
      Array.isArray(c.config?.product_slugs) &&
      (c.config!.product_slugs as string[]).some((s) => target.has(s)),
  );
  for (const c of toPause) await pauseCampaign(c.id);
  if (toPause.length) {
    logActivity("inventory_marketing_pause", "marketing_campaign", toPause.map((c) => c.id).join(","), { slugs });
  }
  return { paused: toPause.length };
}

export async function launchInventoryCampaign(id: string): Promise<{ error?: string }> {
  const res = await launchCampaign(id);
  if (!res.error) logActivity("inventory_marketing_launch", "marketing_campaign", id);
  return res;
}

/** Add products to a flash sale (real flash_sales row). */
export async function createInventoryFlashSale(opts: {
  slugs: string[];
  discountPercent: number;
  durationHours: number;
}): Promise<{ id?: string; error?: string }> {
  const endsAt = new Date(Date.now() + opts.durationHours * 3600_000).toISOString();
  const { data, error } = await supabase
    .from("flash_sales")
    .insert({
      name: `Inventory Flash Sale — ${opts.slugs.length} products`,
      product_slugs: opts.slugs,
      discount_percent: Math.max(1, Math.min(90, Math.round(opts.discountPercent))),
      ends_at: endsAt,
      active: true,
    } as never)
    .select("id")
    .single();
  if (error) return { error: error.message };
  logActivity("inventory_marketing_flash_sale", "flash_sale", (data as { id: string }).id, {
    slugs: opts.slugs, discount: opts.discountPercent,
  });
  return { id: (data as { id: string }).id };
}

/** Feature / unfeature products on the homepage (storefront linking). */
export async function featureInventoryProducts(slugs: string[], featured = true): Promise<{ error?: string }> {
  const { error } = await supabase.from("products").update({ featured } as never).in("slug", slugs);
  if (error) return { error: error.message };
  logActivity(featured ? "inventory_marketing_feature" : "inventory_marketing_unfeature", "product", slugs.join(","), {
    slugs, featured,
  });
  return {};
}

/** Audit when an admin dismisses a recommendation. */
export function rejectRecommendation(rec: InventoryRecommendation): void {
  logActivity("inventory_marketing_reject", "recommendation", rec.id, {
    action: rec.action, slugs: rec.slugs,
  });
}

/* ---------------------------------------------------------------- format */

export function fmt(n: number, region: RegionScope = "india"): string {
  const currency = region === "international" ? "USD" : "INR";
  return new Intl.NumberFormat(currency === "USD" ? "en-US" : "en-IN", {
    style: "currency", currency, maximumFractionDigits: 0,
  }).format(Math.round(n || 0));
}

export const REC_TONE: Record<InventoryRecommendation["tone"], string> = {
  danger: "border-destructive/40 bg-destructive/5",
  warn: "border-amber-400/30 bg-amber-400/5",
  good: "border-emerald-400/30 bg-emerald-400/5",
  info: "border-border bg-white/[0.02]",
};
