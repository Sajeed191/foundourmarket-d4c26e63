/**
 * Relationship Intelligence — Marketplace Intelligence 3.0, Module 3.
 *
 * Aggregates existing public signals into a per-product relationship map:
 * variants, bundles, accessories, compatibles, replacements/successors. It
 * NEVER runs its own duplicate detection or image analysis — it consumes only:
 *
 *   - CatalogMatch[] produced by Catalog Intelligence's relationships classifier
 *   - IntelligenceModule outputs (public contract)
 *
 * Intelligence flows upward only. Deterministic, advisory, explainable.
 */
import {
  RELATIONSHIP_LABEL,
  statusFromScore,
  type CatalogMatch,
  type Evidence,
  type IntelligenceModule,
  type PotentialImpact,
  type RelationshipKind,
} from "@/lib/catalog-intelligence";

export type RelatedProduct = {
  productId: string;
  name: string;
  kind: RelationshipKind;
  confidence: number;
  reason: string;
};

export type RelationshipBuckets = {
  variants: RelatedProduct[];
  accessories: RelatedProduct[];
  bundles: RelatedProduct[];
  compatible: RelatedProduct[];
  replacements: RelatedProduct[];
  crossSell: RelatedProduct[];
};

export type RelationshipIntelligence = IntelligenceModule & {
  productId: string;
  relationships: RelationshipBuckets;
  familySize: number;
  isolated: boolean;
};

const VARIANT_KINDS: RelationshipKind[] = [
  "variant_color",
  "variant_size",
  "variant_storage",
  "variant_other",
];

function toRelated(m: CatalogMatch): RelatedProduct {
  return {
    productId: m.product.id ?? m.product.slug,
    name: m.product.name ?? "Untitled product",
    kind: m.relationship.kind,
    confidence: m.relationship.confidence,
    reason: m.relationship.message,
  };
}

function derivePotentialImpact(
  isolated: boolean,
  familySize: number,
): PotentialImpact {
  if (isolated) return "Medium";
  if (familySize >= 3) return "Low";
  return "Low";
}

export function analyzeRelationshipIntelligence(input: {
  productId: string;
  productName?: string;
  matches: CatalogMatch[];
  /** Optional peer modules for confidence blending (public contract only). */
  peerModules?: IntelligenceModule[];
}): RelationshipIntelligence {
  const { productId, productName, matches, peerModules } = input;

  const buckets: RelationshipBuckets = {
    variants: [],
    accessories: [],
    bundles: [],
    compatible: [],
    replacements: [],
    crossSell: [],
  };

  for (const m of matches) {
    const kind = m.relationship.kind;
    const related = toRelated(m);
    if (VARIANT_KINDS.includes(kind)) buckets.variants.push(related);
    else if (kind === "accessory") buckets.accessories.push(related);
    else if (kind === "bundle") buckets.bundles.push(related);
    else if (kind === "compatible") buckets.compatible.push(related);
    else if (kind === "replacement" || kind === "successor") buckets.replacements.push(related);
    else if (kind === "upsell" || kind === "cross_sell") buckets.crossSell.push(related);
    // exact_duplicate is intentionally NOT surfaced here — Catalog Intelligence
    // handles it via the duplicate contract; we don't re-report it as a relation.
  }

  const familySize =
    buckets.variants.length +
    buckets.accessories.length +
    buckets.bundles.length +
    buckets.compatible.length +
    buckets.replacements.length;

  const isolated = familySize === 0;

  // Score: rewards a healthy family, penalises complete isolation.
  //   0 relations → 40, 1 → 60, 2 → 75, 3+ → 90.
  const score = isolated
    ? 40
    : familySize === 1
      ? 60
      : familySize === 2
        ? 75
        : 90;

  // Confidence: blend of avg match confidence + peer module confidence.
  const matchConf = matches.length
    ? Math.round(matches.reduce((a, m) => a + m.relationship.confidence, 0) / matches.length)
    : 0;
  const peerConf = peerModules?.length
    ? Math.round(peerModules.reduce((a, p) => a + p.confidence, 0) / peerModules.length)
    : 0;
  const confidence = peerModules?.length
    ? Math.round(matchConf * 0.5 + peerConf * 0.5)
    : Math.max(50, matchConf);

  const evidence: Evidence[] = [];
  if (isolated) {
    evidence.push({
      key: "isolated_product",
      message: "This product has no detected relationships — it may belong to a variant or accessory family.",
      severity: "warning",
      impact: 25,
    });
  }
  if (buckets.variants.length > 0) {
    evidence.push({
      key: "variant_family",
      message: `${buckets.variants.length} likely variant${buckets.variants.length === 1 ? "" : "s"} detected (${buckets.variants.map((v) => RELATIONSHIP_LABEL[v.kind]).join(", ")}).`,
      severity: "info",
      impact: 0,
    });
  }
  if (buckets.accessories.length > 0) {
    evidence.push({
      key: "accessory_links",
      message: `${buckets.accessories.length} accessory relationship${buckets.accessories.length === 1 ? "" : "s"} available for cross-linking.`,
      severity: "info",
      impact: 0,
    });
  }
  if (buckets.bundles.length > 0) {
    evidence.push({
      key: "bundle_links",
      message: `${buckets.bundles.length} bundle${buckets.bundles.length === 1 ? "" : "s"} reference this product.`,
      severity: "info",
      impact: 0,
    });
  }

  // ONE recommendation: focus on the highest-value link the admin can make.
  let recommendation: string;
  let action: string;
  if (buckets.variants.length > 0) {
    recommendation = `Link ${buckets.variants.length} likely variant${buckets.variants.length === 1 ? "" : "s"} into a single product family.`;
    action = "Group variants";
  } else if (buckets.accessories.length > 0) {
    recommendation = "Link related accessories to boost discovery and AOV.";
    action = "Link accessories";
  } else if (buckets.bundles.length > 0) {
    recommendation = "Feature bundles that include this product.";
    action = "Feature bundles";
  } else if (isolated) {
    recommendation = productName
      ? `"${productName}" has no siblings — consider adding variants or accessories.`
      : "This product has no siblings — consider adding variants or accessories.";
    action = "Add variants";
  } else {
    recommendation = "Relationship graph is healthy — no action needed.";
    action = "Review relationships";
  }

  return {
    moduleId: "relationship_intelligence",
    score,
    confidence,
    status: statusFromScore(score),
    recommendation,
    action,
    potentialImpact: derivePotentialImpact(isolated, familySize),
    evidence,
    productId,
    relationships: buckets,
    familySize,
    isolated,
  };
}
