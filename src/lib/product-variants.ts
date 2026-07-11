import { supabase } from "@/integrations/supabase/client";

/**
 * Admin-side variant model (reads the base `product_variants` table via staff
 * RLS, so it includes inactive variants that customers never see). The
 * customer-facing shape lives in `products.ts` (`fetchProductVariants`, which
 * reads the `product_variants_public` view — active variants of published
 * products only).
 *
 * Variants are fully optional per product: `products.has_variants` gates the
 * whole system so products without variants pay zero cost.
 */
export type AdminVariant = {
  id: string;
  productSlug: string;
  name: string;
  sku: string | null;
  size: string | null;
  color: string | null;
  colorHex: string | null;
  imageUrl: string | null;
  priceAdjustment: number;
  comparePrice: number | null;
  barcode: string | null;
  weight: number | null;
  stockQuantity: number;
  lowStockThreshold: number;
  active: boolean;
  sortOrder: number;
  version: number;
};

export const COMMON_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;

export const COMMON_COLORS: { name: string; hex: string }[] = [
  { name: "Black", hex: "#111111" },
  { name: "White", hex: "#ffffff" },
  { name: "Blue", hex: "#2563eb" },
  { name: "Red", hex: "#dc2626" },
  { name: "Green", hex: "#16a34a" },
  { name: "Grey", hex: "#6b7280" },
];

/** Human label for a combination, e.g. "Black • XL". */
export function variantLabel(size: string | null, color: string | null): string {
  return [color, size].filter(Boolean).join(" • ") || "Default";
}

function rowToAdminVariant(r: any): AdminVariant {
  return {
    id: r.id,
    productSlug: r.product_slug,
    name: r.name ?? "",
    sku: r.sku ?? null,
    size: r.size ?? null,
    color: r.color ?? null,
    colorHex: r.color_hex ?? null,
    imageUrl: r.image_url ?? null,
    priceAdjustment: Number(r.price_adjustment ?? 0),
    comparePrice: r.compare_price != null ? Number(r.compare_price) : null,
    barcode: r.barcode ?? null,
    weight: r.weight != null ? Number(r.weight) : null,
    stockQuantity: r.stock_quantity ?? 0,
    lowStockThreshold: r.low_stock_threshold ?? 5,
    active: r.active ?? true,
    sortOrder: r.sort_order ?? 0,
  };
}

/** Load every variant (active or not) for a product — admin only. */
export async function fetchAdminVariants(slug: string): Promise<AdminVariant[]> {
  const { data, error } = await supabase
    .from("product_variants")
    .select("*")
    .eq("product_slug", slug)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToAdminVariant);
}

/** Whether the product has variants enabled. */
export async function fetchHasVariants(slug: string): Promise<boolean> {
  const { data } = await supabase
    .from("products")
    .select("has_variants")
    .eq("slug", slug)
    .maybeSingle();
  return !!(data as any)?.has_variants;
}

export async function setHasVariants(slug: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from("products")
    .update({ has_variants: enabled, updated_at: new Date().toISOString() })
    .eq("slug", slug);
  if (error) throw error;
}

type VariantDraft = Omit<AdminVariant, "id" | "productSlug"> & { id?: string };

function draftToRow(slug: string, v: VariantDraft, index: number) {
  return {
    product_slug: slug,
    name: v.name || variantLabel(v.size, v.color),
    sku: v.sku?.trim() || null,
    size: v.size?.trim() || null,
    color: v.color?.trim() || null,
    color_hex: v.colorHex?.trim() || null,
    image_url: v.imageUrl?.trim() || null,
    price_adjustment: Number(v.priceAdjustment) || 0,
    compare_price: v.comparePrice != null && !Number.isNaN(v.comparePrice) ? v.comparePrice : null,
    barcode: v.barcode?.trim() || null,
    weight: v.weight != null && !Number.isNaN(v.weight) ? v.weight : null,
    stock_quantity: Math.max(0, Math.trunc(Number(v.stockQuantity) || 0)),
    low_stock_threshold: Math.max(0, Math.trunc(Number(v.lowStockThreshold) || 0)),
    active: v.active !== false,
    sort_order: index,
  };
}

/**
 * Persist the full variant set for a product: upsert existing/new rows and
 * delete rows the admin removed. Runs as the admin session (staff RLS).
 */
export async function saveVariants(slug: string, drafts: VariantDraft[]): Promise<void> {
  const { data: existing } = await supabase
    .from("product_variants")
    .select("id")
    .eq("product_slug", slug);
  const existingIds = new Set(((existing as any[]) ?? []).map((r) => r.id));
  const keptIds = new Set(drafts.filter((d) => d.id).map((d) => d.id as string));

  // Delete removed rows.
  const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
  if (toDelete.length) {
    const { error } = await supabase.from("product_variants").delete().in("id", toDelete);
    if (error) throw error;
  }

  // Upsert current rows.
  const updates = drafts
    .map((d, i) => ({ draft: d, i }))
    .filter(({ draft }) => draft.id);
  const inserts = drafts
    .map((d, i) => ({ draft: d, i }))
    .filter(({ draft }) => !draft.id);

  for (const { draft, i } of updates) {
    const { error } = await supabase
      .from("product_variants")
      .update(draftToRow(slug, draft, i))
      .eq("id", draft.id as string);
    if (error) throw error;
  }
  if (inserts.length) {
    const { error } = await supabase
      .from("product_variants")
      .insert(inserts.map(({ draft, i }) => draftToRow(slug, draft, i)));
    if (error) throw error;
  }
}
