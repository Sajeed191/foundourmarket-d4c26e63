/**
 * Relationship Presentation Adapter — Track A · Phase 3.1
 *
 * PDP equivalent of the frozen Browse Presentation Adapter. Pure composition
 * layer. It NEVER computes relationships, compatibility, or recommendations —
 * it only READS the frozen `RelationshipIntelligence` public contract and
 * translates its buckets into customer-facing sections the PDP can render.
 *
 * Design constraints (permanent):
 *   - Input: a `RelationshipIntelligence` module output + a resolver that
 *     hydrates related `productId`s into full `Product`s (the PDP already has
 *     product lookup; the adapter must not fetch).
 *   - Output: an ordered list of `ProductRelationshipPresentation` sections
 *     using ONLY the frozen relationship kinds.
 *   - Empty sections are omitted so the PDP can just `.map()` and render.
 *   - No AI terminology, no confidence percentages, no module names.
 *   - Deterministic, unit-testable, no I/O.
 *
 * Freeze rule: the OUTPUT SHAPE is a public contract for the PDP surface.
 * Add fields — never break them.
 */
import type { Product } from "@/lib/products";
import type {
  RelationshipIntelligence,
  RelatedProduct,
  RelationshipBuckets,
} from "@/lib/marketplace-intelligence/relationship-intelligence";

/** Customer-facing PDP sections. Order matches the approved PDP layout. */
export type ProductRelationshipSection =
  | "frequently_bought_together"
  | "compatible"
  | "accessories"
  | "bundle"
  | "alternatives"
  | "replacement";

/** Minimal product summary the PDP renders through BrowseCard. */
export type ProductSummary = Product;

export type ProductRelationshipPresentation = {
  section: ProductRelationshipSection;
  /** Short plain-language heading. */
  title: string;
  /** One-sentence explanation shown under the heading. No AI wording. */
  reason: string;
  /** Hydrated products, in the order returned by RelationshipIntelligence. */
  products: ProductSummary[];
  /** Display order — lower renders first. */
  priority: number;
};

/** Resolver contract: PDP passes a lookup that returns a Product or null. */
export type ProductResolver = (productId: string) => Product | null | undefined;

export type RelationshipAdapterInput = {
  intelligence: RelationshipIntelligence | null | undefined;
  resolveProduct: ProductResolver;
  /** Optional seed of "also bought" ids (from RelationshipIntelligence graph
   *  consumers such as the co-purchase edge sets). Presentation only — used
   *  to synthesise the "Frequently Bought Together" section, since RI itself
   *  does not carry co-purchase buckets. Never scored here. */
  frequentlyBoughtTogetherIds?: readonly string[];
  /** Cap per section (defaults to 6). Prevents runaway rails. */
  perSectionLimit?: number;
};

/* ------------------------------------------------------------------ */
/* Section metadata (frozen copy)                                     */
/* ------------------------------------------------------------------ */

type SectionMeta = { title: string; reason: string; priority: number };

const SECTION_META: Record<ProductRelationshipSection, SectionMeta> = {
  frequently_bought_together: {
    title: "Frequently bought together",
    reason: "Often purchased together.",
    priority: 1,
  },
  compatible: {
    title: "Compatible products",
    reason: "Confirmed to work together.",
    priority: 2,
  },
  accessories: {
    title: "Accessories",
    reason: "Works well with this product.",
    priority: 3,
  },
  bundle: {
    title: "Bundles",
    reason: "Often purchased together.",
    priority: 4,
  },
  alternatives: {
    title: "Alternatives",
    reason: "Similar option with different features.",
    priority: 5,
  },
  replacement: {
    title: "Replacement products",
    reason: "Suitable replacement for this product.",
    priority: 6,
  },
};

/* ------------------------------------------------------------------ */
/* Bucket → section mapping                                           */
/* ------------------------------------------------------------------ */

/**
 * Map a RelationshipBuckets key to a customer-facing PDP section.
 * Variants are intentionally NOT surfaced here — variant switching is owned
 * by the PDP variant selector, not the recommendations stack.
 */
const BUCKET_TO_SECTION: Partial<
  Record<keyof RelationshipBuckets, ProductRelationshipSection>
> = {
  accessories: "accessories",
  bundles: "bundle",
  compatible: "compatible",
  replacements: "replacement",
  crossSell: "alternatives",
};

function hydrate(
  items: readonly RelatedProduct[],
  resolve: ProductResolver,
  limit: number,
  seenIds: Set<string>,
): Product[] {
  const out: Product[] = [];
  for (const rel of items) {
    if (out.length >= limit) break;
    if (seenIds.has(rel.productId)) continue;
    const p = resolve(rel.productId);
    if (!p) continue;
    seenIds.add(rel.productId);
    out.push(p);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Public adapter                                                     */
/* ------------------------------------------------------------------ */

/**
 * Translate a RelationshipIntelligence module output (plus optional FBT seed
 * ids from the co-purchase graph) into ordered PDP sections. Sections with
 * zero hydrated products are omitted.
 */
export function buildRelationshipPresentation(
  input: RelationshipAdapterInput,
): ProductRelationshipPresentation[] {
  const {
    intelligence,
    resolveProduct,
    frequentlyBoughtTogetherIds,
    perSectionLimit = 6,
  } = input;

  const sections: ProductRelationshipPresentation[] = [];
  // Track ids already surfaced so the same product never appears twice.
  // The seed product itself should be excluded by the caller via resolveProduct.
  const seen = new Set<string>();

  // 1. Frequently Bought Together — presentation-only synthesis from an
  //    already-computed co-purchase id list. No scoring performed here.
  if (frequentlyBoughtTogetherIds && frequentlyBoughtTogetherIds.length > 0) {
    const products: Product[] = [];
    for (const id of frequentlyBoughtTogetherIds) {
      if (products.length >= perSectionLimit) break;
      if (seen.has(id)) continue;
      const p = resolveProduct(id);
      if (!p) continue;
      seen.add(id);
      products.push(p);
    }
    if (products.length > 0) {
      const meta = SECTION_META.frequently_bought_together;
      sections.push({
        section: "frequently_bought_together",
        title: meta.title,
        reason: meta.reason,
        products,
        priority: meta.priority,
      });
    }
  }

  // 2–6. RelationshipIntelligence-derived buckets.
  if (intelligence) {
    const buckets = intelligence.relationships;
    for (const [bucketKey, section] of Object.entries(BUCKET_TO_SECTION) as Array<
      [keyof RelationshipBuckets, ProductRelationshipSection]
    >) {
      const items = buckets[bucketKey] ?? [];
      if (items.length === 0) continue;
      const products = hydrate(items, resolveProduct, perSectionLimit, seen);
      if (products.length === 0) continue;
      const meta = SECTION_META[section];
      sections.push({
        section,
        title: meta.title,
        reason: meta.reason,
        products,
        priority: meta.priority,
      });
    }
  }

  return sections.sort((a, b) => a.priority - b.priority);
}

/**
 * Convenience — filter a presentation list to a single section. PDP layouts
 * that need to render sections in non-adjacent positions (e.g. FBT above the
 * fold, everything else below) can pluck without re-running the adapter.
 */
export function pickSection(
  sections: readonly ProductRelationshipPresentation[],
  section: ProductRelationshipSection,
): ProductRelationshipPresentation | undefined {
  return sections.find((s) => s.section === section);
}
