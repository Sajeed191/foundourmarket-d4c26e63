import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/components/admin/AdminShell";
import { fetchCustomerIntel, buildCustomerIntel, type CustomerSegment } from "@/lib/customer-intelligence";
import {
  type Campaign,
  type CampaignMetrics,
  type RegionScope,
  type CampaignStatus,
  EMPTY_METRICS,
  TEMPLATE_BY_KEY,
  campaignRates,
  createCampaign,
  launchCampaign,
  pauseCampaign,
} from "@/lib/marketing-automation";

/**
 * Product ↔ Marketing Integration.
 *
 * Turns a single product page into a marketing command center. EVERY number
 * here is derived from real database records:
 *   - marketing_campaigns (config.product_slugs links a campaign to a product)
 *   - order_items + orders (real revenue / profit / orders / buyers)
 *   - products (cost, price, featured, counts)
 *   - customer-intelligence (segment distribution of this product's buyers)
 *
 * No simulated campaign data. Campaign metrics live on marketing_campaigns and
 * are attributed to a product proportionally across the products a campaign
 * promotes.
 */

/* ------------------------------------------------------------------ types */

export type ProductFinancials = {
  revenue: number;
  profit: number;
  margin: number; // 0..1
  orders: number;
  units: number;
  uniqueBuyers: number;
  cost: number;
  price: number;
  recentRevenue: number; // last half of window
  priorRevenue: number; // first half of window
  recentProfit: number;
  priorProfit: number;
  revenueTrend: "up" | "down" | "flat";
  profitTrend: "up" | "down" | "flat";
};

export type ProductCampaignRow = {
  campaign: Campaign;
  share: number; // 0..1 attribution share for this product
  attributed: CampaignMetrics;
  roi: number;
  conversionRate: number;
  rating: "excellent" | "good" | "average" | "poor" | "n/a";
};

export type ProductMarketingAnalytics = {
  campaignRevenue: number;
  campaignProfit: number;
  campaignOrders: number;
  campaignConversions: number;
  campaignRoi: number;
  contributionPct: number; // campaign revenue / total product revenue
  topCampaign: ProductCampaignRow | null;
  worstCampaign: ProductCampaignRow | null;
  avgPerformance: number; // avg ROI across featuring campaigns
};

export type ProductScores = {
  trending: number;
  marketing: number;
  conversion: number;
  profit: number;
  velocity: number;
  customerInterest: number;
};

export type ProductCustomerLink = {
  vip: number;
  repeat: number;
  loyal: number;
  highValue: number;
  total: number;
  distribution: { segment: CustomerSegment; count: number }[];
};

export type InventoryMarketingLink = {
  stock: number;
  reserved: number;
  threshold: number;
  risk: "critical" | "low" | "healthy" | "overstock" | "dead";
  stockStatus: string;
  recommendedAction: string;
  actionTone: "promote" | "reduce" | "clearance" | "restock" | "overstock" | "steady";
};

export type ProductMarketing = {
  slug: string;
  featured: boolean;
  region: RegionScope;
  financials: ProductFinancials;
  active: ProductCampaignRow[];
  history: ProductCampaignRow[];
  allCampaigns: Campaign[]; // every campaign (for "add to existing")
  analytics: ProductMarketingAnalytics;
  scores: ProductScores;
  customers: ProductCustomerLink;
  inventory: InventoryMarketingLink;
};

/* --------------------------------------------------------------- helpers */

const WINDOW_DAYS = 90;
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const trendOf = (recent: number, prior: number): "up" | "down" | "flat" => {
  if (prior <= 0) return recent > 0 ? "up" : "flat";
  const d = (recent - prior) / prior;
  return d > 0.08 ? "up" : d < -0.08 ? "down" : "flat";
};

function rate(campaign: Campaign): { roi: number; conversionRate: number } {
  const r = campaignRates(campaign);
  return { roi: r.roi, conversionRate: r.conversionRate };
}

