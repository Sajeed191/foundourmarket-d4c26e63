import { discountPercent, type Product } from "@/lib/products";

/**
 * Centralised client-side filter logic for the marketplace search / browse
 * experience. Every filter here operates on data already present on the
 * `Product` record (no schema changes), so filters compose freely and the
 * live product count can be computed instantly without a network round-trip.
 */

export type Filters = {
  /** Parent category slug (handled server-side by the search RPC). */
  cat?: string;
  /** Subcategory slug (client-side). */
  sub?: string;
  /** Comma-separated brand names (multi-select). */
  brand?: string;
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

/**
 * Single-product predicate. `skip` lets facet computation exclude a specific
 * dimension (e.g. compute available brands while ignoring the brand filter).
 */
export function matchesFilters(
  p: Product,
  f: Filters,
  ctx: PriceCtx,
  skip?: keyof Filters,
): boolean {
  // Subcategory (parent is handled server-side by the RPC).
  if (f.sub && skip !== "sub" && !inCategory(p, f.sub)) return false;

  // Brand (multi-select).
  if (f.brand && skip !== "brand") {
    const wanted = f.brand.split(",").map((b) => b.trim().toLowerCase()).filter(Boolean);
    if (wanted.length && !wanted.includes(brandOf(p).toLowerCase())) return false;
  }

  // Price band (base USD).
  if (skip !== "min" && skip !== "max") {
    const price = basePriceOf(p);
    if (f.min != null && price < f.min) return false;
    if (f.max != null && price > f.max) return false;
  }

  // Rating.
  if (f.rating != null && skip !== "rating" && p.rating < f.rating) return false;

  // Availability.
  if (f.stock && skip !== "stock") {
    if (f.stock === "in" && !p.inStock) return false;
    if (f.stock === "out" && p.inStock) return false;
    if (f.stock === "pre" && !p.preorder) return false;
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
export function applyFilters(rows: Product[], f: Filters, ctx: PriceCtx): Product[] {
  return rows.filter((p) => matchesFilters(p, f, ctx));
}

/**
 * Brand facets available given the current filters (excluding the brand
 * dimension itself), with product counts. Sorted by count desc, then name.
 */
export function brandFacets(
  rows: Product[],
  f: Filters,
  ctx: PriceCtx,
): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of rows) {
    if (!matchesFilters(p, f, ctx, "brand")) continue;
    const b = brandOf(p);
    if (!b) continue;
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Number of individual active filter dimensions (drives the count badge). */
export function countActive(f: Filters): number {
  let n = 0;
  if (f.sub) n++;
  if (f.brand) n += f.brand.split(",").filter(Boolean).length;
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
