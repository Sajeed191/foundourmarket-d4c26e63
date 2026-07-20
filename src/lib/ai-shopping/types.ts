// Public types shared between AI Shopping storage, UI, and the server route.

export type AiRole = "user" | "assistant";

export type AiProductRef = {
  slug: string;
  name: string;
  image: string | null;
  price_inr: number | null;
  compare_price_inr: number | null;
  rating: number | null;
  tagline: string | null;
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
