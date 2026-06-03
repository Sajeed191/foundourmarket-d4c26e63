import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RATING_ADMIN_ROLES = ["admin", "super_admin"];
const RATING_STAFF_ROLES = ["admin", "super_admin", "manager"];

async function assertRole(supabase: any, userId: string, roles: string[]) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", roles);
  if (!data || data.length === 0) {
    throw new Error("Forbidden: admin access required.");
  }
}

export const RATING_SOURCES = [
  "customer_reviews",
  "imported_supplier",
  "marketplace_imported",
] as const;

export type RatingSource = (typeof RATING_SOURCES)[number];

export type ProductRatingState = {
  slug: string;
  initialRating: number;
  initialReviewCount: number;
  ratingSource: RatingSource;
  customerRating: number;
  customerReviewCount: number;
  finalRating: number;
  totalReviews: number;
};

export type RatingAuditEntry = {
  id: string;
  action: string;
  admin_id: string | null;
  initial_rating: number | null;
  initial_review_count: number | null;
  rating_source: string | null;
  final_rating: number | null;
  total_reviews: number | null;
  created_at: string;
};

async function buildState(supabase: any, slug: string): Promise<ProductRatingState> {
  const { data: product, error } = await supabase
    .from("products")
    .select("slug, rating, reviews, initial_rating, initial_review_count, rating_source")
    .eq("slug", slug)
    .single();
  if (error || !product) throw new Error(error?.message || "Product not found.");

  const { data: customerReviews } = await supabase
    .from("product_reviews")
    .select("rating, status, is_seeded")
    .eq("product_slug", slug)
    .eq("status", "published");

  const authentic = (customerReviews || []).filter((r: any) => !r.is_seeded);
  const customerReviewCount = authentic.length;
  const customerRating =
    customerReviewCount === 0
      ? 0
      : authentic.reduce((s: number, r: any) => s + Number(r.rating || 0), 0) / customerReviewCount;

  return {
    slug: product.slug,
    initialRating: Number(product.initial_rating || 0),
    initialReviewCount: Number(product.initial_review_count || 0),
    ratingSource: (product.rating_source || "customer_reviews") as RatingSource,
    customerRating: Math.round(customerRating * 100) / 100,
    customerReviewCount,
    finalRating: Number(product.rating || 0),
    totalReviews: Number(product.reviews || 0),
  };
}

const slugSchema = z.object({ slug: z.string().min(1).max(200) });

/** Read the rating breakdown + audit history for a product. Staff-gated. */
export const getProductRating = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => slugSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertRole(supabase, userId, RATING_STAFF_ROLES);

    const state = await buildState(supabase, data.slug);

    const { data: audit } = await supabase
      .from("product_rating_audit")
      .select(
        "id, action, admin_id, initial_rating, initial_review_count, rating_source, final_rating, total_reviews, created_at",
      )
      .eq("product_slug", data.slug)
      .order("created_at", { ascending: false })
      .limit(50);

    return { state, audit: (audit || []) as RatingAuditEntry[] };
  });

const setSchema = z.object({
  slug: z.string().min(1).max(200),
  initialRating: z.number().min(1).max(5),
  initialReviewCount: z.number().int().min(0).max(100_000_000),
  ratingSource: z.enum(RATING_SOURCES),
});

/**
 * Set the imported/initial rating, count and source for a product, then
 * recompute the blended final rating. Admin-only. Customer-generated ratings
 * are never modified directly — only the imported baseline.
 */
export const setProductRating = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => setSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertRole(supabase, userId, RATING_ADMIN_ROLES);

    const { error: updErr } = await supabase
      .from("products")
      .update({
        initial_rating: data.initialRating,
        initial_review_count: data.initialReviewCount,
        rating_source: data.ratingSource,
        updated_at: new Date().toISOString(),
      })
      .eq("slug", data.slug);
    if (updErr) throw new Error(updErr.message || "Update failed.");

    const { error: rpcErr } = await supabase.rpc("recalculate_product_rating", {
      _slug: data.slug,
    });
    if (rpcErr) throw new Error(rpcErr.message || "Recalculation failed.");

    const state = await buildState(supabase, data.slug);

    await supabase.from("product_rating_audit").insert({
      product_slug: data.slug,
      admin_id: userId,
      action: "set_initial_rating",
      initial_rating: data.initialRating,
      initial_review_count: data.initialReviewCount,
      rating_source: data.ratingSource,
      final_rating: state.finalRating,
      total_reviews: state.totalReviews,
      metadata: {},
    });

    return { ok: true, state };
  });

/** Force a recalculation of the blended rating. Admin-only. */
export const recalculateProductRating = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => slugSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertRole(supabase, userId, RATING_ADMIN_ROLES);

    const { error: rpcErr } = await supabase.rpc("recalculate_product_rating", {
      _slug: data.slug,
    });
    if (rpcErr) throw new Error(rpcErr.message || "Recalculation failed.");

    const state = await buildState(supabase, data.slug);

    await supabase.from("product_rating_audit").insert({
      product_slug: data.slug,
      admin_id: userId,
      action: "recalculate",
      initial_rating: state.initialRating,
      initial_review_count: state.initialReviewCount,
      rating_source: state.ratingSource,
      final_rating: state.finalRating,
      total_reviews: state.totalReviews,
      metadata: {},
    });

    return { ok: true, state };
  });

const moderateSchema = z.object({
  reviewId: z.string().uuid(),
  slug: z.string().min(1).max(200),
  action: z.enum(["approve", "hide", "reject"]),
});

const STATUS_BY_ACTION: Record<string, string> = {
  approve: "published",
  hide: "hidden",
  reject: "rejected",
};

/**
 * Moderate a single customer review (approve / hide fake / reject spam).
 * Changing the status fires the DB trigger that re-blends the final rating.
 * Admin-only; the admin never edits the customer's star rating itself.
 */
export const moderateReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => moderateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertRole(supabase, userId, RATING_ADMIN_ROLES);

    const newStatus = STATUS_BY_ACTION[data.action];
    const { error } = await supabase
      .from("product_reviews")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", data.reviewId)
      .eq("product_slug", data.slug);
    if (error) throw new Error(error.message || "Moderation failed.");

    const state = await buildState(supabase, data.slug);

    await supabase.from("product_rating_audit").insert({
      product_slug: data.slug,
      admin_id: userId,
      action: `review_${data.action}`,
      final_rating: state.finalRating,
      total_reviews: state.totalReviews,
      metadata: { review_id: data.reviewId, status: newStatus },
    });

    return { ok: true, state };
  });
