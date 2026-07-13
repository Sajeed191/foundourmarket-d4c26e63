import type { Product } from "@/lib/products";
import { isFresh } from "./scorer";

/**
 * Smart Business Rules — deterministic resolver.
 *
 * Converts admin-defined merchandising rules (boost / reduce / exclude) into
 * the engine's existing additive surfaces: a per-slug `ruleAdjust` delta map
 * and a hard `excludedSlugs` list. Pure over the catalog — no engine rewrite,
 * no scoring internals touched. Rules that target signals not present on a
 * product simply match nothing (safe no-op).
 */

export type RuleKind = "boost" | "reduce" | "exclude";

export type RuleTargetType =
  | "new_arrivals"
  | "high_margin"
  | "fast_shipping"
  | "local_seller"
  | "featured"
  | "sustainable"
  | "low_inventory"
  | "poor_reviews"
  | "high_returns"
  | "slow_delivery"
  | "brand"
  | "category"
  | "product"
  | "seller";

export type BusinessRule = {
  id: string;
  rule_kind: RuleKind;
  target_type: RuleTargetType;
  target_value: string | null;
  weight: number;
  priority: number;
  enabled: boolean;
  starts_at: string | null;
  ends_at: string | null;
};

export type ResolvedRules = {
  ruleAdjust: Map<string, number>;
  excludedSlugs: string[];
  activeCount: number;
};

/** How strongly one unit of rule weight nudges a product's engine score. */
const SCALE = 12;

function isSustainable(p: Product): boolean {
  const hay = [
    ...(p.collections ?? []),
    ...(p.categories ?? []),
    p.category ?? "",
    ...Object.values(p.attributes ?? {}).map(String),
  ]
    .join(" ")
    .toLowerCase();
  return /sustainab|eco[-\s]?friendly|organic|recycl|green/.test(hay);
}

/** Best-effort predicate for a rule target over a product's existing fields. */
function matches(rule: BusinessRule, p: Product): boolean {
  const val = (rule.target_value ?? "").trim().toLowerCase();
  switch (rule.target_type) {
    case "new_arrivals":
      return isFresh(p) || p.newArrival === true;
    case "high_margin":
      // No margin field on the catalog — premium/high-priority stand in.
      return p.premium === true || (p.priorityScore ?? 0) >= 70;
    case "fast_shipping":
      return p.pickupSupported === true || p.fastSelling === true;
    case "featured":
      return p.featured === true || p.staffPick === true || p.editorsChoice === true;
    case "sustainable":
      return isSustainable(p);
    case "low_inventory":
      return p.inStock && p.stockQuantity > 0 && p.stockQuantity <= Math.max(1, p.lowStockThreshold ?? 5);
    case "poor_reviews":
      return (p.reviews ?? 0) >= 3 && (p.rating ?? 5) < 3;
    case "high_returns":
      // Not tracked on the catalog row — no-op unless later precomputed.
      return false;
    case "slow_delivery":
      return p.preorder === true;
    case "local_seller":
      return false; // seller locality not on the catalog row
    case "brand":
      return !!val && (p.brand ?? "").toLowerCase() === val;
    case "category":
      return (
        !!val &&
        ((p.category ?? "").toLowerCase() === val ||
          (p.categories ?? []).some((c) => c.toLowerCase() === val))
      );
    case "product":
      return !!val && p.slug.toLowerCase() === val;
    case "seller":
      return false; // vendor id not present on the catalog row
    default:
      return false;
  }
}

/**
 * Resolve active rules (enabled + within schedule) into engine surfaces.
 * Later, higher-priority rules stack additively; excludes always win.
 */
export function resolveBusinessRules(
  products: Product[],
  rules: BusinessRule[],
  now: number = Date.now(),
): ResolvedRules {
  const ruleAdjust = new Map<string, number>();
  const excluded = new Set<string>();

  const active = rules
    .filter((r) => r.enabled)
    .filter((r) => !r.starts_at || Date.parse(r.starts_at) <= now)
    .filter((r) => !r.ends_at || Date.parse(r.ends_at) >= now)
    .sort((a, b) => a.priority - b.priority);

  for (const rule of active) {
    for (const p of products) {
      if (!matches(rule, p)) continue;
      if (rule.rule_kind === "exclude") {
        excluded.add(p.slug);
        continue;
      }
      const sign = rule.rule_kind === "boost" ? 1 : -1;
      const delta = sign * rule.weight * SCALE;
      ruleAdjust.set(p.slug, (ruleAdjust.get(p.slug) ?? 0) + delta);
    }
  }

  for (const slug of excluded) ruleAdjust.delete(slug);

  return { ruleAdjust, excludedSlugs: [...excluded], activeCount: active.length };
}
