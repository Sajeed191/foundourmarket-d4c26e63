/**
 * Image Intelligence Engine v3 — client-safe types & category rules.
 *
 * SAFETY CONTRACT
 * ─────────────────────────────────────────────────────────────────────────
 * 1. The original upload is IMMUTABLE. Nothing in this pipeline overwrites it.
 * 2. Every AI action is EXPLAINABLE — every recommendation carries `reason`
 *    strings the admin can read in plain language.
 * 3. Every AI action is REVERSIBLE — normalized derivatives (Turn 2+) live
 *    in `product_images.optimized_url`; clearing that field restores the
 *    original everywhere the site reads via `getDisplayImage()`.
 * 4. Publishing is NEVER blocked by an AI failure. Analyze errors degrade
 *    gracefully to `status='failed'` and a green pass-through recommendation.
 * 5. AI can be disabled globally (mode='off') or per-upload (skipAi flag).
 *
 * The AI may ONLY reason about presentation (canvas, padding, background,
 * alignment). It MUST NOT alter the product itself (size, colors, logos,
 * text, textures, materials, dial detail, stitching, jewelry facets).
 */

export type IntelligenceMode =
  | "off"                 // engine disabled — no analysis at all
  | "analyze_only"        // compute metrics, no recommendation surfaced
  | "analyze_recommend"   // compute + show single recommendation (default)
  | "analyze_normalize";  // Turn 2+: also produce optimized derivative

export type TrafficLight = "green" | "blue" | "amber" | "red";

export type BackgroundKind =
  | "white"
  | "transparent"
  | "solid"
  | "gradient"
  | "lifestyle"
  | "textured"
  | "busy"
  | "unknown";

export type CategoryFramingKey =
  | "watch"
  | "jewelry"
  | "shoes"
  | "fashion"
  | "furniture"
  | "kitchen"
  | "electronics"
  | "beauty"
  | "default";

/** Per-category target framing envelope (occupancy is product-area / canvas-area). */
export type CategoryFraming = {
  key: CategoryFramingKey;
  label: string;
  occupancyMin: number;
  occupancyMax: number;
  minResolution: number;
  allowLifestyle: boolean;
  note: string;
};

export const CATEGORY_FRAMING: Record<CategoryFramingKey, CategoryFraming> = {
  watch:       { key: "watch",       label: "Watches",     occupancyMin: 0.78, occupancyMax: 0.92, minResolution: 1000, allowLifestyle: false, note: "Large product, minimal padding — the dial is the hero." },
  jewelry:     { key: "jewelry",     label: "Jewelry",     occupancyMin: 0.60, occupancyMax: 0.80, minResolution: 1200, allowLifestyle: false, note: "Centered, macro-clean background, generous margin for facet detail." },
  shoes:       { key: "shoes",       label: "Shoes",       occupancyMin: 0.65, occupancyMax: 0.82, minResolution: 1000, allowLifestyle: true,  note: "More breathing room on all sides for sole visibility." },
  fashion:     { key: "fashion",     label: "Fashion",     occupancyMin: 0.55, occupancyMax: 0.85, minResolution: 900,  allowLifestyle: true,  note: "Model shots welcome — do not treat the model as background." },
  furniture:   { key: "furniture",   label: "Furniture",   occupancyMin: 0.55, occupancyMax: 0.78, minResolution: 1200, allowLifestyle: true,  note: "Wide canvas — furniture reads best with room context." },
  kitchen:     { key: "kitchen",     label: "Kitchen",     occupancyMin: 0.60, occupancyMax: 0.85, minResolution: 900,  allowLifestyle: false, note: "Preserve every accessory — never crop out secondary pieces." },
  electronics: { key: "electronics", label: "Electronics", occupancyMin: 0.65, occupancyMax: 0.85, minResolution: 1000, allowLifestyle: false, note: "Clean studio background, front-facing hero." },
  beauty:      { key: "beauty",      label: "Beauty",      occupancyMin: 0.55, occupancyMax: 0.78, minResolution: 900,  allowLifestyle: false, note: "Product label must stay readable — never rotate to hide text." },
  default:     { key: "default",     label: "General",     occupancyMin: 0.70, occupancyMax: 0.85, minResolution: 800,  allowLifestyle: true,  note: "Balanced framing suitable for most product types." },
};




