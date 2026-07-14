/**
 * AI Recommendation — the single "best next action" for the admin.
 *
 * Deterministic and explainable. Given the classified relationship to the top
 * duplicate candidate plus the draft's own health signals, it returns exactly
 * one recommended action with a human-readable WHY. It never mutates data and
 * never blocks publishing — it only advises.
 */
import type { DraftProduct, DupMatch } from "@/lib/duplicate-detection";
import { classifyRelationship, isDuplicateRisk } from "./relationships";
import type { Relationship } from "./types";

export type RecommendedActionKind =
  | "publish"
  | "merge"
  | "create_variant"
  | "update_existing"
  | "link_accessory"
  | "create_bundle"
  | "link_successor"
  | "link_replacement"
  | "review";

export type AiRecommendation = {
  kind: RecommendedActionKind;
  label: string;
  why: string;
  /** Confidence (0–100) driving the recommendation. */
  confidence: number;
  relationship: Relationship | null;
  tone: "safe" | "info" | "warn" | "danger";
};

export function recommendAction(
  draft: DraftProduct,
  topMatch: DupMatch | null,
): AiRecommendation {
  if (!topMatch || topMatch.score < 30) {
    return {
      kind: "publish",
      label: "Safe to Publish",
      why: "No similar product crossed the confidence threshold. This looks like a new listing.",
      confidence: topMatch?.score ?? 0,
      relationship: null,
      tone: "safe",
    };
  }

  const rel = classifyRelationship(draft, topMatch);
  const reasons = topMatch.signals.filter((s) => s.matched).map((s) => s.reason).slice(0, 3).join(", ");
  const name = topMatch.product.name;

  if (isDuplicateRisk(rel.kind) || topMatch.score >= 90) {
    return {
      kind: "merge",
      label: "Merge With Existing",
      why: `This is almost certainly "${name}" already in the catalog (${reasons}). Merge to avoid a duplicate listing.`,
      confidence: topMatch.score,
      relationship: rel,
      tone: "danger",
    };
  }

  if (rel.kind.startsWith("variant")) {
    return {
      kind: "create_variant",
      label: "Convert Into Variant",
      why: `The core product matches "${name}" but one attribute differs (${rel.axisValue ?? "an option"}). Add it as a variant instead of a new product.`,
      confidence: topMatch.score,
      relationship: rel,
      tone: "warn",
    };
  }

  if (rel.kind === "accessory") {
    return {
      kind: "link_accessory",
      label: "Link as Accessory",
      why: `This reads as an accessory for "${name}". Link it so it surfaces on that product page.`,
      confidence: topMatch.score,
      relationship: rel,
      tone: "info",
    };
  }

  if (rel.kind === "bundle") {
    return {
      kind: "create_bundle",
      label: "Create Bundle",
      why: `This bundles an existing product ("${name}"). Set it up as a bundle to keep inventory in sync.`,
      confidence: topMatch.score,
      relationship: rel,
      tone: "info",
    };
  }

  if (rel.kind === "successor") {
    return {
      kind: "link_successor",
      label: "Link as Successor Model",
      why: `This looks like a newer model of "${name}". Link them so shoppers on the old model discover this one.`,
      confidence: topMatch.score,
      relationship: rel,
      tone: "info",
    };
  }

  if (rel.kind === "replacement") {
    return {
      kind: "link_replacement",
      label: "Link as Earlier Model",
      why: `This relates to "${name}" as an earlier model. Link them for cross-navigation.`,
      confidence: topMatch.score,
      relationship: rel,
      tone: "info",
    };
  }

  return {
    kind: "publish",
    label: "Safe to Publish",
    why: `Related to "${name}" (${reasons}) but distinct enough to publish as its own product.`,
    confidence: topMatch.score,
    relationship: rel,
    tone: "safe",
  };
}
