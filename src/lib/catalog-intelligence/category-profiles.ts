/**
 * Category Attribute Profiles — the source of truth for what a "complete"
 * listing looks like per category. Data-driven so every category evolves
 * independently without changing engine code.
 *
 * Keys are normalized (lowercase, no spaces) so admin categories like
 * "Smart Watches" and "smartwatches" collapse to the same profile.
 */

export type AttributeProfile = {
  /** Canonical category slug this profile applies to. */
  category: string;
  /** Display label. */
  label: string;
  /** Attributes considered required for marketplace-standard listings. */
  required: string[];
  /** Attributes that enrich the listing but are not required. */
  optional: string[];
  /**
   * Pairs of attribute keys that must be internally consistent.
   * The consistency checker only flags obvious duplicates today
   * (e.g. two RAM values). Domain rules live in the module.
   */
  consistencyPairs?: [string, string][];
};

const P = (
  category: string,
  label: string,
  required: string[],
  optional: string[] = [],
): AttributeProfile => ({ category, label, required, optional });

/** Built-in profiles. Extend freely; no engine code needs to change. */
export const CATEGORY_PROFILES: AttributeProfile[] = [
  P("watches", "Watches",
    ["Brand", "Movement", "Water Resistance", "Strap Material", "Case Diameter"],
    ["Warranty", "Glass Type", "Power Reserve", "Dial Colour"],
  ),
  P("phones", "Phones",
    ["Brand", "RAM", "Storage", "Battery", "Screen Size", "Operating System"],
    ["Camera", "Refresh Rate", "Weight", "Colour"],
  ),
  P("laptops", "Laptops",
    ["Brand", "Processor", "RAM", "Storage", "Screen Size", "Operating System"],
    ["Graphics", "Battery Life", "Weight", "Ports"],
  ),
  P("headphones", "Headphones",
    ["Brand", "Type", "Connectivity", "Battery Life", "Noise Cancellation"],
    ["Driver Size", "Weight", "Warranty"],
  ),
  P("shoes", "Shoes",
    ["Brand", "Gender", "Size", "Material", "Sole"],
    ["Colour", "Closure", "Occasion"],
  ),
  P("apparel", "Apparel",
    ["Brand", "Gender", "Size", "Material", "Fit"],
    ["Colour", "Pattern", "Care Instructions"],
  ),
  P("bags", "Bags",
    ["Brand", "Material", "Dimensions", "Capacity"],
    ["Colour", "Closure", "Warranty"],
  ),
  P("beauty", "Beauty",
    ["Brand", "Type", "Skin Type", "Volume", "Ingredients"],
    ["Fragrance", "Shelf Life"],
  ),
  P("home", "Home & Kitchen",
    ["Brand", "Material", "Dimensions", "Weight"],
    ["Colour", "Warranty", "Care Instructions"],
  ),
];

/** Fallback profile when no category-specific one exists. */
export const GENERIC_PROFILE: AttributeProfile = {
  category: "*",
  label: "General",
  required: ["Brand", "Colour", "Material"],
  optional: ["Warranty", "Weight", "Dimensions"],
};

function normalize(v: string | null | undefined): string {
  return (v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Resolve the profile for a given category slug/label. */
export function profileFor(category?: string | null): AttributeProfile {
  const n = normalize(category);
  if (!n) return GENERIC_PROFILE;
  return (
    CATEGORY_PROFILES.find((p) => normalize(p.category) === n || n.includes(normalize(p.category))) ??
    GENERIC_PROFILE
  );
}

/** Case/space-insensitive lookup of an attribute value on a bag. */
export function readAttr(bag: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!bag) return null;
  const target = normalize(key);
  for (const [k, v] of Object.entries(bag)) {
    if (normalize(k) === target) return v == null ? null : String(v).trim() || null;
  }
  return null;
}