export function resolveCategoryFraming(categorySlug?: string | null): CategoryFraming {
  if (!categorySlug) return CATEGORY_FRAMING.default;
  const slug = categorySlug.toLowerCase();
  const map: Array<[RegExp, CategoryFramingKey]> = [
    [/watch|smartwatch|timepiece/, "watch"],
    [/jewel|ring|necklace|earring|bracelet/, "jewelry"],
    [/shoe|sneaker|boot|footwear/, "shoes"],
    [/fashion|apparel|cloth|shirt|dress|pant|jacket/, "fashion"],
    [/furniture|sofa|chair|desk|table|bed/, "furniture"],
    [/kitchen|cook|appliance/, "kitchen"],
    [/electron|phone|laptop|gadget|audio|headphone|speaker/, "electronics"],
    [/beauty|skin|cosmetic|makeup|fragrance/, "beauty"],
  ];
  for (const [rx, key] of map) if (rx.test(slug)) return CATEGORY_FRAMING[key];
  return CATEGORY_FRAMING.default;
}

// ─────────────────────────────────────────────────────────────────────────
// Analysis payload
// ─────────────────────────────────────────────────────────────────────────

export const INTELLIGENCE_VERSION = 1;

export type PixelDepth = "header-only" | "pixel-sampled" | "full";

export type ImageIntelligence = {
  version: number;
  depth: PixelDepth;

  // Deterministic header signals (always populated on success)
  width: number;
  height: number;
  aspectRatio: number;          // w / h
  orientation: "portrait" | "landscape" | "square";
  format: "jpeg" | "png" | "webp" | "gif" | "avif" | "other";
  fileWeightKb: number | null;
  hasAlpha: boolean;

  // Pixel-derived signals (nullable when depth === 'header-only')
  occupancy: number | null;        // 0..1 estimated product area
  centeringOffset: number | null;  // 0..1 (0 = perfect center)
  emptyMargin: {
    top: number; right: number; bottom: number; left: number;
  } | null;
  background: BackgroundKind;
  backgroundConfidence: number;    // 0..1
  brightness: number | null;       // 0..1
  contrast: number | null;         // 0..1
  sharpness: number | null;        // 0..1 (Laplacian variance proxy)

  // Category-aware target framing snapshot
  category: CategoryFramingKey;
  targetOccupancyMin: number;
  targetOccupancyMax: number;

  // Composite quality score (0..100) and traffic-light band
  qualityScore: number;
  band: TrafficLight;
};

export type RecommendationAction =
  | "none"
  | "expand_background"
  | "increase_padding"
  | "recenter"
  | "upscale"
  | "increase_resolution"
  | "reduce_clutter"
  | "brighten"
  | "swap_hero";

/** Single explainable recommendation surfaced to the admin. */
export type ImageRecommendation = {
  band: TrafficLight;
  headline: string;             // one plain-language sentence
  action: RecommendationAction; // machine-readable next step
  reasons: string[];            // 1–3 short chips for "View details"
  reversible: true;             // safety contract — always true
  aiTouchesProduct: false;      // safety contract — always false
};

// ─────────────────────────────────────────────────────────────────────────
// Composite scoring & recommendation
// ─────────────────────────────────────────────────────────────────────────

