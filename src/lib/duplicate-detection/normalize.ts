/**
 * Advanced title / text normalization for duplicate detection.
 *
 * Goal: "Apple iPhone 15 Pro Max", "iPhone15ProMax",
 * "APPLE IPHONE 15 PRO MAX", "iPhone 15 Pro Max Smartphone" all collapse to a
 * nearly-identical token set. Pure functions — no I/O, no randomness.
 */

/** Marketing / filler words stripped before comparison. */
const MARKETING_WORDS = new Set([
  "new", "best", "premium", "original", "genuine", "authentic", "official",
  "sale", "offer", "deal", "hot", "top", "latest", "brand", "official",
  "smartphone", "phone", "device", "product", "item", "combo", "set",
  "edition", "version", "model", "series", "gen", "generation",
  "buy", "online", "free", "shipping", "warranty", "guarantee",
]);

/** Pack / quantity wording. */
const PACK_WORDS = new Set([
  "pack", "packs", "piece", "pieces", "pcs", "pc", "count", "ct",
  "bundle", "kit", "combo", "lot", "dozen", "unit", "units", "qty",
]);

/** Unit words (kept-but-normalized so 500g ~ 500 g). */
const UNIT_WORDS = new Set([
  "g", "kg", "mg", "ml", "l", "ltr", "litre", "liter", "oz", "lb", "lbs",
  "cm", "mm", "m", "inch", "in", "ft", "gb", "tb", "mb", "mp", "mah", "w", "watt",
]);

/** Common English stop words. */
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "for", "with", "of", "to", "in", "on",
  "by", "at", "from", "as", "is", "are", "it", "this", "that", "your", "you",
]);

/**
 * Minimal transliteration / diacritic folding so multilingual and accented
 * input compares against ASCII catalog entries.
 */
function foldDiacritics(s: string): string {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

/** Split a run-together string like "iPhone15ProMax" into tokens. */
function splitCamelAndDigits(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([a-zA-Z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([a-zA-Z])/g, "$1 $2");
}

/** Full normalized string: lowercased, folded, punctuation-free, collapsed. */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return "";
  let s = foldDiacritics(String(input));
  s = splitCamelAndDigits(s);
  s = s.toLowerCase();
  s = s.replace(/[^a-z0-9\s]/g, " "); // strip special chars
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * Token set used for fuzzy title matching: normalized, split, and filtered of
 * marketing / pack / stop words. Units are kept (they are meaningful specs).
 */
export function tokenize(input: string | null | undefined): string[] {
  const norm = normalizeText(input);
  if (!norm) return [];
  return norm
    .split(" ")
    .filter(
      (t) =>
        t.length > 0 &&
        !MARKETING_WORDS.has(t) &&
        !PACK_WORDS.has(t) &&
        !STOP_WORDS.has(t),
    );
}

/** Canonical fingerprint of a title — sorted unique meaningful tokens joined. */
export function titleFingerprint(input: string | null | undefined): string {
  const toks = tokenize(input).filter((t) => !UNIT_WORDS.has(t));
  return Array.from(new Set(toks)).sort().join(" ");
}

/** Normalize a barcode/UPC/EAN/GTIN: digits only. */
export function normalizeCode(input: string | null | undefined): string {
  if (!input) return "";
  return String(input).replace(/\D/g, "");
}

/** Normalize a SKU: alphanumeric uppercase. */
export function normalizeSku(input: string | null | undefined): string {
  if (!input) return "";
  return String(input).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Normalize a spec value for semantic-ish comparison (e.g. "128 GB" ~ "128gb"). */
export function normalizeSpecValue(input: string | null | undefined): string {
  return normalizeText(input).replace(/\s+/g, "");
}

/** Canonicalize a spec key so "RAM"/"ram size"/"memory ram" align loosely. */
export function normalizeSpecKey(input: string | null | undefined): string {
  const map: Record<string, string> = {
    memory: "ram",
    ram: "ram",
    storage: "storage",
    rom: "storage",
    capacity: "capacity",
    weight: "weight",
    color: "color",
    colour: "color",
    dimension: "dimensions",
    dimensions: "dimensions",
    size: "size",
    material: "material",
    model: "model",
    modelnumber: "model",
    voltage: "voltage",
    power: "power",
    gender: "gender",
    fabric: "fabric",
    compatibility: "compatibility",
  };
  const norm = normalizeText(input).replace(/\s+/g, "");
  return map[norm] ?? norm;
}
