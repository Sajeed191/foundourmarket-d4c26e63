import { supabase } from "@/integrations/supabase/client";

/**
 * Lightweight variant facet layer.
 *
 * Enterprise filtering needs Colour / Size / variant-price / variant-stock,
 * but we must NEVER fetch full variant objects. Instead we read only the
 * handful of columns needed to compute facets from `product_variants_public`
 * (RLS-safe: active variants of published products only), keyed by product
 * slug, and reduce them into a tiny per-product summary that the filter
 * engine merges with the existing search results.
 */

export type VariantRow = {
  color: string | null;
  colorHex: string | null;
  size: string | null;
  stock: number;
  /** Absolute price override (in the product's base currency), if set. */
  override: number | null;
  /** Additive adjustment applied on top of the base price. */
  adjustment: number;
};

export type VariantSummary = {
  rows: VariantRow[];
  /** Distinct colour names present on this product's variants. */
  colors: string[];
  /** name -> hex swatch (first seen). */
  colorHex: Record<string, string>;
  /** Distinct sizes present on this product's variants. */
  sizes: string[];
  /** True when any variant has stock > 0. */
  inStock: boolean;
};

export type VariantFacetMap = Map<string, VariantSummary>;

/** Effective price of a single variant given the product's base price. */
export function variantEffectivePrice(base: number, r: VariantRow): number {
  return r.override != null ? r.override : base + (r.adjustment ?? 0);
}

/** Min/max effective price across a summary's variants (base-relative). */
export function variantPriceRange(base: number, s: VariantSummary): [number, number] {
  if (!s.rows.length) return [base, base];
  let lo = Infinity;
  let hi = -Infinity;
  for (const r of s.rows) {
    const p = variantEffectivePrice(base, r);
    if (p < lo) lo = p;
    if (p > hi) hi = p;
  }
  return [lo, hi];
}

const CHUNK = 300;
const SELECT = "product_slug,color,color_hex,size,stock_quantity,price_override,price_adjustment";

/**
 * Fetch variant facet summaries for a set of product slugs. The payload stays
 * tiny: only the columns above, only for the requested slugs, chunked so the
 * `IN (...)` list never grows unbounded.
 */
export async function fetchVariantFacets(slugs: string[]): Promise<VariantFacetMap> {
  const map: VariantFacetMap = new Map();
  const unique = [...new Set(slugs.filter(Boolean))];
  if (unique.length === 0) return map;

  for (let i = 0; i < unique.length; i += CHUNK) {
    const batch = unique.slice(i, i + CHUNK);
    const { data, error } = await (supabase as any)
      .from("product_variants_public")
      .select(SELECT)
      .in("product_slug", batch);
    if (error) {
      // Fail soft — variant facets are additive; the base filters still work.
      continue;
    }
    for (const r of (data ?? []) as any[]) {
      const slug = r.product_slug as string;
      let s = map.get(slug);
      if (!s) {
        s = { rows: [], colors: [], colorHex: {}, sizes: [], inStock: false };
        map.set(slug, s);
      }
      const color = r.color ? String(r.color).trim() : null;
      const size = r.size ? String(r.size).trim() : null;
      const stock = Number(r.stock_quantity ?? 0);
      s.rows.push({
        color,
        colorHex: r.color_hex ?? null,
        size,
        stock,
        override: r.price_override != null ? Number(r.price_override) : null,
        adjustment: r.price_adjustment != null ? Number(r.price_adjustment) : 0,
      });
      if (color && !s.colors.includes(color)) {
        s.colors.push(color);
        if (r.color_hex) s.colorHex[color] = r.color_hex;
      }
      if (size && !s.sizes.includes(size)) s.sizes.push(size);
      if (stock > 0) s.inStock = true;
    }
  }
  return map;
}
