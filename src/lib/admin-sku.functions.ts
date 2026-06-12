import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STAFF_ROLES = ["admin", "super_admin", "manager", "warehouse_staff", "editor"];

async function assertStaff(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", STAFF_ROLES);
  if (!data || data.length === 0) throw new Error("Forbidden: staff access required.");
}

const SKU_RE = /^FOM-(\d{6,})$/i;

function nextSkuNumber(existing: string[]): number {
  let max = 0;
  for (const s of existing) {
    const m = SKU_RE.exec((s ?? "").trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

const fmt = (n: number) => `FOM-${String(n).padStart(6, "0")}`;

/** Bulk-generate FOM-###### SKUs for products that are missing one.
 * Never overwrites an existing SKU; guarantees uniqueness. */
export const adminGenerateSkus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ slugs: z.array(z.string().min(1).max(220)).max(20_000).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertStaff(supabase, userId);

    // Existing SKUs across the whole catalog → uniqueness + next number.
    const { data: allSku, error: skuErr } = await supabase
      .from("products")
      .select("sku")
      .not("sku", "is", null)
      .limit(50_000);
    if (skuErr) throw new Error(skuErr.message);
    const taken = new Set<string>(
      (allSku ?? []).map((r: any) => String(r.sku ?? "").trim().toUpperCase()).filter(Boolean),
    );

    // Targets = missing-SKU products (optionally restricted to provided slugs).
    let q = supabase.from("products").select("slug,sku").or("sku.is.null,sku.eq.").is("deleted_at", null);
    if (data.slugs && data.slugs.length) q = q.in("slug", data.slugs);
    const { data: targets, error: tErr } = await q.limit(20_000);
    if (tErr) throw new Error(tErr.message);

    let counter = nextSkuNumber([...taken]);
    let generated = 0;
    for (const t of (targets as any[]) ?? []) {
      let sku = fmt(counter);
      while (taken.has(sku.toUpperCase())) {
        counter += 1;
        sku = fmt(counter);
      }
      const { error: upErr } = await supabase
        .from("products")
        .update({ sku, updated_at: new Date().toISOString() })
        .eq("slug", t.slug);
      if (upErr) continue;
      taken.add(sku.toUpperCase());
      counter += 1;
      generated += 1;
    }

    await supabase.from("admin_activity_logs").insert({
      actor_id: userId,
      action: "product.bulk_sku_generate",
      entity_type: "product",
      entity_id: "bulk",
      metadata: { generated },
    });

    return { ok: true, generated };
  });

/** Manually set/clear a single product SKU with uniqueness validation. */
export const adminSetSku = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        slug: z.string().min(1).max(220),
        sku: z.string().max(120).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertStaff(supabase, userId);

    const clean = data.sku == null ? null : data.sku.trim();
    if (clean) {
      const { data: dupe } = await supabase
        .from("products")
        .select("slug")
        .ilike("sku", clean)
        .neq("slug", data.slug)
        .limit(1);
      if (dupe && dupe.length) throw new Error(`SKU "${clean}" is already used by another product.`);
    }

    const { error } = await supabase
      .from("products")
      .update({ sku: clean || null, updated_at: new Date().toISOString() })
      .eq("slug", data.slug);
    if (error) throw new Error(error.message);

    await supabase.from("admin_activity_logs").insert({
      actor_id: userId,
      action: "product.set_sku",
      entity_type: "product",
      entity_id: data.slug,
      metadata: { sku: clean },
    });

    return { ok: true, sku: clean };
  });
