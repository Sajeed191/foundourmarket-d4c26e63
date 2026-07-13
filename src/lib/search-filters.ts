import { discountPercent, type Product } from "@/lib/products";
import {
  variantEffectivePrice,
  type VariantFacetMap,
  type VariantSummary,
} from "@/lib/variant-facets";

/**
 * Centralised client-side filter logic for the marketplace search / browse
 * experience. Every filter here operates on data already present on the
 * `Product` record (no schema changes) plus an optional lightweight variant
 * facet map, so filters compose freely and the live product count can be
 * computed instantly without a network round-trip.
 */

export type Filters = {
  /** Parent category slug (handled server-side by the search RPC). */
  cat?: string;
  /** Subcategory slug (client-side). */
  sub?: string;
  /** Comma-separated brand names (multi-select). */
  brand?: string;
  /** Comma-separated colour names (variant-aware, multi-select). */
  color?: string;
  /** Comma-separated sizes (variant-aware, multi-select). */
  size?: string;
  /** Price band in base USD (matches the DB base price column). */
  min?: number;
  max?: number;
  /** Minimum star rating. */
  rating?: number;
  /** Availability: "in" | "out" | "pre". */
  stock?: string;
  /** Offer toggles — each is "1" when active. */
  free?: string; // free shipping
  cod?: string; // cash on delivery
  sale?: string; // on sale (any discount)
  flash?: string; // flash deal
  hot?: string; // hot deal
  newx?: string; // new arrival
  feat?: string; // featured / staff pick
  /** Minimum discount percentage tier (10, 20, 30, 40, 50, 70). */
  dmin?: number;
};

export type PriceCtx = {
  priceOf: (p: Product) => number;
  compareOf: (p: Product) => number | null;
  shippingFeeOf: (p: Product) => number;
};

/** Base USD price used by the price-band filter (matches DB `price` column). */
export function basePriceOf(p: Product): number {
  return p.priceUsd ?? p.price ?? 0;
}

/** Effective discount percentage for a product in the active region. */
export function effectiveDiscount(p: Product, ctx: PriceCtx): number {
  const fromCompare = discountPercent(ctx.priceOf(p), ctx.compareOf(p));
  return Math.max(fromCompare ?? 0, p.discount ?? 0);
}

/** True when the product carries any active discount. */
export function isOnSale(p: Product, ctx: PriceCtx): boolean {
  return effectiveDiscount(p, ctx) > 0;
}

export function brandOf(p: Product): string {
  return (p.brand ?? "").trim();
}

function inCategory(p: Product, slug: string): boolean {
  if (p.category === slug) return true;
  return Array.isArray(p.categories) && p.categories.includes(slug);
}

