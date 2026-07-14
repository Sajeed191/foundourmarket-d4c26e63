/**
 * Duplicate Detection — shared types.
 *
 * A dedicated intelligence module inside the Marketplace Intelligence
 * platform. Mirrors the deterministic, explainable-scoring philosophy of the
 * recommendation engine: every signal is measurable, weighted, and carries a
 * human-readable reason. Never blocks the admin — it only informs.
 */

/** Lean product shape read from the base `products` table for detection. */
export type DetectionProduct = {
  id: string | null;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  categories: string[];
  sku: string | null;
  barcode: string | null;
  ean: string | null;
  image: string | null;
  imagePhash: string | null;
  description: string | null;
  specifications: Record<string, string>;
  attributes: Record<string, string>;
  priceInr: number | null;
  priceUsd: number | null;
  rating: number;
  reviews: number;
  soldCount: number;
  ordersCount: number;
  status: string;
  stockQuantity: number;
  variantCount: number;
  createdAt: string;
};

/** The in-progress product the admin is creating/editing. */
export type DraftProduct = {
  slug?: string | null;
  name: string;
  brand?: string | null;
  category?: string | null;
  categories?: string[];
  sku?: string | null;
  barcode?: string | null;
  ean?: string | null;
  image?: string | null;
  /** Perceptual hash of the primary image (computed in-browser). */
  imagePhash?: string | null;
  description?: string | null;
  specifications?: Record<string, string>;
  attributes?: Record<string, string>;
  priceInr?: number | null;
  priceUsd?: number | null;
  /** Variant axis values the admin has added (e.g. colours/sizes). */
  variantKeys?: string[];
};

/** Which detection layer produced a signal. */
export type DupSignalKey =
  | "barcode"
  | "title"
  | "brand"
  | "category"
  | "sku"
  | "variant"
  | "image"
  | "description"
  | "specifications"
  | "price"
  | "attributes"
  | "keywords"
  | "history";

/** One explainable contribution to a duplicate score. */
export type DupSignal = {
  key: DupSignalKey;
  label: string;
  /** 0–1 similarity for this layer. */
  similarity: number;
  /** Relative weight (percentage points of the base blend). */
  weight: number;
  /** True when this layer is a strong/confident match. */
  matched: boolean;
  /** Short reason shown in the panel, e.g. "Same barcode". */
  reason: string;
};

export type DupVerdict =
  | "safe"
  | "similar"
  | "possible"
  | "high"
  | "exact";

/** Quick badges surfaced on a match card. */
export type DupBadge =
  | "EXACT"
  | "SIMILAR"
  | "IMAGE MATCH"
  | "TITLE MATCH"
  | "SPEC MATCH"
  | "BARCODE MATCH"
  | "VARIANT";

export type DupMatch = {
  product: DetectionProduct;
  score: number;
  verdict: DupVerdict;
  signals: DupSignal[];
  badges: DupBadge[];
  /** True when this looks like a new variant of the same product, not a dup. */
  isVariantOfSame: boolean;
  /** Set when the admin previously ignored this exact pair. */
  ignored: boolean;
};

export type DupResult = {
  /** Highest score across all candidates (0–100). */
  topScore: number;
  topVerdict: DupVerdict;
  matches: DupMatch[];
  /** True while candidate data is still loading. */
  loading: boolean;
};

/** Configurable weights for the confidence engine (percentage points). */
export type DupWeights = Record<DupSignalKey, number>;

export const DEFAULT_WEIGHTS: DupWeights = {
  barcode: 100, // exact barcode short-circuits to 100
  title: 25,
  brand: 15,
  category: 10,
  sku: 10,
  variant: 15,
  image: 25,
  description: 10,
  specifications: 20,
  price: 5,
  attributes: 15,
  keywords: 20,
  history: 5,
};

export const VERDICT_LABEL: Record<DupVerdict, string> = {
  safe: "Safe",
  similar: "Similar Product",
  possible: "Possible Duplicate",
  high: "High Confidence Duplicate",
  exact: "Exact Duplicate",
};
