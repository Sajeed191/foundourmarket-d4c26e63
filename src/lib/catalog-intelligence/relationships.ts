/**
 * Product Relationship Engine.
 *
 * Instead of only flagging duplicates, we classify *how* two products relate:
 * exact duplicate, a new colour/size/storage variant, a bundle, an accessory,
 * a successor/replacement model, or a cross/up-sell. Deterministic — every
 * decision derives from the real duplicate signals plus axis detection over the
 * two titles/attributes, and carries an explainable reason list.
 */
import { normalizeText, tokenize } from "@/lib/duplicate-detection";
import type { DetectionProduct, DraftProduct, DupMatch } from "@/lib/duplicate-detection";
import type { CatalogMatch, Relationship, RelationshipKind } from "./types";

const COLORS = new Set([
  "black", "white", "silver", "gold", "grey", "gray", "blue", "red", "green",
  "pink", "purple", "yellow", "orange", "brown", "beige", "rose", "graphite",
  "midnight", "starlight", "titanium", "navy", "teal", "cyan", "magenta",
  "bronze", "copper", "lavender", "mint", "ivory", "charcoal", "champagne",
]);

const SIZES = new Set([
  "xs", "s", "m", "l", "xl", "xxl", "xxxl", "small", "medium", "large",
  "2xl", "3xl", "4xl", "us", "uk", "eu",
]);

const ACCESSORY_WORDS = new Set([
  "case", "cover", "charger", "cable", "adapter", "screen", "protector",
  "strap", "band", "mount", "stand", "holder", "sleeve", "pouch", "skin",
  "dock", "grip", "lens", "filter", "tripod", "bag", "kit", "replacement",
]);

const BUNDLE_WORDS = new Set(["bundle", "combo", "pack", "set", "kit", "bundled"]);

const STORAGE_RE = /\b(\d+)\s?(gb|tb|mb)\b/i;
const NUM_MODEL_RE = /\b(\d{1,4})\b/;

/**
 * Structured attribute/spec keys that carry *deterministic* compatibility
 * meaning. When two products share a normalized value on any of these keys
 * we can safely emit a `compatible` edge — no title heuristics, no
 * co-purchase inference, no embeddings.
 *
 * Grouped by domain so the reason string can name the shared standard
 * (e.g. "Shared connector: USB-C" rather than a generic "attribute match").
 */
const COMPAT_KEY_GROUPS: Array<{ label: string; keys: string[] }> = [
  { label: "connector", keys: ["connector", "connector_type", "interface", "port", "port_type", "cable_type"] },
  { label: "mount", keys: ["mount", "lens_mount", "camera_mount", "tripod_mount"] },
  { label: "lug width", keys: ["lug_width", "band_width", "strap_width"] },
  { label: "battery", keys: ["battery_type", "battery_model", "battery_size"] },
  { label: "ecosystem", keys: ["ecosystem", "platform", "operating_system", "os"] },
  { label: "socket", keys: ["socket", "cpu_socket", "chipset"] },
  { label: "form factor", keys: ["form_factor", "memory_type", "ram_type", "drive_interface"] },
];

/**
 * Attribute/spec keys whose value is an *explicit* compatibility list —
 * "compatible with iPhone 15", "fits Galaxy Watch 44mm", supported device
 * lists, etc. Highest-confidence compatibility signal.
 */
const EXPLICIT_COMPAT_KEYS = [
  "compatible_with",
  "compatibility",
  "fits",
  "fits_with",
  "supported_devices",
  "supported_models",
  "works_with",
  "designed_for",
];

function tokenSet(s: string | null | undefined): Set<string> {
  return new Set(tokenize(s));
}

/** Case-insensitive key lookup across attributes + specifications. */
function readAttr(
  p: { attributes?: Record<string, string> | null; specifications?: Record<string, string> | null },
  key: string,
): string | null {
  const target = key.toLowerCase().replace(/[\s_-]+/g, "");
  for (const bag of [p.attributes ?? {}, p.specifications ?? {}]) {
    for (const [k, v] of Object.entries(bag)) {
      if (k.toLowerCase().replace(/[\s_-]+/g, "") === target && v) return String(v);
    }
  }
  return null;
}

/**
 * Compatibility detector — pure structured evidence. Returns the reason
 * string when the pair is compatible, `null` otherwise.
 *
 * Priority (highest confidence first):
 *   1. Explicit compatibility metadata (compatible_with / fits / supported_devices)
 *      shares a token with the other product's name or model.
 *   2. Both products expose the same normalized value on a compatibility key
 *      (connector, mount, lug width, battery, ecosystem, socket, form factor).
 */
