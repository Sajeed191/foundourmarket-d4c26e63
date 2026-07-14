/**
 * Duplicate detection events — ignore history + learning signals.
 *
 * Admin-only writes go straight to `duplicate_detection_events` (base-table
 * RLS restricts to staff). These records power the ignore system (never warn
 * on an ignored pair again), the learning layer (repeat ignores suppress a
 * pair; merges/confirms reinforce it) and the intelligence dashboard.
 */
import { supabase } from "@/integrations/supabase/client";
import type { DupMatch, DupSignal, DupVerdict, DraftProduct } from "./types";

export type DupAction = "ignored" | "merged" | "created_anyway" | "confirmed";

/** Stable signature for a draft so ignore/learning can key on "this product". */
export function draftSignature(draft: DraftProduct): string {
  const parts = [
    (draft.name ?? "").toLowerCase().trim(),
    (draft.brand ?? "").toLowerCase().trim(),
    (draft.barcode ?? "").replace(/\D/g, ""),
  ].filter(Boolean);
  return parts.join("|") || "unknown";
}

/** A directional signature pair (draft <-> candidate) for ignore lookups. */
export function pairKey(sig: string, candidateSlug: string): string {
  return `${sig}::${candidateSlug}`;
}

export async function logDuplicateEvent(params: {
  draft: DraftProduct;
  match: DupMatch;
  action: DupAction;
}): Promise<{ error: Error | null }> {
  const { draft, match, action } = params;
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("duplicate_detection_events").insert({
    admin_id: userData.user?.id ?? null,
    draft_signature: draftSignature(draft),
    draft_name: draft.name ?? null,
    draft_brand: draft.brand ?? null,
    draft_category: draft.category ?? null,
    candidate_slug: match.product.slug,
    candidate_name: match.product.name,
    candidate_category: match.product.category,
    candidate_brand: match.product.brand,
    action,
    score: match.score,
    verdict: match.verdict,
    signals: match.signals as unknown as never,
  });
  return { error: (error as Error) ?? null };
}

export type LearningMap = {
  /** pairKey -> net learning boost in [-1, 1]. */
  boosts: Map<string, number>;
  /** Set of ignored pairKeys (suppress warnings). */
  ignored: Set<string>;
};

/**
 * Fetch the learning signals for a draft signature: ignored pairs and a
 * bounded per-pair boost derived from historical actions.
 * merged/confirmed → positive; ignored → negative.
 */
export async function loadLearning(sig: string): Promise<LearningMap> {
  const boosts = new Map<string, number>();
  const ignored = new Set<string>();
  const { data } = await supabase
    .from("duplicate_detection_events")
    .select("candidate_slug,action")
    .eq("draft_signature", sig)
    .limit(500);
  for (const r of (data as { candidate_slug: string | null; action: string }[]) ?? []) {
    if (!r.candidate_slug) continue;
    const key = pairKey(sig, r.candidate_slug);
    const cur = boosts.get(key) ?? 0;
    if (r.action === "ignored") {
      boosts.set(key, cur - 0.34);
      ignored.add(key);
    } else if (r.action === "merged" || r.action === "confirmed") {
      boosts.set(key, cur + 0.34);
      ignored.delete(key);
    }
  }
  // Clamp to [-1, 1].
  for (const [k, v] of boosts) boosts.set(k, Math.max(-1, Math.min(1, v)));
  return { boosts, ignored };
}

export type { DupSignal, DupVerdict };
