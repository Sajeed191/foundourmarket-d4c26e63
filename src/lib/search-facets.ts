import { useMemo } from "react";
import type { Product } from "@/lib/products";
import type { VariantFacetMap } from "@/lib/variant-facets";
import {
  applyFilters,
  brandFacets,
  colorFacets,
  sizeFacets,
  type Facet,
  type Filters,
  type PriceCtx,
} from "@/lib/search-filters";

/**
 * FacetEngine — a single memoized hook that turns the raw result set + variant
 * facet map + current filters into everything the UI needs: the filtered
 * product count and every dynamic facet list (brand / colour / size) with live
 * counts. Each facet excludes its own dimension so counts reflect "what would I
 * get if I also picked this value".
 *
 * Keeping this in one module means adding a new facet later is a one-line
 * change here plus a descriptor in the drawer — no refactor.
 */
export type FacetResult = {
  count: number;
  brands: Facet[];
  colors: Facet[];
  sizes: Facet[];
};

export function useFacets(
  rows: Product[],
  filters: Filters,
  ctx: PriceCtx,
  variants?: VariantFacetMap,
): FacetResult {
  return useMemo(
    () => ({
      count: applyFilters(rows, filters, ctx, variants).length,
      brands: brandFacets(rows, filters, ctx, variants),
      colors: colorFacets(rows, filters, ctx, variants),
      sizes: sizeFacets(rows, filters, ctx, variants),
    }),
    [rows, filters, ctx, variants],
  );
}
