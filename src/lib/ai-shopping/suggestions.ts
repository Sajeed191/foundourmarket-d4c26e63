// Heuristic follow-up suggestion generator for the AI Shopping Assistant.
// Runs on the server after the reply is finalized. Deterministic and cheap —
// no extra AI call. v1.3 Step 2: page-context aware chip pools.
import type { AiProductSummary } from "./tools.server";
import type { ShoppingContext } from "./shopping-context";

type Ctx = {
  userText: string;
  reply: string;
  products: AiProductSummary[];
  context?: ShoppingContext | null;
};

function dedupeCap(chips: string[], n: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of chips) {
    const k = c.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
    if (out.length >= n) break;
  }
  return out;
}

function pageChips(context?: ShoppingContext | null): string[] {
  if (!context) return [];
  switch (context.page) {
    case "home":
      return ["Today's best deals", "What's trending?", "New arrivals", "Best sellers"];
    case "product":
      return [
        "Is this worth buying?",
        "Show cheaper alternatives",
        "What accessories go well?",
        "Compare with similar",
      ];
    case "category":
      return ["Best value option", "Premium pick", "Highest rated", "Under ₹3,000"];
    case "search":
      return ["Cheapest here", "Best rated", "Best value", "Show premium options"];
    case "cart":
      return [
        "Any missing accessories?",
        "How can I save money?",
        "Bundle suggestions",
        "Complementary picks",
      ];
    case "wishlist":
      return [
        "Which should I buy first?",
        "Which offers best value?",
        "Which is most popular?",
      ];
    case "order":
    case "orders":
      return ["Talk to Customer Support"];
    default:
      return [];
  }
}

export function generateSuggestions({ userText, reply, products, context }: Ctx): string[] {
  const u = userText.toLowerCase();
  const r = reply.toLowerCase();
  const many = products.length >= 2;
  const single = products.length === 1;

  // Support hand-off — no shopping chips.
  if (/order|refund|return|track|delivery|shipping|account|login|password|payment/.test(u)) {
    return ["Talk to Customer Support"];
  }

  const chips: string[] = [];

  // Page-context chips take priority — they reflect what the customer is
  // actually looking at right now.
  chips.push(...pageChips(context));

  if (many) {
    chips.push("Compare these", "Show cheaper options", "Show premium alternatives");
  } else if (single) {
    chips.push("Compare with alternatives", "Show similar products", "Show cheaper options");
  }

  if (/gift|birthday|anniversary|present/.test(u)) chips.push("More gift ideas");
  if (/budget|under|cheap|affordable/.test(u)) chips.push("Best value picks");
  if (/premium|luxury|best|top/.test(u + r)) chips.push("Best sellers");
  if (/new|latest|arrival/.test(u)) chips.push("New arrivals");
  if (/accessor/.test(u + r)) chips.push("Show accessories");

  // Fallback pool if nothing landed above.
  if (chips.length === 0) {
    chips.push("Best sellers", "New arrivals", "Gift ideas under ₹2,000", "Trending now");
  }

  return dedupeCap(chips, 5);
}