function ratingOf(roi: number, conv: number, hasCost: boolean): ProductCampaignRow["rating"] {
  if (!hasCost && conv === 0) return "n/a";
  if (roi >= 3 || conv >= 0.05) return "excellent";
  if (roi >= 1.5 || conv >= 0.02) return "good";
  if (roi >= 0.8 || conv >= 0.008) return "average";
  return "poor";
}

function campaignSlugs(c: Campaign): string[] {
  const s = c.config?.product_slugs;
  return Array.isArray(s) ? (s as string[]) : [];
}

function attribute(c: Campaign, share: number): CampaignMetrics {
  const m = c.metrics;
  return {
    revenue: m.revenue * share,
    profit: m.profit * share,
    orders: m.orders * share,
    reached: m.reached * share,
    opens: m.opens * share,
    clicks: m.clicks * share,
    conversions: m.conversions * share,
    cost: m.cost * share,
  };
}

function toRow(c: Campaign): ProductCampaignRow {
  const slugs = campaignSlugs(c);
  const share = slugs.length > 0 ? 1 / slugs.length : 1;
  const attributed = attribute(c, share);
  const { roi, conversionRate } = rate(c);
  return {
    campaign: c,
    share,
    attributed,
    roi,
    conversionRate,
    rating: ratingOf(roi, conversionRate, c.metrics.cost > 0),
  };
}

/* ------------------------------------------------------------- data load */

