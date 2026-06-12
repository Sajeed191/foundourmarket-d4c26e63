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

type SeoRow = {
  slug: string;
  name: string | null;
  sku: string | null;
  image: string | null;
  seo_title: string | null;
  seo_description: string | null;
};

const blank = (v: string | null | undefined) => !v || !v.trim();

/** SEO Health aggregate: coverage, missing fields, duplicate metadata.
 * Read-only — never mutates. */
export const adminSeoSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertStaff(supabase, userId);

    const { data: rowsRaw, error } = await supabase
      .from("products")
      .select("slug,name,sku,image,seo_title,seo_description")
      .is("deleted_at", null)
      .limit(20_000);
    if (error) throw new Error(error.message);
    const rows = (rowsRaw as SeoRow[]) ?? [];
    const total = rows.length;

    // Image alt-text coverage from product_images.
    const { data: imgRaw } = await supabase
      .from("product_images")
      .select("product_slug,alt")
      .limit(50_000);
    const imgs = (imgRaw as { product_slug: string; alt: string | null }[]) ?? [];
    const missingAltSlugs = new Set<string>();
    let missingAltCount = 0;
    for (const im of imgs) {
      if (blank(im.alt)) {
        missingAltCount++;
        if (im.product_slug) missingAltSlugs.add(im.product_slug);
      }
    }

    const buckets = {
      missing_title: [] as string[],
      missing_desc: [] as string[],
      missing_image: [] as string[],
      missing_sku: [] as string[],
      fully_optimized: [] as string[],
    };

    const titleSeen = new Map<string, string[]>();
    const descSeen = new Map<string, string[]>();

    for (const p of rows) {
      const noTitle = blank(p.seo_title);
      const noDesc = blank(p.seo_description);
      const noImg = blank(p.image);
      const noSku = blank(p.sku);
      if (noTitle) buckets.missing_title.push(p.slug);
      if (noDesc) buckets.missing_desc.push(p.slug);
      if (noImg) buckets.missing_image.push(p.slug);
      if (noSku) buckets.missing_sku.push(p.slug);
      if (!noTitle && !noDesc && !noImg) buckets.fully_optimized.push(p.slug);

      if (!noTitle) {
        const k = p.seo_title!.trim().toLowerCase();
        const a = titleSeen.get(k) ?? [];
        a.push(p.slug);
        titleSeen.set(k, a);
      }
      if (!noDesc) {
        const k = p.seo_description!.trim().toLowerCase();
        const a = descSeen.get(k) ?? [];
        a.push(p.slug);
        descSeen.set(k, a);
      }
    }

    const dupTitleGroups = [...titleSeen.entries()]
      .filter(([, s]) => s.length > 1)
      .map(([title, slugs]) => ({ value: title, slugs, count: slugs.length }))
      .sort((a, b) => b.count - a.count);
    const dupDescGroups = [...descSeen.entries()]
      .filter(([, s]) => s.length > 1)
      .map(([value, slugs]) => ({ value, slugs, count: slugs.length }))
      .sort((a, b) => b.count - a.count);

    const dupTitleCount = dupTitleGroups.reduce((a, g) => a + g.count, 0);
    const dupDescCount = dupDescGroups.reduce((a, g) => a + g.count, 0);

    const optimized = buckets.fully_optimized.length;
    const coverage = total ? Math.round((optimized / total) * 100) : 100;

    return {
      total,
      coverage,
      counts: {
        optimized,
        missingTitle: buckets.missing_title.length,
        missingDesc: buckets.missing_desc.length,
        missingImage: buckets.missing_image.length,
        missingSku: buckets.missing_sku.length,
        missingAltImages: missingAltCount,
        missingAltProducts: missingAltSlugs.size,
        duplicateTitles: dupTitleCount,
        duplicateDescriptions: dupDescCount,
      },
      buckets,
      duplicates: {
        titles: dupTitleGroups.slice(0, 25),
        descriptions: dupDescGroups.slice(0, 25),
      },
    };
  });

/** Bulk-fill missing SEO title/description/keywords by re-running the database
 * SEO generator (BEFORE UPDATE trigger). Never overwrites manual SEO — the
 * trigger only fills blank fields. */
export const adminBulkGenerateSeo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ slugs: z.array(z.string().min(1).max(220)).max(20_000).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertStaff(supabase, userId);

    let q = supabase
      .from("products")
      .select("slug")
      .or("seo_title.is.null,seo_title.eq.,seo_description.is.null,seo_description.eq.")
      .is("deleted_at", null);
    if (data.slugs && data.slugs.length) q = q.in("slug", data.slugs);
    const { data: targets, error } = await q.limit(20_000);
    if (error) throw new Error(error.message);

    let updated = 0;
    for (const t of (targets as { slug: string }[]) ?? []) {
      // Touch updated_at so the DB SEO trigger fills any blank SEO fields.
      const { error: upErr } = await supabase
        .from("products")
        .update({ updated_at: new Date().toISOString() })
        .eq("slug", t.slug);
      if (!upErr) updated += 1;
    }

    await supabase.from("admin_activity_logs").insert({
      actor_id: userId,
      action: "product.bulk_seo_generate",
      entity_type: "product",
      entity_id: "bulk",
      metadata: { updated },
    });

    return { ok: true, updated };
  });

/** Bulk-fill missing image alt text as "{Product Name} Product Image".
 * Only fills blank alt — never overwrites existing alt text. */
export const adminBulkGenerateAltText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ slugs: z.array(z.string().min(1).max(220)).max(20_000).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertStaff(supabase, userId);

    // Map slug -> product name for alt-text composition.
    let pq = supabase.from("products").select("slug,name").is("deleted_at", null);
    if (data.slugs && data.slugs.length) pq = pq.in("slug", data.slugs);
    const { data: prods, error: pErr } = await pq.limit(20_000);
    if (pErr) throw new Error(pErr.message);
    const nameBySlug = new Map<string, string>(
      ((prods as { slug: string; name: string | null }[]) ?? []).map((p) => [p.slug, p.name ?? p.slug]),
    );

    let iq = supabase.from("product_images").select("id,product_slug,alt").or("alt.is.null,alt.eq.");
    if (data.slugs && data.slugs.length) iq = iq.in("product_slug", data.slugs);
    const { data: imgs, error: iErr } = await iq.limit(50_000);
    if (iErr) throw new Error(iErr.message);

    let updated = 0;
    for (const im of (imgs as { id: string; product_slug: string; alt: string | null }[]) ?? []) {
      const name = nameBySlug.get(im.product_slug);
      if (!name) continue;
      const alt = `${name} Product Image`;
      const { error: upErr } = await supabase.from("product_images").update({ alt }).eq("id", im.id);
      if (!upErr) updated += 1;
    }

    await supabase.from("admin_activity_logs").insert({
      actor_id: userId,
      action: "product.bulk_alt_generate",
      entity_type: "product_image",
      entity_id: "bulk",
      metadata: { updated },
    });

    return { ok: true, updated };
  });
