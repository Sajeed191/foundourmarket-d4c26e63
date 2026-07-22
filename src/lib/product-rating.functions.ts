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

// ---------------------------------------------------------------------------
// Admin recovery workflow — restore missing `initial_rating` values.
// A regression left some products with `initial_rating IS NULL` (or 0), so the
// PDP falls back to 0.0 whenever there are no published customer reviews. This
// pair of functions powers the admin recovery page that fixes only those
// products, without touching customer averages or review data.
// ---------------------------------------------------------------------------

export type MissingRatingRow = {
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  image: string | null;
  initialRating: number;
  publishedReviewCount: number;
  hasCustomerReviews: boolean;
};

/** List products whose admin initial rating is missing (NULL or <= 0). */
export const listMissingInitialRatings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertRole(supabase, userId, RATING_STAFF_ROLES);

    const { data: products, error } = await supabase
      .from("products")
      .select("slug, name, brand, category, image, initial_rating")
      .or("initial_rating.is.null,initial_rating.lte.0")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message || "Failed to load products.");

    const slugs = (products || []).map((p: any) => p.slug);
    const counts: Record<string, number> = {};
    if (slugs.length) {
      const { data: reviews } = await supabase
        .from("product_reviews")
        .select("product_slug, status, deleted_at, is_seeded")
        .in("product_slug", slugs)
        .eq("status", "published")
        .is("deleted_at", null);
      for (const r of reviews || []) {
        if (r.is_seeded) continue;
        counts[r.product_slug] = (counts[r.product_slug] || 0) + 1;
      }
    }

    const rows: MissingRatingRow[] = (products || []).map((p: any) => ({
      slug: p.slug,
      name: p.name,
      brand: p.brand ?? null,
      category: p.category ?? null,
      image: p.image ?? null,
      initialRating: Number(p.initial_rating || 0),
      publishedReviewCount: counts[p.slug] || 0,
      hasCustomerReviews: (counts[p.slug] || 0) > 0,
    }));

    return { rows, total: rows.length };
  });

const bulkSchema = z.object({
  updates: z
    .array(
      z.object({
        slug: z.string().min(1).max(200),
        // 0.0–5.0 to one decimal place. Multiply and round-trip to enforce.
        initialRating: z
          .number()
          .min(0)
          .max(5)
          .refine((n) => Math.abs(n * 10 - Math.round(n * 10)) < 1e-9, {
            message: "Rating must have at most one decimal.",
          }),
      }),
    )
    .min(1)
    .max(500),
});

export type BulkRecoveryResult = {
  updated: string[];
  skipped: { slug: string; reason: string }[];
  displayRefreshed: string[];
};

/**
 * Bulk-set `initial_rating` for products that are missing one. The rating
 * source is stamped as `imported_supplier` so future audits can trace the
 * recovery batch. After each update we call `recalculate_product_rating`,
 * which is the authoritative rule: it keeps the customer average when the
 * product has published reviews, and applies the new fallback when it does
 * not — so displayed ratings for products with reviews are never overwritten.
 */
export const bulkSetInitialRatings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => bulkSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertRole(supabase, userId, RATING_ADMIN_ROLES);

    const result: BulkRecoveryResult = { updated: [], skipped: [], displayRefreshed: [] };
    const nowIso = new Date().toISOString();

    for (const u of data.updates) {
      // Round to one decimal for safety even though the schema already enforces it.
      const rounded = Math.round(u.initialRating * 10) / 10;

      const { data: before, error: readErr } = await supabase
        .from("products")
        .select("slug, initial_rating")
        .eq("slug", u.slug)
        .maybeSingle();
      if (readErr || !before) {
        result.skipped.push({ slug: u.slug, reason: "Product not found." });
        continue;
      }

      const { error: updErr } = await supabase
        .from("products")
        .update({
          initial_rating: rounded,
          rating_source: "imported_supplier",
          updated_at: nowIso,
        })
        .eq("slug", u.slug);
      if (updErr) {
        result.skipped.push({ slug: u.slug, reason: updErr.message || "Update failed." });
        continue;
      }

      const { error: rpcErr } = await supabase.rpc("recalculate_product_rating", { _slug: u.slug });
      if (rpcErr) {
        result.skipped.push({ slug: u.slug, reason: rpcErr.message || "Recalculation failed." });
        continue;
      }

      const state = await buildState(supabase, u.slug);
      result.updated.push(u.slug);
      // Anything with 0 published reviews now displays the new fallback.
      if (state.customerReviewCount === 0) result.displayRefreshed.push(u.slug);

      await supabase.from("product_rating_audit").insert({
        product_slug: u.slug,
        admin_id: userId,
        action: "recover_initial_rating",
        initial_rating: rounded,
        initial_review_count: 0,
        rating_source: "imported_supplier",
        final_rating: state.finalRating,
        total_reviews: state.totalReviews,
        metadata: { previous_initial_rating: Number(before.initial_rating || 0) },
      });
    }

    return {
      ok: true,
      updated: result.updated.length,
      skipped: result.skipped.length,
      displayRefreshed: result.displayRefreshed.length,
      detail: result,
    };
  });

