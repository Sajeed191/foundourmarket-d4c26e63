/**
 * Image Intelligence Engine v3 — server functions (Turn 2).
 * Thin RPC surface; all analysis / normalization logic lives in
 * `*.server.ts` modules that are dynamically imported inside handlers.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { IntelligenceMode } from "@/lib/image-intelligence-types";

const STAFF_ROLES = ["admin", "super_admin", "manager"];
const WRITER_ROLES = ["admin", "super_admin"];
const OPTIMIZED_BUCKET = "product-images";
const OPTIMIZED_PREFIX = "optimized";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function assertRole(supabase: { from: (t: string) => any }, userId: string, roles: string[]) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).in("role", roles);
  if (!data || data.length === 0) throw new Error("Forbidden: staff access required.");
}

// ─────────────────────────────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────────────────────────────

export const getIntelligenceSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertRole(supabase, userId, STAFF_ROLES);
    const { data, error } = await supabase
      .from("image_intelligence_settings").select("*").eq("id", "global").maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? {
      id: "global", scope_kind: "global", mode: "analyze_recommend",
      target_occupancy_min: 0.70, target_occupancy_max: 0.85,
      min_resolution: 800, allow_background_expansion: true,
      block_publish_on_low_quality: false, auto_apply_safe: false,
    };
  });

const updateSchema = z.object({
  mode: z.enum(["off", "analyze_only", "analyze_recommend", "analyze_normalize"]).optional(),
  target_occupancy_min: z.number().min(0.3).max(0.95).optional(),
  target_occupancy_max: z.number().min(0.5).max(0.98).optional(),
  min_resolution: z.number().int().min(400).max(4000).optional(),
  allow_background_expansion: z.boolean().optional(),
  block_publish_on_low_quality: z.boolean().optional(),
  auto_apply_safe: z.boolean().optional(),
});

export const updateIntelligenceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertRole(supabase, userId, WRITER_ROLES);
    const patch = { ...data, updated_by: userId, updated_at: new Date().toISOString() };
    const { error } = await supabase
      .from("image_intelligence_settings")
      .upsert({ id: "global", scope_kind: "global", ...patch });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────
// Analyze (analyze-only path used by Test panel)
// ─────────────────────────────────────────────────────────────────────────

const analyzeSchema = z.object({
  imageUrl: z.string().url().max(2048),
  productSlug: z.string().max(200).optional(),
  categorySlug: z.string().max(200).optional(),
  imageId: z.string().uuid().optional(),
  persist: z.boolean().optional().default(true),
  depth: z.enum(["header-only", "full"]).optional().default("full"),
});

export const analyzeProductImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => analyzeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertRole(supabase, userId, STAFF_ROLES);

    const { data: settings } = await supabase
      .from("image_intelligence_settings").select("mode").eq("id", "global").maybeSingle();
    const mode = (settings?.mode ?? "analyze_recommend") as IntelligenceMode;
    if (mode === "off") {
      return { status: "skipped" as const, reason: "Engine disabled.", intelligence: null, recommendation: null };
    }

    const { analyzeImageServer } = await import("@/lib/image-intelligence.server");
    const result = await analyzeImageServer({
      imageUrl: data.imageUrl,
      categorySlug: data.categorySlug ?? null,
      depth: data.depth,
    });

    await supabase.from("image_intelligence_jobs").insert({
      image_url: data.imageUrl,
      product_slug: data.productSlug ?? null,
      category_slug: data.categorySlug ?? null,
      image_id: data.imageId ?? null,
      job_type: "analyze",
      mode,
      status: result.status,
      analysis: result.intelligence ?? {},
      recommendation: result.recommendation ?? null,
      health_score: result.intelligence?.qualityScore ?? null,
      duration_ms: result.durationMs,
      error_message: result.errorMessage ?? null,
      requested_by: userId,
    });

    if (data.persist && data.imageId && result.intelligence) {
      await supabase.from("product_images")
        .update({ analysis_json: result.intelligence, analyzed_at: new Date().toISOString() })
        .eq("id", data.imageId);
    } else if (data.persist && data.productSlug && result.intelligence) {
      await supabase.from("product_images")
        .update({ analysis_json: result.intelligence, analyzed_at: new Date().toISOString() })
        .eq("product_slug", data.productSlug).eq("url", data.imageUrl);
    }

    return {
      status: result.status,
      intelligence: result.intelligence,
      recommendation: result.recommendation,
      durationMs: result.durationMs,
    };
  });

// ─────────────────────────────────────────────────────────────────────────
// Normalize (deterministic + quality gate + storage upload)
// ─────────────────────────────────────────────────────────────────────────

const normalizeSchema = z.object({
  imageUrl: z.string().url().max(2048),
  productSlug: z.string().max(200).optional(),
  categorySlug: z.string().max(200).optional(),
  imageId: z.string().uuid().optional(),
});

export const normalizeProductImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => normalizeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertRole(supabase, userId, STAFF_ROLES);

    const { data: settings } = await supabase
      .from("image_intelligence_settings").select("mode, auto_apply_safe").eq("id", "global").maybeSingle();
    const mode = (settings?.mode ?? "analyze_recommend") as IntelligenceMode;
    if (mode !== "analyze_normalize") {
      return { status: "skipped" as const, reason: "Mode is not 'analyze + normalize'." };
    }

    const started = Date.now();
    const { analyzeImageServer } = await import("@/lib/image-intelligence.server");
    const { normalizeImage } = await import("@/lib/image-normalization.server");
    const { runQualityGate } = await import("@/lib/image-quality-gate.server");
    const { resolveCategoryFraming } = await import("@/lib/image-intelligence-types");

    const analysis = await analyzeImageServer({
      imageUrl: data.imageUrl,
      categorySlug: data.categorySlug ?? null,
      depth: "full",
    });

    if (analysis.status !== "analyzed" || !analysis.pixels || !analysis.bytes || !analysis.intelligence) {
      await supabase.from("image_intelligence_jobs").insert({
        image_url: data.imageUrl, product_slug: data.productSlug ?? null,
        category_slug: data.categorySlug ?? null, image_id: data.imageId ?? null,
        job_type: "normalize", mode, status: "failed",
        analysis: analysis.intelligence ?? {},
        error_message: analysis.errorMessage ?? "Analysis prerequisite failed.",
        duration_ms: Date.now() - started, requested_by: userId,
      });
      return { status: "failed" as const, reason: analysis.errorMessage ?? "Analysis failed." };
    }

    const framing = resolveCategoryFraming(data.categorySlug ?? null);
    const norm = await normalizeImage(analysis.bytes, analysis.pixels, framing);

    if (norm.status !== "produced" || !norm.bytes) {
      await supabase.from("image_intelligence_jobs").insert({
        image_url: data.imageUrl, product_slug: data.productSlug ?? null,
        category_slug: data.categorySlug ?? null, image_id: data.imageId ?? null,
        job_type: "normalize", mode, status: "failed",
        analysis: analysis.intelligence, actions_json: norm.actions,
        error_message: `Normalization skipped: ${norm.skipReason ?? "unknown"}`,
        duration_ms: Date.now() - started, requested_by: userId,
      });
      return { status: "failed" as const, reason: norm.skipReason ?? "Normalization failed." };
    }

    // Quality gate — MANDATORY
    const gate = await runQualityGate({
      originalPixels: analysis.pixels,
      optimizedBytes: norm.bytes,
      framing,
    });

    if (!gate.passed) {
      await supabase.from("image_intelligence_jobs").insert({
        image_url: data.imageUrl, product_slug: data.productSlug ?? null,
        category_slug: data.categorySlug ?? null, image_id: data.imageId ?? null,
        job_type: "normalize", mode, status: "rejected",
        analysis: analysis.intelligence, actions_json: norm.actions,
        rejection_reason: gate.reason ?? "Quality gate failed.",
        recommendation: {
          band: "amber", headline: "Optimized version rejected — keeping original.",
          action: "none", reasons: gate.checks.filter((c) => !c.passed).map((c) => c.detail),
          reversible: true, aiTouchesProduct: false,
        },
        duration_ms: Date.now() - started, requested_by: userId,
      });
      return { status: "rejected" as const, reason: gate.reason ?? "Quality gate failed.", checks: gate.checks };
    }

    // Upload to storage (service role bypasses RLS for storage.objects insert)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const key = `${OPTIMIZED_PREFIX}/${crypto.randomUUID()}.webp`;
    const { error: uploadErr } = await supabaseAdmin.storage
      .from(OPTIMIZED_BUCKET)
      .upload(key, norm.bytes, { contentType: "image/webp", upsert: false });
    if (uploadErr) {
      await supabase.from("image_intelligence_jobs").insert({
        image_url: data.imageUrl, product_slug: data.productSlug ?? null,
        category_slug: data.categorySlug ?? null, image_id: data.imageId ?? null,
        job_type: "normalize", mode, status: "failed",
        analysis: analysis.intelligence, actions_json: norm.actions,
        error_message: `Upload failed: ${uploadErr.message}`,
        duration_ms: Date.now() - started, requested_by: userId,
      });
      return { status: "failed" as const, reason: uploadErr.message };
    }
    const { data: pub } = supabaseAdmin.storage.from(OPTIMIZED_BUCKET).getPublicUrl(key);
    const optimizedUrl = pub.publicUrl;

    await supabase.from("image_intelligence_jobs").insert({
      image_url: data.imageUrl, product_slug: data.productSlug ?? null,
      category_slug: data.categorySlug ?? null, image_id: data.imageId ?? null,
      job_type: "normalize", mode, status: "succeeded",
      analysis: analysis.intelligence, actions_json: norm.actions,
      optimized_url: optimizedUrl,
      health_score: analysis.intelligence.qualityScore,
      duration_ms: Date.now() - started, requested_by: userId,
    });

    // Auto-apply if setting is on
    let applied = false;
    if (settings?.auto_apply_safe && data.imageId) {
      const { error: applyErr } = await supabase.from("product_images")
        .update({
          optimized_url: optimizedUrl,
          optimization_actions: norm.actions,
          optimization_applied_at: new Date().toISOString(),
        })
        .eq("id", data.imageId);
      if (!applyErr) applied = true;
    }

    return {
      status: "succeeded" as const,
      optimizedUrl,
      actions: norm.actions,
      checks: gate.checks,
      applied,
      durationMs: Date.now() - started,
    };
  });

// ─────────────────────────────────────────────────────────────────────────
// Apply / revert (admin control)
// ─────────────────────────────────────────────────────────────────────────

const applySchema = z.object({
  imageId: z.string().uuid(),
  optimizedUrl: z.string().url(),
  actions: z.array(z.any()).optional(),
});

export const applyOptimizedImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => applySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertRole(supabase, userId, WRITER_ROLES);
    const { error } = await supabase.from("product_images")
      .update({
        optimized_url: data.optimizedUrl,
        optimization_actions: data.actions ?? [],
        optimization_applied_at: new Date().toISOString(),
      })
      .eq("id", data.imageId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const revertToOriginal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ imageId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertRole(supabase, userId, WRITER_ROLES);
    const { error } = await supabase.from("product_images")
      .update({ optimized_url: null, optimization_actions: null, optimization_applied_at: null })
      .eq("id", data.imageId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────
// Recent jobs
// ─────────────────────────────────────────────────────────────────────────

const listSchema = z.object({ limit: z.number().int().min(1).max(200).default(50) });

export const listRecentIntelligenceJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertRole(supabase, userId, STAFF_ROLES);
    const { data: rows, error } = await supabase
      .from("image_intelligence_jobs")
      .select("id, image_url, product_slug, category_slug, job_type, mode, status, health_score, duration_ms, recommendation, actions_json, rejection_reason, optimized_url, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ─────────────────────────────────────────────────────────────────────────
// Batch: enqueue + process pending product images (called from cron)
// ─────────────────────────────────────────────────────────────────────────

const batchSchema = z.object({ limit: z.number().int().min(1).max(10).default(3) });

export const runPendingImageJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => batchSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertRole(supabase, userId, STAFF_ROLES);

    const { data: settings } = await supabase
      .from("image_intelligence_settings").select("mode, auto_apply_safe").eq("id", "global").maybeSingle();
    const mode = (settings?.mode ?? "analyze_recommend") as IntelligenceMode;
    if (mode === "off") return { processed: 0, skipped: "engine off" };

    // Pick images with no analysis yet
    const { data: rows } = await supabase
      .from("product_images")
      .select("id, product_slug, url, original_url, analyzed_at, optimized_url")
      .is("analyzed_at", null)
      .limit(data.limit);

    let processed = 0;
    for (const row of rows ?? []) {
      const url = row.original_url ?? row.url;
      try {
        // Fire-and-collect analyze
        const { analyzeImageServer } = await import("@/lib/image-intelligence.server");
        const res = await analyzeImageServer({ imageUrl: url, depth: "full" });
        if (res.status === "analyzed" && res.intelligence) {
          await supabase.from("product_images")
            .update({ analysis_json: res.intelligence, analyzed_at: new Date().toISOString() })
            .eq("id", row.id);
          await supabase.from("image_intelligence_jobs").insert({
            image_url: url, product_slug: row.product_slug, image_id: row.id,
            job_type: "analyze", mode, status: "analyzed",
            analysis: res.intelligence, recommendation: res.recommendation,
            health_score: res.intelligence.qualityScore, duration_ms: res.durationMs,
            requested_by: userId,
          });
          processed++;
        }
      } catch { /* keep going */ }
    }
    return { processed };
  });
