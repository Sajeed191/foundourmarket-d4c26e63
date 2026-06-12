import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PRODUCT_ADMIN_ROLES = ["admin", "super_admin"];

async function assertStaff(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", PRODUCT_ADMIN_ROLES);
  if (!data || data.length === 0) {
    throw new Error("Forbidden: admin access required.");
  }
}

const money = z.number().min(0).max(100_000_000).nullable();

const PRODUCT_STATUSES = [
  "draft",
  "published",
  "hidden",
  "archived",
  "scheduled",
  "preorder",
  "out_of_stock",
] as const;

const updateSchema = z.object({
  slug: z.string().min(1).max(200),
  // Pricing
  priceInr: money.optional(),
  comparePriceInr: money.optional(),
  priceUsd: money.optional(),
  comparePriceUsd: money.optional(),
  costPriceInr: money.optional(),
  costPriceUsd: money.optional(),
  shippingFeeInr: z.number().min(0).max(100_000_000).optional(),
  shippingFeeUsd: z.number().min(0).max(100_000_000).optional(),
  // Visibility / region availability
  indiaVisible: z.boolean().optional(),
  internationalVisible: z.boolean().optional(),
  featured: z.boolean().optional(),
  inStock: z.boolean().optional(),
  // Status / publishing
  status: z.enum(PRODUCT_STATUSES).optional(),
  preorder: z.boolean().optional(),
  scheduledPublishAt: z.string().datetime().nullable().optional(),
  scheduledExpiryAt: z.string().datetime().nullable().optional(),
  // Payments
  razorpayEnabled: z.boolean().optional(),
  stripeEnabled: z.boolean().optional(),
  paypalEnabled: z.boolean().optional(),
  // Shipping & returns
  codEnabled: z.boolean().optional(),
  returnEligible: z.boolean().optional(),
  replacementEligible: z.boolean().optional(),
  returnWindowDays: z.number().int().min(0).max(365).optional(),
  pickupSupported: z.boolean().optional(),
  internationalShipping: z.boolean().optional(),
  fragile: z.boolean().optional(),
  customsInfo: z.string().max(5000).optional(),
  // Content
  name: z.string().min(1).max(300).optional(),
  tagline: z.string().max(500).optional(),
  description: z.string().max(20_000).optional(),
  category: z.string().min(1).max(120).optional(),
  image: z.string().min(1).max(2000).optional(),
  sku: z.string().max(120).nullable().optional(),
  barcode: z.string().max(120).optional(),
  warehouseLocation: z.string().max(200).optional(),
  restockEta: z.string().max(200).optional(),
  // Inventory
  stockQuantity: z.number().int().min(0).max(10_000_000).optional(),
  lowStockThreshold: z.number().int().min(0).max(1_000_000).optional(),
  // Specifications
  rating: z.number().min(0).max(5).optional(),
  reviews: z.number().int().min(0).max(100_000_000).optional(),
  warranty: z.string().min(1).max(120).optional(),
  // Merchandising flags
  trending: z.boolean().optional(),
  bestseller: z.boolean().optional(),
  newArrival: z.boolean().optional(),
  hotDeal: z.boolean().optional(),
  flashDeal: z.boolean().optional(),
  staffPick: z.boolean().optional(),
  recommended: z.boolean().optional(),
  homepageHero: z.boolean().optional(),
  giftIdea: z.boolean().optional(),
  // Store placement
  homepageSection: z.string().max(60).nullable().optional(),
  isCategoryBanner: z.boolean().optional(),
  hideFromSearch: z.boolean().optional(),
  hideFromRecommendations: z.boolean().optional(),
  homepagePosition: z.number().int().min(0).max(100_000).nullable().optional(),
  categoryPosition: z.number().int().min(0).max(100_000).nullable().optional(),
  featuredUntil: z.string().datetime().nullable().optional(),
  // Related merchandising
  relatedProducts: z.array(z.string().min(1).max(200)).max(50).optional(),
  crossSellProducts: z.array(z.string().min(1).max(200)).max(50).optional(),
  upsellProducts: z.array(z.string().min(1).max(200)).max(50).optional(),
  // SEO
  seoTitle: z.string().max(300).nullable().optional(),
  seoDescription: z.string().max(1000).nullable().optional(),
  metaKeywords: z.array(z.string().min(1).max(120)).max(50).optional(),
  // Manual merchandising labels + sorting + collections
  premium: z.boolean().optional(),
  fastSelling: z.boolean().optional(),
  editorsChoice: z.boolean().optional(),
  priorityScore: z.number().int().min(0).max(100).nullable().optional(),
  collections: z.array(z.string().min(1).max(120)).max(50).optional(),
});

/**
 * Securely patch a product from the inline admin editor. All writes are
 * gated server-side: requireSupabaseAuth provides the user-scoped client,
 * we re-check staff role, and the products RLS policy enforces admin again.
 */
