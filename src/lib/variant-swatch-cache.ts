import { fetchVariantFacets, type VariantSummary } from "@/lib/variant-facets";

/**
 * Shared, request-deduplicated cache of per-product variant summaries used by
 * the product-card colour-swatch preview.
 *
 * Design goals (Phase 3B):
 *  - ONE tiny batched query (`product_variants_public`) ever fetches a slug's
 *    colour/stock/price/cover-image summary — never the full gallery.
 *  - Results are memoised forever for the session, so revisiting a surface or
 *    re-rendering a card triggers ZERO additional network requests.
 *  - In-flight requests for the same slug are coalesced (one promise per slug),
 *    so a grid of 40 cards mounting at once issues at most a couple of batched
 *    reads, not 40.
 *  - Colour COVER IMAGES themselves are only ever downloaded by the browser
 *    when a colour is actually previewed (current / prev / next), never here.
 */

const cache = new Map<string, VariantSummary | null>();
const inflight = new Map<string, Promise<void>>();

/** Synchronous cache read — returns undefined when not yet loaded. */
export function getCachedVariantSummary(slug: string): VariantSummary | null | undefined {
  return cache.get(slug);
}

/**
 * Batched, deduplicated load. Fetches only the slugs not already cached or
 * in-flight, in a single `fetchVariantFacets` call, and records every requested
 * slug (including those with no variants) so we never re-request them.
 */
export async function loadVariantSummaries(slugs: string[]): Promise<void> {
  const need = [...new Set(slugs.filter((s) => s && !cache.has(s) && !inflight.has(s)))];
  if (need.length === 0) {
    // Still await any in-flight loads for the requested slugs.
    await Promise.all(slugs.map((s) => inflight.get(s)).filter(Boolean) as Promise<void>[]);
    return;
  }

  const p = (async () => {
    const map = await fetchVariantFacets(need);
    for (const slug of need) cache.set(slug, map.get(slug) ?? null);
  })();

  for (const slug of need) inflight.set(slug, p);
  try {
    await p;
  } finally {
    for (const slug of need) inflight.delete(slug);
  }
}

/**
 * Prime the cache from a facet map already fetched by a surface (e.g. the
 * search route runs `fetchVariantFacets` for its results). This lets those
 * surfaces reuse their existing query with ZERO extra requests.
 */
export function primeVariantSummaries(map: Map<string, VariantSummary>): void {
  for (const [slug, summary] of map) {
    if (!cache.has(slug)) cache.set(slug, summary);
  }
}
