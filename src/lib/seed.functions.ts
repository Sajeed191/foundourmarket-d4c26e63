import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const STAFF_ROLES = ["admin", "super_admin", "manager"];

async function assertSeedStaff(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error("Could not verify permissions.");
  const roles = (data ?? []).map((r) => r.role as string);
  if (!roles.some((r) => STAFF_ROLES.includes(r))) {
    throw new Error("You are not authorised to manage seed data.");
  }
}

// Tables that carry the is_seeded flag — used for live counts.
const SEED_TABLES = [
  "profiles",
  "orders",
  "order_items",
  "payments",
  "shipments",
  "shipment_events",
  "returns",
  "return_items",
  "product_reviews",
  "product_questions",
  "support_tickets",
  "support_messages",
  "wishlist",
  "analytics_events",
  "page_views",
  "search_logs",
] as const;

async function countSeeded() {
  const entries = await Promise.all(
    SEED_TABLES.map(async (t) => {
      const { count } = await supabaseAdmin
        .from(t)
        .select("*", { count: "exact", head: true })
        .eq("is_seeded", true);
      return [t, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<(typeof SEED_TABLES)[number], number>;
}

/** Admin — current seeded-row counts, analytics toggle, recent seed runs. */
export const getSeedStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    await assertSeedStaff(userId);

    const [counts, settings, runs] = await Promise.all([
      countSeeded(),
      supabaseAdmin
        .from("store_settings")
        .select("include_seed_in_analytics")
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("seed_runs")
        .select("id, kind, counts, created_at")
        .order("created_at", { ascending: false })
        .limit(15),
    ]);

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return {
      counts,
      total,
      includeInAnalytics: settings.data?.include_seed_in_analytics ?? false,
      runs: runs.data ?? [],
    };
  });

const RPC_BY_KIND = {
  customers: { fn: "seed_customers", arg: "_count" },
  orders: { fn: "seed_orders", arg: "_count" },
  shipments: { fn: "seed_shipments", arg: null },
  reviews: { fn: "seed_reviews", arg: "_count" },
  questions: { fn: "seed_questions", arg: "_count" },
  support: { fn: "seed_support", arg: "_count" },
  returns: { fn: "seed_returns", arg: "_count" },
  analytics: { fn: "seed_analytics", arg: "_days" },
} as const;

const runSchema = z.object({
  kind: z.enum([
    "customers",
    "orders",
    "shipments",
    "reviews",
    "questions",
    "support",
    "returns",
    "analytics",
  ]),
  amount: z.number().int().min(1).max(5000).default(20),
});

/** Admin — run a single seed generator. */
export const runSeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => runSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertSeedStaff(userId);

    const spec = RPC_BY_KIND[data.kind];
    const args = spec.arg ? { [spec.arg]: data.amount } : {};
    const { data: result, error } = await supabaseAdmin.rpc(spec.fn as any, args);
    if (error) throw new Error(error.message);
    return { kind: data.kind, result };
  });

const allSchema = z.object({
  scale: z.number().min(0.1).max(10).default(1),
});

/** Admin — seed the entire store at a chosen scale. */
export const seedAll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => allSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertSeedStaff(userId);

    const { data: result, error } = await supabaseAdmin.rpc("seed_all" as any, {
      _scale: data.scale,
    });
    if (error) throw new Error(error.message);
    return { result };
  });

/** Admin — remove ALL seeded data and seeded auth users. */
export const removeSeedData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    await assertSeedStaff(userId);

    const { data: result, error } = await supabaseAdmin.rpc("remove_seed_data" as any);
    if (error) throw new Error(error.message);
    return { result };
  });

const toggleSchema = z.object({ include: z.boolean() });

/** Admin — toggle whether seeded rows appear in analytics dashboards. */
export const setSeedInAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => toggleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertSeedStaff(userId);

    const { data: existing } = await supabaseAdmin
      .from("store_settings")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabaseAdmin
        .from("store_settings")
        .update({ include_seed_in_analytics: data.include })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("store_settings")
        .insert({ include_seed_in_analytics: data.include });
      if (error) throw new Error(error.message);
    }
    return { include: data.include };
  });
