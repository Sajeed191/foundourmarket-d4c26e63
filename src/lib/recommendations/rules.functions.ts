import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { BusinessRule } from "./rules";

/**
 * Business-rule server functions.
 * - `listActiveRules` — public read of enabled rules for the engine (service
 *   read of non-sensitive merchandising config, so guests get rules too).
 * - admin CRUD — guarded by `requireSupabaseAuth` + `has_role(admin)`.
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

export const listActiveRules = createServerFn({ method: "GET" }).handler(
  async (): Promise<BusinessRule[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("recommendation_rules")
      .select("id, rule_kind, target_type, target_value, weight, priority, enabled, starts_at, ends_at")
      .eq("enabled", true);
    if (error) {
      console.error(`[rules] listActiveRules failed [${error.code}]: ${error.message}`);
      return [];
    }
    return (data ?? []) as BusinessRule[];
  },
);

/** Admin: list every rule (including disabled). */
export const listAllRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BusinessRule[]> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { data, error } = await context.supabase
      .from("recommendation_rules")
      .select("id, rule_kind, target_type, target_value, weight, priority, enabled, starts_at, ends_at")
      .order("priority", { ascending: true });
    if (error) throw error;
    return (data ?? []) as BusinessRule[];
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  rule_kind: z.enum(["boost", "reduce", "exclude"]),
  target_type: z.enum([
    "new_arrivals", "high_margin", "fast_shipping", "local_seller", "featured", "sustainable",
    "low_inventory", "poor_reviews", "high_returns", "slow_delivery", "brand", "category", "product", "seller",
  ]),
  target_value: z.string().max(200).nullable().optional(),
  weight: z.number().min(0).max(20),
  priority: z.number().int().min(0).max(1000),
  enabled: z.boolean(),
  starts_at: z.string().nullable().optional(),
  ends_at: z.string().nullable().optional(),
});

export const upsertRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => upsertSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const row = {
      rule_kind: data.rule_kind,
      target_type: data.target_type,
      target_value: data.target_value ?? null,
      weight: data.weight,
      priority: data.priority,
      enabled: data.enabled,
      starts_at: data.starts_at ?? null,
      ends_at: data.ends_at ?? null,
    };
    if (data.id) {
      const { error } = await context.supabase.from("recommendation_rules").update(row).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: inserted, error } = await context.supabase
      .from("recommendation_rules")
      .insert(row)
      .select("id")
      .single();
    if (error) throw error;
    return { id: inserted.id };
  });

export const deleteRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { error } = await context.supabase.from("recommendation_rules").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