export const adminUpdateProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertStaff(supabase, userId);

    const patch: Record<string, unknown> = {};
    const map: Record<string, string> = {
      priceInr: "price_inr",
      comparePriceInr: "compare_price_inr",
      priceUsd: "price_usd",
      comparePriceUsd: "compare_price_usd",
      indiaVisible: "india_visible",
      internationalVisible: "international_visible",
      featured: "featured",
      inStock: "in_stock",
      name: "name",
      tagline: "tagline",
      description: "description",
      category: "category",
      image: "image",
      sku: "sku",
      stockQuantity: "stock_quantity",
      lowStockThreshold: "low_stock_threshold",
      rating: "rating",
      reviews: "reviews",
      warranty: "warranty",
      costPriceInr: "cost_price_inr",
      costPriceUsd: "cost_price_usd",
      shippingFeeInr: "shipping_fee_inr",
      shippingFeeUsd: "shipping_fee_usd",
      status: "status",
      preorder: "preorder",
      scheduledPublishAt: "scheduled_publish_at",
      scheduledExpiryAt: "scheduled_expiry_at",
      razorpayEnabled: "razorpay_enabled",
      stripeEnabled: "stripe_enabled",
      paypalEnabled: "paypal_enabled",
      codEnabled: "cod_enabled",
      returnEligible: "return_eligible",
      replacementEligible: "replacement_eligible",
      returnWindowDays: "return_window_days",
      pickupSupported: "pickup_supported",
      internationalShipping: "international_shipping",
      fragile: "fragile",
      customsInfo: "customs_info",
      barcode: "barcode",
      warehouseLocation: "warehouse_location",
      restockEta: "restock_eta",
      trending: "trending",
      bestseller: "bestseller",
      newArrival: "new_arrival",
      hotDeal: "hot_deal",
      flashDeal: "flash_deal",
      staffPick: "staff_pick",
      recommended: "recommended",
      homepageHero: "homepage_hero",
      giftIdea: "gift_idea",
      homepageSection: "homepage_section",
      isCategoryBanner: "is_category_banner",
      hideFromSearch: "hide_from_search",
      hideFromRecommendations: "hide_from_recommendations",
      homepagePosition: "homepage_position",
      categoryPosition: "category_position",
      featuredUntil: "featured_until",
      relatedProducts: "related_products",
      crossSellProducts: "cross_sell_products",
      upsellProducts: "upsell_products",
      seoTitle: "seo_title",
      seoDescription: "seo_description",
      metaKeywords: "meta_keywords",
      premium: "premium",
      fastSelling: "fast_selling",
      editorsChoice: "editors_choice",
      priorityScore: "priority_score",
      collections: "collections",
    };
    for (const [key, col] of Object.entries(map)) {
      if (key in data && (data as any)[key] !== undefined) {
        patch[col] = (data as any)[key];
      }
    }
    if (Object.keys(patch).length === 0) {
      throw new Error("Nothing to update.");
    }
    // Enforce SKU uniqueness across the catalog.
    if (typeof patch.sku === "string" && patch.sku.trim()) {
      const { data: dupe } = await supabase
        .from("products")
        .select("slug")
        .ilike("sku", patch.sku.trim())
        .neq("slug", data.slug)
        .limit(1);
      if (dupe && dupe.length) throw new Error(`SKU "${patch.sku}" is already used by another product.`);
    }
    patch.updated_at = new Date().toISOString();


    const { error } = await supabase
      .from("products")
      .update(patch)
      .eq("slug", data.slug);
    if (error) throw new Error(error.message || "Update failed.");

    // Audit trail
    await supabase.from("admin_activity_logs").insert({
      actor_id: userId,
      action: "product.inline_update",
      entity_type: "product",
      entity_id: data.slug,
      metadata: { fields: Object.keys(patch) },
    });

    return { ok: true };
  });

const slugSchema = z.object({ slug: z.string().min(1).max(200) });

/** Delete a product. Staff-gated server-side; RLS enforces admin again. */
export const adminDeleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => slugSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertStaff(supabase, userId);

    const { error } = await supabase.from("products").delete().eq("slug", data.slug);
    if (error) throw new Error(error.message || "Delete failed.");

    await supabase.from("admin_activity_logs").insert({
      actor_id: userId,
      action: "product.delete",
      entity_type: "product",
      entity_id: data.slug,
      metadata: {},
    });

    return { ok: true };
  });

/** Duplicate a product into a fresh draft row with a unique slug. */
export const adminDuplicateProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => slugSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertStaff(supabase, userId);

    const { data: src, error: readErr } = await supabase
      .from("products")
      .select("*")
      .eq("slug", data.slug)
      .single();
    if (readErr || !src) throw new Error(readErr?.message || "Product not found.");

    const copy = { ...src } as Record<string, unknown>;
    delete copy.id;
    delete copy.created_at;
    delete copy.updated_at;
    delete copy.search_vector;
    delete copy.views_count;

    const suffix = Math.random().toString(36).slice(2, 6);
    copy.slug = `${data.slug}-copy-${suffix}`.slice(0, 200);
    copy.name = `${src.name} (Copy)`;
    copy.sku = src.sku ? `${src.sku}-${suffix}` : null;
    copy.featured = false;
    copy.in_stock = false; // duplicates start hidden/draft

    const { data: inserted, error: insErr } = await supabase
      .from("products")
      .insert(copy)
      .select("slug")
      .single();
    if (insErr) throw new Error(insErr.message || "Duplicate failed.");

    await supabase.from("admin_activity_logs").insert({
      actor_id: userId,
      action: "product.duplicate",
      entity_type: "product",
      entity_id: inserted.slug,
      metadata: { source: data.slug },
    });

    return { ok: true, slug: inserted.slug as string };
  });