export async function fetchProductMarketing(slug: string): Promise<ProductMarketing> {
  const sinceIso = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();
  const midIso = new Date(Date.now() - (WINDOW_DAYS / 2) * 86400_000).toISOString();

  const [prodRes, campRes, itemRes] = await Promise.all([
    supabase
      .from("products")
      .select("slug,featured,cost_price_inr,price_inr,price,cost,stock_quantity,reserved_quantity,low_stock_threshold,views_count,sold_count,wishlist_count")
      .eq("slug", slug)
      .maybeSingle(),
    supabase.from("marketing_campaigns").select("*").order("created_at", { ascending: false }),
    supabase
      .from("order_items")
      .select("quantity,line_total,unit_price,orders!inner(user_id,status,payment_status,market_region,created_at)")
      .eq("product_slug", slug)
      .limit(100000),
  ]);

  const prod = (prodRes.data ?? {}) as Record<string, unknown>;
  const cost = Number(prod.cost ?? prod.cost_price_inr ?? 0);
  const price = Number(prod.price ?? prod.price_inr ?? 0);

  // ---- financials from real paid order_items
  let revenue = 0, profit = 0, units = 0, recentRevenue = 0, priorRevenue = 0, recentProfit = 0, priorProfit = 0;
  const orderBuyers = new Map<string, string>(); // not needed but keep
  const buyerIds = new Set<string>();
  const paidOrderIds = new Set<string>();
  let orders = 0;

  type Row = {
    quantity: number | null; line_total: number | null; unit_price: number | null;
    orders: { user_id: string | null; status: string | null; payment_status: string | null; market_region: string | null; created_at: string } | null;
  };
  const rows = (itemRes.data as unknown as Row[]) ?? [];
  let regionVotes = { india: 0, international: 0 };
  for (const it of rows) {
    const o = it.orders;
    if (!o) continue;
    const paid = o.payment_status === "paid" || o.status === "delivered" || o.status === "shipped" || o.status === "completed";
    if (!paid) continue;
    if (o.created_at < sinceIso) {
      // still count lifetime totals
    }
    const qty = Number(it.quantity) || 0;
    const lineTotal = Number(it.line_total) || (Number(it.unit_price) || 0) * qty;
    const lineProfit = lineTotal - cost * qty;
    revenue += lineTotal;
    profit += lineProfit;
    units += qty;
    if (o.created_at >= sinceIso) {
      if (o.created_at >= midIso) { recentRevenue += lineTotal; recentProfit += lineProfit; }
      else { priorRevenue += lineTotal; priorProfit += lineProfit; }
    }
    if (o.user_id) { buyerIds.add(o.user_id); orderBuyers.set(o.user_id, o.user_id); }
    if (o.market_region === "international") regionVotes.international++; else regionVotes.india++;
    orders++;
  }
  const region: RegionScope = regionVotes.international > regionVotes.india ? "international" : "india";
  const margin = revenue > 0 ? profit / revenue : 0;

  const financials: ProductFinancials = {
    revenue, profit, margin, orders, units, uniqueBuyers: buyerIds.size, cost, price,
    recentRevenue, priorRevenue, recentProfit, priorProfit,
    revenueTrend: trendOf(recentRevenue, priorRevenue),
    profitTrend: trendOf(recentProfit, priorProfit),
  };

  // ---- campaigns
  const allCampaigns = ((campRes.data as Record<string, unknown>[]) ?? []).map((r) => mapCampaignLite(r));
  const featuring = allCampaigns.filter((c) => campaignSlugs(c).includes(slug));
  const activeStatuses: CampaignStatus[] = ["active", "scheduled", "paused", "draft"];
  const active = featuring.filter((c) => activeStatuses.includes(c.status) && c.status !== "completed").map(toRow);
  const history = featuring.filter((c) => c.status === "completed").map(toRow);

  // ---- analytics
  const featRows = featuring.map(toRow);
  const campaignRevenue = featRows.reduce((s, r) => s + r.attributed.revenue, 0);
  const campaignProfit = featRows.reduce((s, r) => s + r.attributed.profit, 0);
  const campaignOrders = featRows.reduce((s, r) => s + r.attributed.orders, 0);
  const campaignConversions = featRows.reduce((s, r) => s + r.attributed.conversions, 0);
  const campaignCost = featRows.reduce((s, r) => s + r.attributed.cost, 0);
  const campaignRoi = campaignCost > 0 ? campaignProfit / campaignCost : 0;
  const withRevenue = featRows.filter((r) => r.attributed.revenue > 0);
  const sorted = [...withRevenue].sort((a, b) => b.attributed.revenue - a.attributed.revenue);
  const analytics: ProductMarketingAnalytics = {
    campaignRevenue, campaignProfit, campaignOrders, campaignConversions, campaignRoi,
    contributionPct: revenue > 0 ? clamp((campaignRevenue / revenue) * 100, 0, 100) / 100 : 0,
    topCampaign: sorted[0] ?? null,
    worstCampaign: sorted.length > 1 ? sorted[sorted.length - 1] : null,
    avgPerformance: featRows.length > 0 ? featRows.reduce((s, r) => s + r.roi, 0) / featRows.length : 0,
  };

  // ---- inventory link
  const stock = Number(prod.stock_quantity) || 0;
  const reserved = Number(prod.reserved_quantity) || 0;
  const threshold = Number(prod.low_stock_threshold) || 0;
  const sold = Number(prod.sold_count) || units;
  const inventory = inventoryLink(stock, reserved, threshold, sold, recentRevenue);

  // ---- customer link (segment distribution of this product's buyers)
  let customers: ProductCustomerLink = { vip: 0, repeat: 0, loyal: 0, highValue: 0, total: 0, distribution: [] };
  if (buyerIds.size > 0) {
    try {
      const intel = buildCustomerIntel(await fetchCustomerIntel());
      const mine = intel.filter((c) => buyerIds.has(c.id));
      const dist = new Map<CustomerSegment, number>();
      let vip = 0, repeat = 0, loyal = 0, highValue = 0;
      for (const c of mine) {
        dist.set(c.segment, (dist.get(c.segment) ?? 0) + 1);
        if (c.segment === "Champions") vip++;
        if (c.segment === "Loyal Customers") loyal++;
        if (c.ordersCount >= 2) repeat++;
        if (c.tags.includes("high_value" as never) || c.lifetimeSpend >= 25000) highValue++;
      }
      customers = {
        vip, repeat, loyal, highValue, total: mine.length,
        distribution: [...dist.entries()].map(([segment, count]) => ({ segment, count })).sort((a, b) => b.count - a.count),
      };
    } catch {
      /* customer intel optional — never block the panel */
    }
  }

  // ---- scores (all derived from real data)
  const views = Number(prod.views_count) || 0;
  const wishlist = Number(prod.wishlist_count) || 0;
  const scores: ProductScores = {
    trending: clamp(Math.round(
      (financials.revenueTrend === "up" ? 35 : financials.revenueTrend === "flat" ? 15 : 5) +
      Math.log10(views + 1) * 18 + Math.log10(sold + 1) * 12,
    )),
    marketing: clamp(Math.round(
      featuring.length * 14 +
      featuring.filter((c) => c.status === "active").length * 16 +
      Math.log10(campaignRevenue + 1) * 10,
    )),
    conversion: clamp(Math.round(
      (withRevenue.length ? (withRevenue.reduce((s, r) => s + r.conversionRate, 0) / withRevenue.length) * 1500 : 0) +
      Math.log10(orders + 1) * 14,
    )),
    profit: clamp(Math.round(margin * 140)),
    velocity: clamp(Math.round(Math.log10(sold + 1) * 34 + Math.log10(units + 1) * 14)),
    customerInterest: clamp(Math.round(
      Math.log10(buyerIds.size + 1) * 30 + Math.log10(wishlist + 1) * 22 + Math.log10(views + 1) * 8,
    )),
  };

  return {
    slug,
    featured: prod.featured === true,
    region,
    financials,
    active,
    history,
    allCampaigns,
    analytics,
    scores,
    customers,
    inventory,
  };
}

