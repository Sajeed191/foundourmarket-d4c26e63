// Public types shared between AI Shopping storage, UI, and the server route.

export type AiRole = "user" | "assistant";

// v1.4 Explainable AI — provenance of a recommendation.
export type AiSource =
  | "pdp"
  | "category"
  | "search"
  | "cart"
  | "wishlist"
  | "home"
  | "marketplace";

// v1.4 — confidence is only shown when it maps to real product data.
export type AiConfidence = {
  basis: "specs" | "ratings" | "popularity" | "price";
  label: string; // short, human-readable (e.g. "Based on customer ratings")
};

// v1.4 — per-product explanation attached by the model.
export type AiExplanation = {
  reasons: string[]; // 1-3 short reasons ("Best value under ₹3,000")
  tradeoffs?: { pros?: string[]; cons?: string[] };
  confidence?: AiConfidence;
};

// v1.4 — inline "Compare at a glance" block.
export type AiCompare = {
  title?: string;
  rows: Array<{ slug: string; verdict: string; highlight?: string }>;
};

export type AiProductRef = {
  slug: string;
  name: string;
  image: string | null;
  price_inr: number | null;
  compare_price_inr: number | null;
  rating: number | null;
  tagline: string | null;
  // v1.4 — optional explanation, attached server-side after model call.
  explain?: AiExplanation;
};

export type AiMessage = {
  id: string;
  role: AiRole;
  content: string;
  ts: number;
  // Products the assistant referenced in this reply — rendered as cards.
  products?: AiProductRef[];
  // Contextual follow-up chips generated for this assistant turn.
  suggestions?: string[];
  // v1.4 — provenance for the whole recommendation set.
  source?: AiSource;
  // v1.4 — optional compact comparison block.
  compare?: AiCompare;
  // Optional error state for a failed assistant reply — enables inline retry.
  error?: boolean;
};

export type AiThread = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: AiMessage[];
};

export type AiThreadIndexEntry = {
  id: string;
  title: string;
  updatedAt: number;
};
