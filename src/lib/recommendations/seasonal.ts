import type { Product } from "@/lib/products";

/**
 * Seasonal Intelligence — deterministic date → active-season resolver.
 *
 * No hardcoded product IDs and no admin upkeep: each season maps to category
 * and keyword hints, and any product whose category / tags / name match those
 * hints earns a seasonal boost. Islamic (Ramadan / Eid) dates shift ~11 days
 * earlier each year, so they use a small lookup table; everything else is a
 * fixed Gregorian window. Pure and deterministic given a date.
 */

export type Season = {
  key: string;
  label: string;
  /** Category / collection substrings that fit this season. */
  categories: string[];
  /** Product name / tag keywords that fit this season. */
  keywords: string[];
  /** Boost strength multiplier (0–1) applied to the seasonal weight. */
  strength: number;
};

const SEASONS: Record<string, Omit<Season, "key">> = {
  ramadan: {
    label: "Ramadan",
    categories: ["home", "kitchen", "grocery", "fashion", "decor", "lighting"],
    keywords: ["dates", "prayer", "lantern", "abaya", "kaftan", "iftar", "dinner set", "gift"],
    strength: 1,
  },
  eid: {
    label: "Eid",
    categories: ["fashion", "jewelry", "perfume", "gifts", "watches", "decor"],
    keywords: ["gift", "perfume", "attar", "eid", "festive", "premium"],
    strength: 1,
  },
  diwali: {
    label: "Diwali",
    categories: ["home", "decor", "lighting", "electronics", "jewelry", "gifts", "kitchen"],
    keywords: ["diya", "light", "lamp", "rangoli", "sweets", "gift", "festive"],
    strength: 1,
  },
  christmas: {
    label: "Christmas",
    categories: ["gifts", "toys", "electronics", "home", "decor", "fashion", "lighting"],
    keywords: ["gift", "santa", "christmas", "holiday", "tree", "ornament", "festive", "winter"],
    strength: 1,
  },
  back_to_school: {
    label: "Back to School",
    categories: ["stationery", "electronics", "bags", "computers", "office", "books"],
    keywords: ["backpack", "laptop", "notebook", "pen", "school", "student", "desk", "study"],
    strength: 0.9,
  },
  summer: {
    label: "Summer",
    categories: ["fashion", "outdoor", "sports", "beauty", "appliances", "home"],
    keywords: ["summer", "beach", "swim", "sunglasses", "fan", "cooler", "sandals", "shorts"],
    strength: 0.7,
  },
  winter: {
    label: "Winter",
    categories: ["fashion", "home", "appliances", "beauty", "outdoor"],
    keywords: ["winter", "jacket", "heater", "wool", "sweater", "blanket", "boots", "coat"],
    strength: 0.7,
  },
};

/** Approx Ramadan start (Gregorian) by year; Eid ~= start + 30 days. */
const RAMADAN_START: Record<number, string> = {
  2024: "2024-03-11",
  2025: "2025-03-01",
  2026: "2026-02-18",
  2027: "2027-02-08",
  2028: "2028-01-28",
};

function within(now: Date, startISO: string, days: number): boolean {
  const start = Date.parse(startISO);
  if (!Number.isFinite(start)) return false;
  const t = now.getTime();
  return t >= start && t <= start + days * 86_400_000;
}

/** All seasons active on the given date (usually 0–2). */
export function activeSeasons(now: Date = new Date()): Season[] {
  const out: Season[] = [];
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-based
  const push = (key: string, strength?: number) =>
    out.push({ key, ...SEASONS[key], ...(strength != null ? { strength } : {}) });

  // Islamic calendar (approx lookup).
  const ramadanStart = RAMADAN_START[year];
  if (ramadanStart) {
    if (within(now, ramadanStart, 29)) push("ramadan");
    // Eid al-Fitr window: ~day 29–36 after Ramadan start.
    const eidStart = new Date(Date.parse(ramadanStart) + 29 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    if (within(now, eidStart, 7)) push("eid");
  }

  // Diwali (Oct–Nov, approximate window).
  if ((month === 9 && now.getUTCDate() >= 20) || (month === 10 && now.getUTCDate() <= 15)) {
    push("diwali");
  }
  // Christmas / holiday shopping (Dec 1–26).
  if (month === 11 && now.getUTCDate() <= 26) push("christmas");
  // Back to school (Aug – mid Sep).
  if (month === 7 || (month === 8 && now.getUTCDate() <= 15)) push("back_to_school");
  // Hemispheric-agnostic default: northern-summer / winter windows.
  if (month >= 5 && month <= 7) push("summer");
  if (month === 11 || month <= 1) push("winter");

  return out;
}

function haystack(p: Product): string {
  return [
    p.category,
    ...(p.categories ?? []),
    ...(p.collections ?? []),
    p.name,
    p.productType,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Seasonal relevance for a product in [0, 1] plus the matched season label.
 * Returns 0 when nothing is in season or the product doesn't match.
 */
export function seasonalRelevance(
  p: Product,
  now: Date = new Date(),
): { score: number; label: string | null } {
  const seasons = activeSeasons(now);
  if (seasons.length === 0) return { score: 0, label: null };
  const hay = haystack(p);
  let best = 0;
  let label: string | null = null;
  for (const s of seasons) {
    const catHit = s.categories.some((c) => hay.includes(c));
    const kwHit = s.keywords.some((k) => hay.includes(k));
    if (!catHit && !kwHit) continue;
    const raw = (catHit ? 0.6 : 0) + (kwHit ? 0.5 : 0);
    const val = Math.min(1, raw) * s.strength;
    if (val > best) {
      best = val;
      label = s.label;
    }
  }
  return { score: best, label };
}
