import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireStaff, logSecurity, adminRpc } from "./admin-guard.server";

const STAFF = ["admin", "super_admin", "manager"] as const;

/* ---------------- Customer-facing ---------------- */

/** Submit a region-change request (region is locked; staff must approve). */
export const requestRegionChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        requestedRegion: z.enum(["india", "international"]),
        reason: z.string().trim().min(5).max(800),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };

    const { data: profile } = await supabase
      .from("profiles")
      .select("market_region")
      .eq("id", userId)
      .maybeSingle();

    // Block duplicate open requests.
    const { data: open } = await supabase
      .from("region_change_requests")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "pending")
      .maybeSingle();
    if (open) {
      return { ok: false as const, reason: "You already have a pending request." };
    }

    const { error } = await supabase.from("region_change_requests").insert({
      user_id: userId,
      current_region: profile?.market_region ?? null,
      requested_region: data.requestedRegion,
      reason: data.reason,
      status: "pending",
    });
    if (error) throw new Error(error.message || "Could not submit your request.");
    return { ok: true as const };
  });

/** The current user's most recent region request + full assignment history. */
export const getMyRegionState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const [{ data: req }, { data: history }] = await Promise.all([
      supabase
        .from("region_change_requests")
        .select("id,requested_region,status,reason,review_note,created_at,resolved_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("region_assignment_history")
        .select("id,region,previous_region,method,reason,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    return { latestRequest: req ?? null, history: history ?? [] };
  });

/* ---------------- Staff / admin ---------------- */

/** Paginated customer region overview with open-request counts. */
export const adminListCustomerRegions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        search: z.string().trim().max(120).optional().nullable(),
        region: z.enum(["india", "international", "all"]).optional().default("all"),
        limit: z.number().int().min(1).max(100).optional().default(50),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await requireStaff(userId, [...STAFF], "region.list_customers");

    let q = supabaseAdmin
      .from("profiles")
      .select("id,full_name,phone,country_code,market_region,region_locked_at")
      .order("region_locked_at", { ascending: false, nullsFirst: false })
      .limit(data.limit);
    if (data.region !== "all") q = q.eq("market_region", data.region);
    if (data.search) q = q.ilike("full_name", `%${data.search}%`);

    const { data: rows, error } = await q;
    if (error) throw new Error("Could not load customers.");

    const ids = (rows ?? []).map((r) => r.id);

    // How each customer's region was locked (self / admin / support approval).
    const methodByUser = new Map<string, string>();
    // The latest detection telemetry per customer (confidence, tier, signals).
    const detectionByUser = new Map<
      string,
      {
        confidence: number | null;
        tier: string | null;
        source: string | null;
        reasons: string[];
        country: string | null;
        detectedAt: string | null;
      }
    >();

    if (ids.length) {
      const [{ data: history }, { data: events }] = await Promise.all([
        supabaseAdmin
          .from("region_assignment_history")
          .select("user_id,method,created_at")
          .in("user_id", ids)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("analytics_events")
          .select("user_id,metadata,value,created_at")
          .eq("event", "region_detected")
          .in("user_id", ids)
          .order("created_at", { ascending: false }),
      ]);

      // Rows are newest-first → first seen per user wins.
      (history ?? []).forEach((h) => {
        if (h.user_id && !methodByUser.has(h.user_id)) {
          methodByUser.set(h.user_id, h.method ?? "—");
        }
      });
      (events ?? []).forEach((e) => {
        if (!e.user_id || detectionByUser.has(e.user_id)) return;
        const m = (e.metadata ?? {}) as Record<string, unknown>;
        detectionByUser.set(e.user_id, {
          confidence:
            typeof m.confidence === "number"
              ? (m.confidence as number)
              : typeof e.value === "number"
                ? (e.value as number)
                : null,
          tier: (m.tier as string) ?? null,
          source: (m.source as string) ?? null,
          reasons: Array.isArray(m.reasons) ? (m.reasons as string[]) : [],
          country: (m.countryCode as string) ?? null,
          detectedAt: e.created_at ?? null,
        });
      });
    }

    const customers = (rows ?? []).map((r) => {
      const det = detectionByUser.get(r.id) ?? null;
      return {
        ...r,
        currency: r.market_region === "india" ? "INR" : r.market_region ? "USD" : null,
        assignmentMethod: methodByUser.get(r.id) ?? null,
        confidence: det?.confidence ?? null,
        detectionTier: det?.tier ?? null,
        detectionSource: det?.source ?? null,
        detectionReasons: det?.reasons ?? [],
        detectedCountry: det?.country ?? null,
        detectedAt: det?.detectedAt ?? null,
      };
    });

    return { customers };
  });