function detectCompatibility(
  draft: DraftProduct,
  candidate: DetectionProduct,
): { reason: string; confidence: number } | null {
  // 1. Explicit compatibility metadata — highest confidence.
  const candTokens = tokenSet(candidate.name);
  const candModel = candidate.name?.match(NUM_MODEL_RE)?.[0]?.toLowerCase();
  for (const key of EXPLICIT_COMPAT_KEYS) {
    const raw = readAttr(draft, key);
    if (!raw) continue;
    const listed = tokenize(raw);
    const brandHit = candidate.brand && listed.includes(normalizeText(candidate.brand));
    const nameHit = listed.some((t) => candTokens.has(t) && t.length > 2);
    const modelHit = candModel && listed.includes(candModel);
    if (brandHit || nameHit || modelHit) {
      return { reason: `Explicit compatibility: "${raw}"`, confidence: 90 };
    }
  }
  // Reverse direction — candidate declares compatibility with draft.
  const draftTokens = tokenSet(draft.name);
  const draftModel = draft.name?.match(NUM_MODEL_RE)?.[0]?.toLowerCase();
  for (const key of EXPLICIT_COMPAT_KEYS) {
    const raw = readAttr(candidate, key);
    if (!raw) continue;
    const listed = tokenize(raw);
    const brandHit = draft.brand && listed.includes(normalizeText(draft.brand));
    const nameHit = listed.some((t) => draftTokens.has(t) && t.length > 2);
    const modelHit = draftModel && listed.includes(draftModel);
    if (brandHit || nameHit || modelHit) {
      return { reason: `Explicit compatibility: "${raw}"`, confidence: 90 };
    }
  }

  // 2. Shared normalized compatibility attribute (e.g. connector = USB-C).
  for (const group of COMPAT_KEY_GROUPS) {
    for (const key of group.keys) {
      const dv = readAttr(draft, key);
      const cv = readAttr(candidate, key);
      if (!dv || !cv) continue;
      if (normalizeText(dv) === normalizeText(cv)) {
        return { reason: `Shared ${group.label}: ${dv}`, confidence: 75 };
      }
    }
  }
  return null;
}

/** Values in a set that the other set does not contain. */
function difference(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((t) => !b.has(t));
}