function splitCsv(v?: string): string[] {
  return (v ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function summaryFor(p: Product, variants?: VariantFacetMap): VariantSummary | undefined {
  if (!variants) return undefined;
  const s = variants.get(p.slug);
  return s && s.rows.length ? s : undefined;
}

/**
 * Variants that match the selected colour AND size (case-insensitive). When
 * neither dimension is selected, all variant rows qualify. Enables true
 * per-variant intersection (e.g. "Blue" + "XL" under a price band).
 */
function matchingVariants(s: VariantSummary, f: Filters): VariantSummary["rows"] {
  const colors = splitCsv(f.color).map((c) => c.toLowerCase());
  const sizes = splitCsv(f.size).map((c) => c.toLowerCase());
  return s.rows.filter((r) => {
    if (colors.length && !(r.color && colors.includes(r.color.toLowerCase()))) return false;
    if (sizes.length && !(r.size && sizes.includes(r.size.toLowerCase()))) return false;
    return true;
  });
}

/**
 * Single-product predicate. `skip` lets facet computation exclude a specific
 * dimension (e.g. compute available brands while ignoring the brand filter).
 * `variants` merges lightweight variant facet data: variant products filter by
 * variant colour/size/price/stock, non-variant products use product data.
 */
export function matchesFilters(
  p: Product,
  f: Filters,
  ctx: PriceCtx,
  skip?: keyof Filters,
  variants?: VariantFacetMap,
): boolean {
  const summary = summaryFor(p, variants);

  // Subcategory (parent is handled server-side by the RPC).
  if (f.sub && skip !== "sub" && !inCategory(p, f.sub)) return false;

  // Brand (multi-select).
  if (f.brand && skip !== "brand") {
    const wanted = splitCsv(f.brand).map((b) => b.toLowerCase());
    if (wanted.length && !wanted.includes(brandOf(p).toLowerCase())) return false;
  }

  // Colour (variant-aware): only meaningful for products that have variants.
  if (f.color && skip !== "color") {
    if (!summary) return false;
    const wanted = splitCsv(f.color).map((c) => c.toLowerCase());
    const has = summary.colors.some((c) => wanted.includes(c.toLowerCase()));
    if (!has) return false;
  }

  // Size (variant-aware).
  if (f.size && skip !== "size") {
    if (!summary) return false;
    const wanted = splitCsv(f.size).map((c) => c.toLowerCase());
    const has = summary.sizes.some((c) => wanted.includes(c.toLowerCase()));
    if (!has) return false;
  }

  // Price band (base USD). Variant products use their variant effective price
  // (restricted to variants matching the selected colour/size).
  if (skip !== "min" && skip !== "max" && (f.min != null || f.max != null)) {
    if (summary) {
      const base = basePriceOf(p);
      const candidates = matchingVariants(summary, f);
      const ok = candidates.some((r) => {
        const price = variantEffectivePrice(base, r);
        if (f.min != null && price < f.min) return false;
        if (f.max != null && price > f.max) return false;
        return true;
      });
      if (!ok) return false;
    } else {
      const price = basePriceOf(p);
      if (f.min != null && price < f.min) return false;
      if (f.max != null && price > f.max) return false;
    }
  }

  // Rating.
  if (f.rating != null && skip !== "rating" && p.rating < f.rating) return false;

  // Availability. Variant products use aggregate variant stock.
  if (f.stock && skip !== "stock") {
    if (summary) {
      const candidates = matchingVariants(summary, f);
      const anyInStock = candidates.some((r) => r.stock > 0);
      if (f.stock === "in" && !anyInStock) return false;
      if (f.stock === "out" && anyInStock) return false;
      if (f.stock === "pre" && !p.preorder) return false;
    } else {
      if (f.stock === "in" && !p.inStock) return false;
      if (f.stock === "out" && p.inStock) return false;
      if (f.stock === "pre" && !p.preorder) return false;
    }
  }

  // Offers.
  if (f.free === "1" && skip !== "free" && ctx.shippingFeeOf(p) > 0) return false;
  if (f.cod === "1" && skip !== "cod" && !p.codEnabled) return false;
  if (f.sale === "1" && skip !== "sale" && !isOnSale(p, ctx)) return false;
  if (f.flash === "1" && skip !== "flash" && !p.flashDeal) return false;
  if (f.hot === "1" && skip !== "hot" && !p.hotDeal) return false;
  if (f.newx === "1" && skip !== "newx" && !p.newArrival) return false;
  if (f.feat === "1" && skip !== "feat" && !(p.featured || p.staffPick)) return false;

  // Discount tier.
  if (f.dmin != null && skip !== "dmin" && effectiveDiscount(p, ctx) < f.dmin) return false;

  return true;
}

/** Apply all client-side filters to a list of rows. */
export function applyFilters(
  rows: Product[],
  f: Filters,
  ctx: PriceCtx,
  variants?: VariantFacetMap,
): Product[] {
  return rows.filter((p) => matchesFilters(p, f, ctx, undefined, variants));
}

export type Facet = { name: string; count: number; hex?: string };

/**
 * Brand facets available given the current filters (excluding the brand
 * dimension itself), with product counts. Sorted by count desc, then name.
 */
export function brandFacets(
  rows: Product[],
  f: Filters,
  ctx: PriceCtx,
  variants?: VariantFacetMap,
): Facet[] {
  const counts = new Map<string, number>();
  for (const p of rows) {
    if (!matchesFilters(p, f, ctx, "brand", variants)) continue;
    const b = brandOf(p);
    if (!b) continue;
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Colour facets (variant-aware), with hex swatches and live counts. */
export function colorFacets(
  rows: Product[],
  f: Filters,
  ctx: PriceCtx,
  variants?: VariantFacetMap,
): Facet[] {
  if (!variants) return [];
  const counts = new Map<string, number>();
  const hex = new Map<string, string>();
  for (const p of rows) {
    const s = variants.get(p.slug);
    if (!s || !s.colors.length) continue;
    if (!matchesFilters(p, f, ctx, "color", variants)) continue;
    for (const c of s.colors) {
      counts.set(c, (counts.get(c) ?? 0) + 1);
      if (!hex.has(c) && s.colorHex[c]) hex.set(c, s.colorHex[c]);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count, hex: hex.get(name) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// Common apparel size order; anything else falls back to alphabetical.
const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "3XL", "4XL"];
function sizeRank(s: string): number {
  const i = SIZE_ORDER.indexOf(s.toUpperCase());
  return i === -1 ? 999 : i;
}

/** Size facets (variant-aware), ordered by natural apparel size. */
export function sizeFacets(
  rows: Product[],
  f: Filters,
  ctx: PriceCtx,
  variants?: VariantFacetMap,
): Facet[] {
  if (!variants) return [];
  const counts = new Map<string, number>();
  for (const p of rows) {
    const s = variants.get(p.slug);
    if (!s || !s.sizes.length) continue;
    if (!matchesFilters(p, f, ctx, "size", variants)) continue;
    for (const sz of s.sizes) counts.set(sz, (counts.get(sz) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => sizeRank(a.name) - sizeRank(b.name) || a.name.localeCompare(b.name));
}

/** Number of individual active filter dimensions (drives the count badge). */
export function countActive(f: Filters): number {
  let n = 0;
  if (f.sub) n++;
  if (f.brand) n += splitCsv(f.brand).length;
  if (f.color) n += splitCsv(f.color).length;
  if (f.size) n += splitCsv(f.size).length;
  if (f.min != null || f.max != null) n++;
  if (f.rating != null) n++;
  if (f.stock) n++;
  if (f.free === "1") n++;
  if (f.cod === "1") n++;
  if (f.sale === "1") n++;
  if (f.flash === "1") n++;
  if (f.hot === "1") n++;
  if (f.newx === "1") n++;
  if (f.feat === "1") n++;
  if (f.dmin != null) n++;
  return n;
}

export type SortOption = { value: string; label: string; desc: string };

export const SORT_OPTIONS: SortOption[] = [
  { value: "relevance", label: "Relevance", desc: "Best match for your search" },
  { value: "trending", label: "Trending", desc: "Rising in views & sales" },
  { value: "best_selling", label: "Best Selling", desc: "Most orders overall" },
  { value: "rating", label: "Highest Rated", desc: "Top review scores first" },
  { value: "newest", label: "Newest", desc: "Latest arrivals" },
  { value: "price_asc", label: "Price: Low → High", desc: "Cheapest first" },
  { value: "price_desc", label: "Price: High → Low", desc: "Premium first" },
  { value: "discount", label: "Biggest Discount", desc: "Best deals first" },
  { value: "best_selling_reviews", label: "Most Reviewed", desc: "Most customer reviews" },
];
