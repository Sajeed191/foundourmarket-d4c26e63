/**
 * Image Intelligence Engine v3 — server functions.
 * Thin RPC surface; all analysis logic lives in `image-intelligence.server.ts`.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { IntelligenceMode } from "@/lib/image-intelligence-types";

const STAFF_ROLES = ["admin", "super_admin", "manager"];
const WRITER_ROLES = ["admin", "super_admin"];

async function assertRole(
  supabase: { from: (t: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  userId: string,
  roles: string[],
) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).in("role", roles);
  if (!data || data.length === 0) throw new Error("Forbidden: staff access required.");
}

// ─────────────────────────────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────────────────────────────

export const getIntelligenceSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string }; // eslint-disable-line @typescript-eslint/no-explicit-any
    await assertRole(supabase, userId, STAFF_ROLES);
    const { data, error } = await supabase
      .from("image_intelligence_settings")
      .select("*")
      .eq("id", "global")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? {
      id: "global", scope_kind: "global", mode: "analyze_recommend",
      target_occupancy_min: 0.70, target_occupancy_max: 0.85,
      min_resolution: 800, allow_background_expansion: true,
      block_publish_on_low_quality: false,
    };
  });

const updateSchema = z.object({
  mode: z.enum(["off", "analyze_only", "analyze_recommend", "analyze_normalize"]),
  target_occupancy_min: z.number().min(0.3).max(0.95).optional(),
  target_occupancy_max: z.number().min(0.5).max(0.98).optional(),
  min_resolution: z.number().int().min(400).max(4000).optional(),
  allow_background_expansion: z.boolean().optional(),
  block_publish_on_low_quality: z.boolean().optional(),
});

export const updateIntelligenceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string }; // eslint-disable-line @typescript-eslint/no-explicit-any
    await assertRole(supabase, userId, WRITER_ROLES);
    const patch = { ...data, updated_by: userId, updated_at: new Date().toISOString() };
    const { error } = await supabase
      .from("image_intelligence_settings")
      .upsert({ id: "global", scope_kind: "global", ...patch });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────
// Analyze
// ─────────────────────────────────────────────────────────────────────────

const analyzeSchema = z.object({
  imageUrl: z.string().url().max(2048),
  productSlug: z.string().max(200).optional(),
  categorySlug: z.string().max(200).optional(),
  persist: z.boolean().optional().default(true),
});

export const analyzeProductImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => analyzeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string }; // eslint-disable-line @typescript-eslint/no-explicit-any
    await assertRole(supabase, userId, STAFF_ROLES);

    // Respect global "off" — never analyze when disabled
    const { data: settings } = await supabase
      .from("image_intelligence_settings").select("mode").eq("id", "global").maybeSingle();
    const mode = (settings?.mode ?? "analyze_recommend") as IntelligenceMode;
    if (mode === "off") {
      return {
        status: "skipped" as const,
        reason: "Image intelligence is disabled globally.",
        intelligence: null,
        recommendation: null,
      };
    }

    // Import server-only analyzer inside handler to keep client bundle clean
    const { analyzeImageServer } = await import("@/lib/image-intelligence.server");
    const result = await analyzeImageServer({
      imageUrl: data.imageUrl,
      categorySlug: data.categorySlug ?? null,
    });

    // Audit trail — write regardless of success (safety contract: transparent)
    await supabase.from("image_intelligence_jobs").insert({
      image_url: data.imageUrl,
      product_slug: data.productSlug ?? null,
      category_slug: data.categorySlug ?? null,
      mode,
      status: result.status,
      analysis: result.intelligence ?? {},
      recommendation: result.recommendation ?? null,
      health_score: result.intelligence?.qualityScore ?? null,
      duration_ms: result.durationMs,
      error_message: result.errorMessage ?? null,
      requested_by: userId,
    });

    // Optionally persist analysis onto product_images row (never mutates url)
    if (data.persist && data.productSlug && result.intelligence) {
      await supabase
        .from("product_images")
        .update({
          analysis_json: result.intelligence,
          analyzed_at: new Date().toISOString(),
        })
        .eq("product_slug", data.productSlug)
        .eq("url", data.imageUrl);
    }

    return {
      status: result.status,
      intelligence: result.intelligence,
      recommendation: result.recommendation,
      durationMs: result.durationMs,
    };
  });

// ─────────────────────────────────────────────────────────────────────────
// Recent jobs
// ─────────────────────────────────────────────────────────────────────────

const listSchema = z.object({ limit: z.number().int().min(1).max(200).default(50) });

export const listRecentIntelligenceJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string }; // eslint-disable-line @typescript-eslint/no-explicit-any
    await assertRole(supabase, userId, STAFF_ROLES);
    const { data: rows, error } = await supabase
      .from("image_intelligence_jobs")
      .select("id, image_url, product_slug, category_slug, mode, status, health_score, duration_ms, recommendation, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
