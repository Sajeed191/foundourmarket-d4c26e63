// Heuristic follow-up suggestion generator for the AI Shopping Assistant.
// Runs on the server after the reply is finalized. Deterministic and cheap —
// no extra AI call. Suggestions are shopping-only and context-aware.
import type { AiProductSummary } from "./tools.server";

type Ctx = {
  userText: string;
  reply: string;
  products: AiProductSummary[];
};

function pick<T>(pool: T[], n: number): T[] {
  return pool.slice(0, n);
}

export function generateSuggestions({ userText, reply, products }: Ctx): string[] {
  const u = userText.toLowerCase();
  const r = reply.toLowerCase();
  const many = products.length >= 2;
  const single = products.length === 1;

  // Support hand-off — no shopping chips.
  if (/order|refund|return|track|delivery|shipping|account|login|password|payment/.test(u)) {
    return ["Talk to Customer Support"];
  }

  const chips: string[] = [];

  if (many) {
    chips.push("Compare these");
    chips.push("Show cheaper options");
    chips.push("Show premium alternatives");
    chips.push("Show similar products");
  } else if (single) {
    chips.push("View product details");
    chips.push("Show similar products");
    chips.push("Compare with alternatives");
    chips.push("Show cheaper options");
  }

  if (/gift|birthday|anniversary|present/.test(u)) chips.push("More gift ideas");
  if (/budget|under|cheap|affordable/.test(u)) chips.push("Best value picks");
  if (/premium|luxury|best|top/.test(u + r)) chips.push("Best sellers");
  if (/new|latest|arrival/.test(u)) chips.push("New arrivals");
  if (/accessor/.test(u + r)) chips.push("Show accessories");

  // Fallback pool if nothing landed above.
  if (chips.length === 0) {
    chips.push(
      "Best sellers",
      "New arrivals",
      "Gift ideas under ₹2,000",
      "Trending now",
    );
  }

  // Dedupe, cap at 5.
  const seen = new Set<string>();
  const unique = chips.filter((c) => (seen.has(c) ? false : (seen.add(c), true)));
  return pick(unique, 5);
}
