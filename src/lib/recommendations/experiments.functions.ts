import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Experiment } from "./experiments";

/**
 * Experiment server functions — public list of running experiments, plus
 * admin-guarded create/update and winner promotion. Per-variant metric
 * comparison happens in the nightly job; admins can also promote manually.
 */

function publicClient() {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(process.env.SUPABASE_URL!, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const listRunningExperiments = createServerFn({ method: "GET" }).handler(
  async (): Promise<Experiment[]> => {
    const supabase = publicClient();
    const { data, error } = await supabase
      .from("recommendation_experiments")
      .select("key, description, variants, traffic_split, status, winner")
      .eq("status", "running");
    if (error) {
      console.error(`[experiments] list failed [${error.code}]: ${error.message}`);
      return [];
    }
    return (data ?? []).map((r) => ({
      key: r.key,
      description: r.description,
      variants: Array.isArray(r.variants) ? (r.variants as string[]) : [],
      traffic_split: (r.traffic_split ?? {}) as Record<string, number>,
      status: r.status as Experiment["status"],
      winner: r.winner,
    }));
  },
);

export const listAllExperiments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { data, error } = await context.supabase
      .from("recommendation_experiments")
      .select("id, key, description, variants, traffic_split, status, winner, metrics, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  key: z.string().min(1).max(80).regex(/^[a-z0-9_-]+$/i),
  description: z.string().max(500).nullable().optional(),
  variants: z.array(z.string().min(1).max(60)).min(2).max(6),
  traffic_split: z.record(z.string(), z.number().min(0).max(100)),
  status: z.enum(["draft", "running", "paused", "completed"]),
});

export const upsertExperiment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => upsertSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const row = {
      key: data.key,
      description: data.description ?? null,
      variants: data.variants,
      traffic_split: data.traffic_split,
      status: data.status,
    };
    if (data.id) {
      const { error } = await context.supabase.from("recommendation_experiments").update(row).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: inserted, error } = await context.supabase
      .from("recommendation_experiments")
      .insert(row)
      .select("id")
      .single();
    if (error) throw error;
    return { id: inserted.id };
  });

export const promoteWinner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid(), winner: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { error } = await context.supabase
      .from("recommendation_experiments")
      .update({ winner: data.winner, status: "completed" })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
