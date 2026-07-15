/**
 * PDP · Relationship Sections — Track A · Phase 3.3
 *
 * Generic renderer for every section emitted by the Relationship Presentation
 * Adapter. The PDP passes in whatever inputs it has (FBT companion ids today,
 * a `RelationshipIntelligence` module later) and this component renders each
 * non-empty section in the adapter's canonical order using BrowseCard.
 *
 * No new intelligence, no per-section forks — the adapter alone decides what
 * appears and in what order.
 */
import { useMemo } from "react";
import { BrowseCard } from "@/components/site/BrowseCard";
import { buildRelationshipPresentation } from "@/lib/pdp";
import type {
  ProductRelationshipSection,
  RelationshipAdapterInput,
} from "@/lib/pdp";
import type { Product } from "@/lib/products";

type Props = {
  /** All products the PDP has hydrated and can surface (e.g. FBT companions). */
  hydratedProducts: readonly Product[];
  /** Companion ids for Frequently Bought Together (already resolved by PDP). */
  frequentlyBoughtTogetherIds?: readonly string[];
  /** Optional RelationshipIntelligence output — enables Compatible, Accessories,
   *  Bundles, Alternatives, Replacements once the frozen intelligence layer
   *  provides one. Not fetched here; the adapter never queries. */
  intelligence?: RelationshipAdapterInput["intelligence"];
  /** Restrict which sections may render (defaults to all six). */
  allowedSections?: readonly ProductRelationshipSection[];
};

const ALL_SECTIONS: readonly ProductRelationshipSection[] = [
  "frequently_bought_together",
  "compatible",
  "accessories",
  "bundle",
  "alternatives",
  "replacement",
];

export function PDPRelationshipSections({
  hydratedProducts,
  frequentlyBoughtTogetherIds,
  intelligence,
  allowedSections = ALL_SECTIONS,
}: Props) {
  const bySlug = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of hydratedProducts) m.set(p.slug, p);
    return m;
  }, [hydratedProducts]);

  const allowed = useMemo(() => new Set(allowedSections), [allowedSections]);

  const sections = useMemo(
    () =>
      buildRelationshipPresentation({
        intelligence: intelligence ?? null,
        resolveProduct: (id) => bySlug.get(id) ?? null,
        frequentlyBoughtTogetherIds,
        perSectionLimit: 6,
      }).filter((s) => allowed.has(s.section)),
    [bySlug, frequentlyBoughtTogetherIds, intelligence, allowed],
  );

  if (sections.length === 0) return null;

  return (
    <div className="space-y-10 sm:space-y-12" data-pdp-relationship-sections>
      {sections.map((s) => (
        <section
          key={s.section}
          aria-labelledby={`pdp-rel-${s.section}`}
          data-pdp-rel-section={s.section}
        >
          <div className="mb-4 sm:mb-5">
            <h2
              id={`pdp-rel-${s.section}`}
              className="text-lg sm:text-xl font-semibold tracking-tight"
            >
              {s.title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{s.reason}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {s.products.map((p, i) => (
              <BrowseCard key={p.slug} product={p} priority={i < 2} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default PDPRelationshipSections;