function detectAxis(
  draft: DraftProduct,
  candidate: DetectionProduct,
): { kind: RelationshipKind; value?: string } | null {
  const dTokens = tokenSet(draft.name);
  const cTokens = tokenSet(candidate.name);
  const draftAttrs = new Set(Object.values(draft.attributes ?? {}).map((v) => normalizeText(v)));
  const candAttrs = new Set(Object.values(candidate.attributes ?? {}).map((v) => normalizeText(v)));

  // Storage axis (256GB vs 512GB, etc.)
  const dStorage = draft.name?.match(STORAGE_RE)?.[0];
  const cStorage = candidate.name?.match(STORAGE_RE)?.[0];
  if (dStorage && cStorage && dStorage.toLowerCase() !== cStorage.toLowerCase()) {
    return { kind: "variant_storage", value: dStorage.toUpperCase() };
  }

  const diff = [...difference(dTokens, cTokens), ...difference(draftAttrs, candAttrs)];

  const color = diff.find((t) => COLORS.has(t));
  if (color) return { kind: "variant_color", value: capitalize(color) };

  const size = diff.find((t) => SIZES.has(t));
  if (size) return { kind: "variant_size", value: size.toUpperCase() };

  // Any short differing token when the rest matches → generic variant axis.
  if (diff.length > 0 && diff.length <= 2) {
    return { kind: "variant_other", value: diff[0] };
  }
  return null;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Extract a trailing model number from a title (e.g. "iPhone 15" → 15). */
function modelNumber(name: string | null | undefined): number | null {
  const m = name?.match(NUM_MODEL_RE);
  return m ? Number(m[1]) : null;
}

/**
 * Classify the relationship between the draft and a matched candidate using the
 * already-computed duplicate signals plus axis/keyword analysis.
 */
export function classifyRelationship(draft: DraftProduct, match: DupMatch): Relationship {
  const candidate = match.product;
  const signals = match.signals;
  const sig = (k: string) => signals.find((s) => s.key === k);
  const reasons = signals.filter((s) => s.matched).map((s) => s.reason);

  const barcodeExact = sig("barcode")?.matched && (sig("barcode")?.similarity ?? 0) >= 1;
  const strongProduct = match.score >= 70;

  // 1. Exact duplicate — same barcode, or overwhelming multi-signal match.
  if (barcodeExact || match.score >= 97) {
    return {
      kind: "exact_duplicate",
      confidence: match.score,
      message: "This appears to be the same product already in your catalog.",
      reasons: reasons.length ? reasons : ["Very high overall similarity"],
    };
  }

  // 2. Variant of the same product (colour / size / storage / other).
  if (strongProduct) {
    const axis = detectAxis(draft, candidate);
    if (axis) {
      const label: Record<string, string> = {
        variant_color: `This appears to be a new colour variant${axis.value ? ` (${axis.value})` : ""}.`,
        variant_size: `This looks like a different size${axis.value ? ` (${axis.value})` : ""}.`,
        variant_storage: `This is likely the ${axis.value ?? "different storage"} version.`,
        variant_other: `This looks like a variant of an existing product${axis.value ? ` (${axis.value})` : ""}.`,
      };
      return {
        kind: axis.kind,
        confidence: Math.min(95, match.score),
        message: label[axis.kind],
        reasons: [...reasons, "Core product matches; one attribute differs"],
        axisValue: axis.value,
      };
    }
  }

  const dTokens = tokenSet(draft.name);
  const cTokens = tokenSet(candidate.name);

  // 3. Bundle.
  if ([...dTokens].some((t) => BUNDLE_WORDS.has(t)) && match.score >= 40) {
    return {
      kind: "bundle",
      confidence: match.score,
      message: "This looks like a bundle that includes an existing product.",
      reasons: [...reasons, "Title indicates a bundle/combo"],
    };
  }

  // 4. Accessory / compatible.
  const draftIsAccessory = [...dTokens].some((t) => ACCESSORY_WORDS.has(t));
  const candIsAccessory = [...cTokens].some((t) => ACCESSORY_WORDS.has(t));
  const shareBrand = sig("brand")?.matched;
  if (draftIsAccessory && !candIsAccessory && (shareBrand || match.score >= 35)) {
    return {
      kind: "accessory",
      confidence: Math.max(40, match.score),
      message: `This is likely an accessory for "${candidate.name}".`,
      reasons: [...reasons, "Title indicates an accessory"],
    };
  }

  // 5. Successor / replacement model (same series, higher model number).
  if (shareBrand && match.score >= 45) {
    const dm = modelNumber(draft.name);
    const cm = modelNumber(candidate.name);
    if (dm != null && cm != null && dm !== cm) {
      return dm > cm
        ? {
            kind: "successor",
            confidence: match.score,
            message: `This looks like a newer model of "${candidate.name}".`,
            reasons: [...reasons, `Model number ${dm} > ${cm}`],
          }
        : {
            kind: "replacement",
            confidence: match.score,
            message: `This looks like an earlier model related to "${candidate.name}".`,
            reasons: [...reasons, `Model number ${dm} < ${cm}`],
          };
    }
  }

  // 6. Up-sell vs cross-sell for moderate similarity.
  const dp = draft.priceInr ?? draft.priceUsd ?? 0;
  const cp = candidate.priceInr ?? candidate.priceUsd ?? 0;
  if (sig("category")?.matched && match.score >= 30) {
    if (dp > cp * 1.2 && cp > 0) {
      return {
        kind: "upsell",
        confidence: match.score,
        message: `A higher-tier alternative to "${candidate.name}".`,
        reasons: [...reasons, "Same category, higher price"],
      };
    }
    return {
      kind: "cross_sell",
      confidence: match.score,
      message: `Frequently related to "${candidate.name}".`,
      reasons: [...reasons, "Same category, related product"],
    };
  }

  return {
    kind: "related",
    confidence: match.score,
    message: `Related to "${candidate.name}".`,
    reasons: reasons.length ? reasons : ["Some overlapping signals"],
  };
}

/** Enrich a list of duplicate matches with relationship classifications. */
export function classifyMatches(draft: DraftProduct, matches: DupMatch[]): CatalogMatch[] {
  return matches.map((m) => ({ ...m, relationship: classifyRelationship(draft, m) }));
}

export const RELATIONSHIP_LABEL: Record<RelationshipKind, string> = {
  exact_duplicate: "Exact Duplicate",
  variant_color: "Colour Variant",
  variant_size: "Size Variant",
  variant_storage: "Storage Variant",
  variant_other: "Variant",
  bundle: "Bundle",
  accessory: "Accessory",
  replacement: "Earlier Model",
  successor: "Newer Model",
  compatible: "Compatible",
  upsell: "Upsell",
  cross_sell: "Cross-sell",
  related: "Related",
};

/** Relationship kinds that should be treated as real duplicate risk. */
export function isDuplicateRisk(kind: RelationshipKind): boolean {
  return kind === "exact_duplicate";
}