export function scoreIntelligence(i: Omit<ImageIntelligence, "qualityScore" | "band">): {
  qualityScore: number;
  band: TrafficLight;
} {
  let score = 100;
  const px = i.width * i.height;

  // Resolution — dominant factor
  if (i.width < i.targetOccupancyMin * 0 + 600 || px < 600 * 600) score -= 35;
  else if (Math.min(i.width, i.height) < 800) score -= 18;
  else if (Math.min(i.width, i.height) < 1000) score -= 8;

  // Aspect — square/portrait preferred for PDP
  if (i.orientation === "landscape" && i.aspectRatio > 1.9) score -= 12;

  // Occupancy (only when pixel-sampled)
  if (i.occupancy !== null) {
    if (i.occupancy < i.targetOccupancyMin - 0.15) score -= 20;
    else if (i.occupancy < i.targetOccupancyMin) score -= 8;
    else if (i.occupancy > i.targetOccupancyMax + 0.10) score -= 10;
  }

  // Centering
  if (i.centeringOffset !== null && i.centeringOffset > 0.15) score -= 8;

  // Sharpness
  if (i.sharpness !== null && i.sharpness < 0.25) score -= 15;
  else if (i.sharpness !== null && i.sharpness < 0.4) score -= 6;

  // Background clarity
  if (i.background === "busy") score -= 10;

  // File weight — very small files are typically low quality thumbs
  if (i.fileWeightKb !== null && i.fileWeightKb < 30 && px > 400 * 400) score -= 8;

  score = Math.max(0, Math.min(100, Math.round(score)));
  const band: TrafficLight =
    score >= 85 ? "green" :
    score >= 70 ? "blue"  :
    score >= 50 ? "amber" : "red";
  return { qualityScore: score, band };
}

/** Pick ONE recommendation — never a list. Admin sees exactly this. */
export function recommendOne(i: ImageIntelligence): ImageRecommendation {
  const base = { reversible: true as const, aiTouchesProduct: false as const };

  if (i.band === "green") {
    return { ...base, band: "green",
      headline: "Image looks excellent.",
      action: "none",
      reasons: ["Sharp, well-framed, on-brand for the catalog."] };
  }

  // Prioritized issue order — surface the single highest-leverage fix.
  if (Math.min(i.width, i.height) < 800) {
    return { ...base, band: i.band,
      headline: "Upload a higher-resolution version for a sharper gallery.",
      action: "increase_resolution",
      reasons: [`Current ${i.width}×${i.height}px is below the ${i.targetOccupancyMin > 0 ? "1000px" : "800px"} minimum.`] };
  }
  if (i.sharpness !== null && i.sharpness < 0.3) {
    return { ...base, band: i.band,
      headline: "This image looks soft — a sharper source will convert better.",
      action: "increase_resolution",
      reasons: ["Low edge detail detected.", "Softness reduces perceived quality on PDP."] };
  }
  if (i.occupancy !== null && i.occupancy < i.targetOccupancyMin - 0.1) {
    return { ...base, band: i.band,
      headline: "Product looks small — tighten the frame for a more premium feel.",
      action: "increase_padding",
      reasons: [`Product fills ~${Math.round(i.occupancy * 100)}% of the canvas.`,
                `Target is ${Math.round(i.targetOccupancyMin * 100)}–${Math.round(i.targetOccupancyMax * 100)}%.`] };
  }
  if (i.occupancy !== null && i.occupancy > i.targetOccupancyMax + 0.05) {
    return { ...base, band: i.band,
      headline: "Increase background padding around the product for a more consistent gallery.",
      action: "expand_background",
      reasons: [`Product fills ~${Math.round(i.occupancy * 100)}% — a little breathing room helps.`] };
  }
  if (i.centeringOffset !== null && i.centeringOffset > 0.15) {
    return { ...base, band: i.band,
      headline: "Recenter the product for visual consistency across the gallery.",
      action: "recenter",
      reasons: ["Product sits off-center relative to canvas."] };
  }
  if (i.background === "busy") {
    return { ...base, band: i.band,
      headline: "A calmer background will let the product stand out.",
      action: "reduce_clutter",
      reasons: ["Busy background detected.", "Simpler settings score higher on PDP."] };
  }

  return { ...base, band: i.band,
    headline: "Minor improvements possible — see details.",
    action: "none",
    reasons: ["No blocking issues detected."] };
}
