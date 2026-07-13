/**
 * Recommendation Experiments — deterministic client-side A/B bucketing.
 *
 * A stable per-device visitor id + a hash of (visitorId + experimentKey)
 * assigns each visitor to a variant by the experiment's traffic split. No
 * flicker (decided synchronously), no server round-trip on read. Assignment is
 * recorded once (fire-and-forget) so per-variant funnels can accrue, and the
 * active variant is tagged onto funnel events for measurement.
 */

import { supabase } from "@/integrations/supabase/client";

export type Experiment = {
  key: string;
  description: string | null;
  variants: string[];
  traffic_split: Record<string, number>;
  status: "draft" | "running" | "paused" | "completed";
  winner: string | null;
};

const VISITOR_KEY = "fom_visitor_id";
const ASSIGN_KEY = "fom_experiment_assignments";

export function getVisitorId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id) {
    id = (crypto.randomUUID?.() ?? `v_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    localStorage.setItem(VISITOR_KEY, id);
  }
  return id;
}

/** Stable 32-bit hash → [0,1). */
function hashUnit(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** Deterministically pick a variant for this visitor from the traffic split. */
export function assignVariant(exp: Experiment, visitorId: string): string {
  if (exp.winner) return exp.winner;
  const variants = exp.variants.length ? exp.variants : ["control"];
  const split = exp.traffic_split ?? {};
  const total = variants.reduce((s, v) => s + (split[v] ?? 0), 0);
  const roll = hashUnit(`${visitorId}:${exp.key}`);
  if (total <= 0) {
    // Even split fallback.
    return variants[Math.floor(roll * variants.length)] ?? variants[0];
  }
  let acc = 0;
  const target = roll * total;
  for (const v of variants) {
    acc += split[v] ?? 0;
    if (target < acc) return v;
  }
  return variants[variants.length - 1];
}

function localAssignments(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(ASSIGN_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

/**
 * Resolve (and persist) the variant for an experiment. Records the assignment
 * to the backend exactly once per device+experiment (best-effort, anon insert).
 */
export function resolveExperiment(exp: Experiment): string {
  const visitorId = getVisitorId();
  const variant = assignVariant(exp, visitorId);
  const store = localAssignments();
  if (store[exp.key] !== variant) {
    store[exp.key] = variant;
    if (typeof window !== "undefined") localStorage.setItem(ASSIGN_KEY, JSON.stringify(store));
    // Fire-and-forget; unique(visitor_id, experiment_key) makes this idempotent.
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      await supabase
        .from("experiment_assignments")
        .upsert(
          { visitor_id: visitorId, user_id: auth.user?.id ?? null, experiment_key: exp.key, variant },
          { onConflict: "visitor_id,experiment_key" },
        );
    })();
  }
  return variant;
}

/** Read the currently-assigned variant for a key without re-assigning. */
export function currentVariant(key: string): string | null {
  return localAssignments()[key] ?? null;
}