function mapCampaignLite(r: Record<string, unknown>): Campaign {
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

function inventoryLink(stock: number, reserved: number, threshold: number, sold: number, recentRevenue: number): InventoryMarketingLink {
  const available = stock - reserved;
  if (stock <= 0) {
    return {
      stock, reserved, threshold, risk: "critical", stockStatus: "Out of stock",
      recommendedAction: "Back-In-Stock Opportunity — capture demand with a waitlist campaign",
      actionTone: "restock",
    };
  }
  if (available <= threshold) {
    return {
      stock, reserved, threshold, risk: "low", stockStatus: "Low stock",
      recommendedAction: recentRevenue > 0 ? "Promote Aggressively — high demand, limited stock urgency" : "Reduce Promotion — protect remaining stock",
      actionTone: recentRevenue > 0 ? "promote" : "reduce",
    };
  }
  if (sold === 0 && stock > 0) {
    return {
      stock, reserved, threshold, risk: "dead", stockStatus: "No sales",
      recommendedAction: "Clearance Candidate — move dead inventory with a discount",
      actionTone: "clearance",
    };
  }
  if (stock > threshold * 6 && sold < stock * 0.1) {
    return {
      stock, reserved, threshold, risk: "overstock", stockStatus: "Overstocked",
      recommendedAction: "Overstock Opportunity — bundle or discount to clear excess",
      actionTone: "overstock",
    };
  }
  return {
    stock, reserved, threshold, risk: "healthy", stockStatus: "Healthy",
    recommendedAction: recentRevenue > 0 ? "Promote Aggressively — strong demand, ample stock" : "Steady — maintain current promotion level",
    actionTone: recentRevenue > 0 ? "promote" : "steady",
  };
}

/* ---------------------------------------------------------- actions + audit */

/** Append a product slug to an existing campaign's config.product_slugs. */
export async function addProductToCampaign(campaign: Campaign, slug: string): Promise<{ error?: string }> {
  const slugs = new Set(campaignSlugs(campaign));
  slugs.add(slug);
  const config = { ...campaign.config, product_slugs: [...slugs] };
  const { error } = await supabase.from("marketing_campaigns").update({ config: config as never }).eq("id", campaign.id);
  if (error) return { error: error.message };
  logActivity("marketing_campaign_add_product", "marketing_campaign", campaign.id, { slug, campaign: campaign.name });
  return {};
}

/** Remove a product slug from a campaign's config.product_slugs. */
export async function removeProductFromCampaign(campaign: Campaign, slug: string): Promise<{ error?: string }> {
  const slugs = campaignSlugs(campaign).filter((s) => s !== slug);
  const config = { ...campaign.config, product_slugs: slugs };
  const { error } = await supabase.from("marketing_campaigns").update({ config: config as never }).eq("id", campaign.id);
  if (error) return { error: error.message };
  logActivity("marketing_campaign_remove_product", "marketing_campaign", campaign.id, { slug, campaign: campaign.name });
  return {};
}

/** Create a campaign that promotes this product, optionally launching immediately. */
export async function createProductCampaign(opts: {
  slug: string;
  productName: string;
  templateKey: string;
  region?: RegionScope;
  launch?: boolean;
}): Promise<{ id?: string; error?: string }> {
  const tpl = TEMPLATE_BY_KEY[opts.templateKey];
  const name = `${tpl ? tpl.label : "Promotion"} — ${opts.productName}`;
  const res = await createCampaign({
    name,
    campaign_type: opts.templateKey,
    region: opts.region ?? "all",
    status: opts.launch ? "active" : "draft",
    config: { product_slugs: [opts.slug], source: "product_page", template: opts.templateKey },
  });
  if (res.error || !res.id) return { error: res.error ?? "Failed to create campaign" };
  if (opts.launch) {
    await supabase.from("marketing_campaigns").update({ launched_at: new Date().toISOString() } as never).eq("id", res.id);
    logActivity("marketing_promotion_start", "product", opts.slug, { campaignId: res.id, template: opts.templateKey });
  }
  logActivity("marketing_campaign_create_from_product", "product", opts.slug, { campaignId: res.id, template: opts.templateKey });
  return { id: res.id };
}

export async function launchProductPromotion(row: ProductCampaignRow): Promise<{ error?: string }> {
  const res = await launchCampaign(row.campaign.id);
  if (!res.error) logActivity("marketing_promotion_start", "marketing_campaign", row.campaign.id);
  return res;
}

export async function pauseProductPromotion(row: ProductCampaignRow): Promise<{ error?: string }> {
  const res = await pauseCampaign(row.campaign.id);
  if (!res.error) logActivity("marketing_promotion_stop", "marketing_campaign", row.campaign.id);
  return res;
}

/** Create a flash sale that includes this product. */
export async function createProductFlashSale(opts: {
  slug: string;
  productName: string;
  discountPercent: number;
  durationHours: number;
}): Promise<{ id?: string; error?: string }> {
  const endsAt = new Date(Date.now() + opts.durationHours * 3600_000).toISOString();
  const { data, error } = await supabase
    .from("flash_sales")
    .insert({
      name: `Flash Sale — ${opts.productName}`,
      product_slugs: [opts.slug],
      discount_percent: Math.max(1, Math.min(90, Math.round(opts.discountPercent))),
      ends_at: endsAt,
      active: true,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  logActivity("marketing_flash_sale_create", "product", opts.slug, { flashSaleId: data!.id, discount: opts.discountPercent });
  return { id: data!.id as string };
}

/** Feature / unfeature on the homepage via the products table. */
export async function setProductFeatured(slug: string, featured: boolean): Promise<{ error?: string }> {
  const { error } = await supabase.from("products").update({ featured } as never).eq("slug", slug);
  if (error) return { error: error.message };
  logActivity(featured ? "marketing_homepage_feature" : "marketing_homepage_unfeature", "product", slug, { featured });
  return {};
}

export const SCORE_LABELS: { key: keyof ProductScores; label: string }[] = [
  { key: "trending", label: "Trending" },
  { key: "marketing", label: "Marketing" },
  { key: "conversion", label: "Conversion" },
  { key: "profit", label: "Profit" },
  { key: "velocity", label: "Velocity" },
  { key: "customerInterest", label: "Customer Interest" },
];
