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

const updateSchema = z.object({
  slug: z.string().min(1).max(200),
  // Pricing
  priceInr: money.optional(),
  comparePriceInr: money.optional(),
  priceUsd: money.optional(),
  comparePriceUsd: money.optional(),
  // Visibility / region availability
  indiaVisible: z.boolean().optional(),
  internationalVisible: z.boolean().optional(),
  featured: z.boolean().optional(),
  inStock: z.boolean().optional(),
  // Content
  name: z.string().min(1).max(300).optional(),
  tagline: z.string().max(500).optional(),
  description: z.string().max(20_000).optional(),
  category: z.string().min(1).max(120).optional(),
  image: z.string().min(1).max(2000).optional(),
  sku: z.string().max(120).nullable().optional(),
  // Inventory
  stockQuantity: z.number().int().min(0).max(10_000_000).optional(),
  lowStockThreshold: z.number().int().min(0).max(1_000_000).optional(),
  // Specifications
  rating: z.number().min(0).max(5).optional(),
  reviews: z.number().int().min(0).max(100_000_000).optional(),
  warranty: z.string().min(1).max(120).optional(),
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
    };
    for (const [key, col] of Object.entries(map)) {
      if (key in data && (data as any)[key] !== undefined) {
        patch[col] = (data as any)[key];
      }
    }
    if (Object.keys(patch).length === 0) {
      throw new Error("Nothing to update.");
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