/** Pending + recent region-change requests for staff review. */
export const adminListRegionRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    await requireStaff(userId, [...STAFF], "region.list_requests");

    const { data: requests, error } = await supabaseAdmin
      .from("region_change_requests")
      .select(
        "id,user_id,current_region,requested_region,reason,status,review_note,created_at,resolved_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("Could not load requests.");

    const ids = Array.from(new Set((requests ?? []).map((r) => r.user_id)));
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id,full_name")
        .in("id", ids);
      (profs ?? []).forEach((p) => names.set(p.id, p.full_name ?? "—"));
    }
    return {
      requests: (requests ?? []).map((r) => ({ ...r, full_name: names.get(r.user_id) ?? "—" })),
    };
  });

/** Region assignment history for a specific customer (staff view). */
export const adminGetUserRegionHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ targetUserId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await requireStaff(userId, [...STAFF], "region.view_history", data.targetUserId);
    const { data: history } = await supabaseAdmin
      .from("region_assignment_history")
      .select("id,region,previous_region,method,assigned_by,reason,created_at")
      .eq("user_id", data.targetUserId)
      .order("created_at", { ascending: false })
      .limit(50);
    return { history: history ?? [] };
  });

/** Staff override: set a customer's region directly (audited). */
export const adminSetUserRegion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        targetUserId: z.string().uuid(),
        region: z.enum(["india", "international"]),
        reason: z.string().trim().min(3).max(800),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(
      userId,
      [...STAFF],
      "region.change",
      data.targetUserId,
    );

    const { error } = await adminRpc("admin_change_region", {
      _actor: userId,
      _target: data.targetUserId,
      _region: data.region,
      _reason: data.reason,
      _method: "admin",
    });
    if (error) throw new Error(error.message || "Could not change region.");

    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: "region.change.applied",
      target: data.targetUserId,
      success: true,
      detail: { region: data.region, reason: data.reason },
    });
    return { ok: true as const };
  });

/** Approve or reject a customer's region-change request. */
export const adminReviewRegionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        requestId: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        note: z.string().trim().max(800).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, [...STAFF], "region.review_request");

    const { data: req, error: rErr } = await supabaseAdmin
      .from("region_change_requests")
      .select("id,user_id,requested_region,status")
      .eq("id", data.requestId)
      .maybeSingle();
    if (rErr || !req) throw new Error("Request not found.");
    if (req.status !== "pending") {
      return { ok: false as const, reason: "This request was already reviewed." };
    }

    if (data.decision === "approved") {
      const { error } = await adminRpc("admin_change_region", {
        _actor: userId,
        _target: req.user_id,
        _region: req.requested_region,
        _reason: data.note ?? "Approved region-change request",
        _method: "support_approval",
      });
      if (error) throw new Error(error.message || "Could not apply region change.");
    }

    await supabaseAdmin
      .from("region_change_requests")
      .update({
        status: data.decision,
        reviewed_by: userId,
        review_note: data.note ?? null,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", data.requestId);

    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: `region.request.${data.decision}`,
      target: req.user_id,
      success: true,
      detail: { requestId: data.requestId, region: req.requested_region },
    });
    return { ok: true as const };
  });
