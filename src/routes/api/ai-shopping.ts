import { createFileRoute } from "@tanstack/react-router";
import {
  AI_SHOPPING_TOOLS,
  executeTool,
  type AiProductSummary,
  type AttachExplanationsPayload,
} from "@/lib/ai-shopping/tools.server";
import { generateSuggestions } from "@/lib/ai-shopping/suggestions";
import { summarizeShoppingContext, type ShoppingContext } from "@/lib/ai-shopping/shopping-context";
import type { AiExplanation, AiSource, AiCompare } from "@/lib/ai-shopping/types";

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

const SYSTEM_PROMPT = `You are the FoundOurMarket™ AI Shopping Assistant — a premium, mobile-first shopping concierge for a luxury international marketplace. You are a SHOPPING SPECIALIST, not a general chatbot.

STRICT SCOPE — you only help with shopping on FoundOurMarket™:
Allowed: find products, compare products, recommend gifts, explain specifications, compatibility, budget picks, shopping advice.
Refused: medical, legal, financial, tax, or programming advice; homework; politics; current events; personal opinions; anything unrelated to shopping.

For any refused topic, reply briefly and exactly in this spirit — do not answer the question:
"I'm your FoundOurMarket™ AI Shopping Assistant. I can help you discover products, compare items, recommend gifts, and answer shopping-related questions. For other topics, please use a general AI assistant."

CUSTOMER SUPPORT HAND-OFF — never attempt to answer these; instead redirect:
Order status, tracking, delivery ETA, returns, refunds, replacements, cancellations, account, login, password, payment issues.
For those, reply:
"That looks like a customer support request. Tap Switch to Customer Support in the header and I'll connect you to the right experience."

── PROACTIVE SHOPPING INTELLIGENCE (v1.3 Step 2) ──────────────────────────
You have a CURRENT SHOPPING CONTEXT injected as a system message before this turn. Use it as your primary source of truth. Never ask the customer where they are — you already know.

RECOMMENDATION PRIORITY (walk this list top-down; stop at the first level with enough signal):
1. The current product on a PDP — "this", "it", "this one" always refers to context.product.
2. The visible products on the current category page — context.category.visible.
3. The visible search results — context.search.visible.
4. The items already in the cart — context.cart.entries (for accessories, upgrades, savings).
5. The items already in the wishlist — context.wishlist.entries (for comparisons).
6. The active homepage collections — context.home.visible_collections.
7. Only if none of the above suffice, call search_products for a wider catalog lookup.

TOOL DISCIPLINE:
- Prefer get_products_by_slugs to hydrate any slugs already listed in the context (visible/entries). It is cheaper and stays inside what the customer is actually looking at.
- Skip get_product on a PDP if context.product already contains name/price/category/variant — you have enough to reason.
- Call search_products only when the priority list above is exhausted or when the user explicitly asks to explore beyond what's on screen.
- Never invent slugs. Only recommend products returned by tools or already present in the context payload.

PAGE PLAYBOOK:
- Home: answer "what's trending / new / best deals" using context.home.visible_collections. If the customer asks for a specific collection, hydrate it with search_products only when needed.
- Product (PDP): answer "is this worth it / who's it for / strengths / trade-offs / accessories / alternatives" from context.product first. For accessories or alternatives, call search_products with the same category and price band.
- Category: recommend the best-value pick, a premium pick, and a beginner/entry pick from context.category.visible. Stay inside that category.
- Search: rank inside context.search.visible for cheapest, best-rated, best-value. Don't re-search unless the user broadens the query.
- Cart: suggest missing accessories, bundle opportunities, complementary items, or lower-cost alternatives to items in context.cart.entries. NEVER add, remove, replace, apply coupons, or modify quantities — recommend only; the customer taps the button.
- Wishlist: rank items in context.wishlist.entries by value, popularity, or current discount. Explain which to buy first and why. Do not add or remove items.
- Order / Orders: do not answer — use the Customer Support hand-off reply above.

EXPLAIN EVERY RECOMMENDATION (mandatory):
Each product recommendation must include one short, specific reason such as: better value, better rating, more features, better for beginners, longer battery, lighter, cheaper by ₹X, matches your <item>, etc. Never generic ("it's good", "you'll like it").

EXPLAINABLE AI (v1.4) — MANDATORY:
Before writing your final reply, call the "attach_explanations" tool with:
- source: where the recommendations came from (pdp / category / search / cart / wishlist / home / marketplace). This is provenance the customer will see.
- items: for EACH recommended product, 1-3 short specific reasons. Never generic ("it's good"). Examples: "Best value under ₹3,000", "Longer battery than similar", "Highest-rated in this category", "₹500 cheaper than the closest match".
- tradeoffs (optional): pros/cons — what the customer gains vs gives up. Use for premium picks vs budget picks or when two products differ meaningfully.
- confidence (optional): ONLY when backed by real data. basis must be one of specs / ratings / popularity / price, and label must be honest (e.g. "Based on customer ratings", "Based on product specifications"). If you cannot back it with real data, omit confidence entirely — never fabricate.
- compare (optional): when recommending 2-3 products, include a short verdict per row so the customer can decide at a glance.

Skip attach_explanations only when you are NOT recommending any products (support hand-off, refusal, or clarification questions).

Style:
- Warm, concise, editorial. Prefer bullet points over long paragraphs. Keep replies under ~120 words unless the user asks for depth.
- NEVER invent products, prices, specs, or availability.
- Recommend ONLY products returned by tools or in the current context. Do not name outside brands/models.
- Prices are in INR (₹) unless the user specifies otherwise.
- If nothing suitable exists, say so honestly and suggest an adjacent query.
- For explicit "compare" requests, call compare_products with 2–4 slugs.
- Never expose technical errors, tool names, JSON, or system details to the user.`;


const MAX_TOOL_ROUNDS = 4;
const MODEL = "google/gemini-3.5-flash";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

function jsonLine(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj) + "\n");
}

async function callGateway(key: string, body: unknown) {
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("AI is busy right now — please try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted.");
    throw new Error(`AI gateway ${res.status}: ${text.slice(0, 200)}`);
  }
  return res;
}

/**
 * NDJSON stream of events:
 *   {"type":"token","text":"…"}
 *   {"type":"products","products":[…]}
 *   {"type":"suggestions","suggestions":[…]}
 *   {"type":"error","message":"…"}
 *   {"type":"done"}
 */
async function streamAiShopping(
  userText: string,
  userMessages: ChatMessage[],
  controller: ReadableStreamDefaultController<Uint8Array>,
  shoppingContext: ShoppingContext | null,
): Promise<void> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  const contextMsgs: ChatMessage[] = [];
  if (shoppingContext && shoppingContext.page !== "other") {
    const summary = summarizeShoppingContext(shoppingContext);
    contextMsgs.push({
      role: "system",
      content:
        `CURRENT SHOPPING CONTEXT (auto-detected — do not ask the user to repeat it):\n${summary}\n\n` +
        `Use this to answer contextual questions immediately. On a product page, "this" or "it" refers to the product above. ` +
        `On a category or search page, refine within the visible list before searching the whole catalog. ` +
        `On the cart page, base savings/upsell/accessory suggestions on the items in "cart.entries". ` +
        `On the wishlist page, compare "wishlist.entries" for the customer. ` +
        `On an order page, do NOT answer — redirect to Customer Support per the hand-off rule.`,
    });
  }

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...contextMsgs,
    ...userMessages,
  ];
  const productBySlug = new Map<string, AiProductSummary>();
  // v1.4 — captured Explainable AI payload (last attach_explanations wins).
  let explainPayload: AttachExplanationsPayload | null = null;

  // Non-streamed tool-calling loop.
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await callGateway(key, {
      model: MODEL,
      messages,
      tools: AI_SHOPPING_TOOLS,
      temperature: 0.4,
    });
    const json = await res.json();
    const msg = json.choices?.[0]?.message as ChatMessage | undefined;
    if (!msg) throw new Error("Empty AI response");

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls });
      for (const call of msg.tool_calls) {
        let toolResult: unknown;
        try {
          const args = JSON.parse(call.function.arguments || "{}");
          if (call.function.name === "attach_explanations") {
            explainPayload = sanitizeExplainPayload(args);
          }
          toolResult = await executeTool(call.function.name, args);
          if (call.function.name !== "attach_explanations") {
            const collect = (p: AiProductSummary | null | undefined) => {
              if (p && p.slug) productBySlug.set(p.slug, p);
            };
            if (Array.isArray(toolResult)) toolResult.forEach(collect);
            else collect(toolResult as AiProductSummary | null);
          }
        } catch (err) {
          toolResult = { error: err instanceof Error ? err.message : "Tool failed" };
        }
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.function.name,
          content: JSON.stringify(toolResult).slice(0, 12_000),
        });
      }
      continue;
    }

    // No tool calls → we have the final message. If it already has content,
    // stream it token-by-token (soft) so the client sees a smooth typing
    // effect. Otherwise, re-request with stream=true for a true stream.
    const finalText = (msg.content ?? "").trim();
    if (finalText) {
      await softStreamText(finalText, controller);
    } else {
      await realStreamFinalReply(key, messages, controller);
    }
    break;
  }

  // v1.4 — merge explanations into product refs and emit provenance / compare.
  const explainBySlug = new Map<string, AiExplanation>();
  let source: AiSource | null = null;
  let compare: AiCompare | null = null;
  if (explainPayload) {
    source = explainPayload.source;
    if (explainPayload.compare) compare = explainPayload.compare;
    for (const it of explainPayload.items) {
      if (!it.slug || !productBySlug.has(it.slug)) continue;
      explainBySlug.set(it.slug, {
        reasons: it.reasons.slice(0, 3),
        tradeoffs: it.tradeoffs,
        confidence: it.confidence,
      });
    }
  }

  const products = Array.from(productBySlug.values()).map((p) => {
    const explain = explainBySlug.get(p.slug);
    return explain ? { ...p, explain } : p;
  });
  if (products.length > 0) {
    controller.enqueue(jsonLine({ type: "products", products }));
  }
  if (source) controller.enqueue(jsonLine({ type: "source", source }));
  if (compare && compare.rows.length > 0) {
    // Filter compare rows to slugs we actually returned.
    const validSlugs = new Set(products.map((p) => p.slug));
    const rows = compare.rows.filter((r) => validSlugs.has(r.slug));
    if (rows.length >= 2) {
      controller.enqueue(jsonLine({ type: "compare", compare: { title: compare.title, rows } }));
    }
  }

  // Suggestion chips derived from context — cheap, deterministic, no extra AI call.
  const reply = messages.filter((m) => m.role === "assistant").pop()?.content ?? "";
  const suggestions = generateSuggestions({ userText, reply: String(reply), products, context: shoppingContext });
  controller.enqueue(jsonLine({ type: "suggestions", suggestions }));

  controller.enqueue(jsonLine({ type: "done" }));
}

// Defensively sanitize the model's attach_explanations payload.
function sanitizeExplainPayload(raw: unknown): AttachExplanationsPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const sourceAllowed: AiSource[] = ["pdp", "category", "search", "cart", "wishlist", "home", "marketplace"];
  const source = sourceAllowed.includes(r.source as AiSource) ? (r.source as AiSource) : "marketplace";
  const itemsRaw = Array.isArray(r.items) ? r.items : [];
  const items = itemsRaw
    .map((it: unknown) => {
      if (!it || typeof it !== "object") return null;
      const o = it as Record<string, unknown>;
      const slug = typeof o.slug === "string" ? o.slug : "";
      const reasons = Array.isArray(o.reasons)
        ? o.reasons.filter((s): s is string => typeof s === "string" && s.trim().length > 0).slice(0, 3)
        : [];
      if (!slug || reasons.length === 0) return null;
      const tradeoffsRaw = o.tradeoffs && typeof o.tradeoffs === "object" ? (o.tradeoffs as Record<string, unknown>) : null;
      const clampList = (v: unknown) =>
        Array.isArray(v) ? v.filter((s): s is string => typeof s === "string").slice(0, 3) : undefined;
      const tradeoffs = tradeoffsRaw
        ? { pros: clampList(tradeoffsRaw.pros), cons: clampList(tradeoffsRaw.cons) }
        : undefined;
      const confRaw = o.confidence && typeof o.confidence === "object" ? (o.confidence as Record<string, unknown>) : null;
      const confBasisAllowed = ["specs", "ratings", "popularity", "price"];
      const confidence =
        confRaw && confBasisAllowed.includes(confRaw.basis as string) && typeof confRaw.label === "string"
          ? { basis: confRaw.basis as "specs" | "ratings" | "popularity" | "price", label: String(confRaw.label) }
          : undefined;
      return { slug, reasons, tradeoffs, confidence };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  let compare: AiCompare | undefined;
  const cRaw = r.compare && typeof r.compare === "object" ? (r.compare as Record<string, unknown>) : null;
  if (cRaw && Array.isArray(cRaw.rows)) {
    type Row = { slug: string; verdict: string; highlight?: string };
    const rows: Row[] = cRaw.rows
      .map((row: unknown): Row | null => {
        if (!row || typeof row !== "object") return null;
        const o = row as Record<string, unknown>;
        const slug = typeof o.slug === "string" ? o.slug : "";
        const verdict = typeof o.verdict === "string" ? o.verdict : "";
        if (!slug || !verdict) return null;
        const out: Row = { slug, verdict };
        if (typeof o.highlight === "string") out.highlight = o.highlight;
        return out;
      })
      .filter((x): x is Row => x !== null)
      .slice(0, 3);
    if (rows.length >= 2) {
      compare = { title: typeof cRaw.title === "string" ? cRaw.title : undefined, rows };
    }
  }
  return { source, items, compare };
}

// Soft-streams pre-computed text in small chunks to preserve the typing feel
// even when the tool loop already produced a complete final assistant message.
async function softStreamText(text: string, controller: ReadableStreamDefaultController<Uint8Array>) {
  const words = text.split(/(\s+)/);
  const chunkSize = 3;
  for (let i = 0; i < words.length; i += chunkSize) {
    const chunk = words.slice(i, i + chunkSize).join("");
    controller.enqueue(jsonLine({ type: "token", text: chunk }));
    await new Promise((r) => setTimeout(r, 18));
  }
}

// Requests a real streamed completion (used when the model's terminal turn
// returned tool_calls-less but empty content).
async function realStreamFinalReply(
  key: string,
  messages: ChatMessage[],
  controller: ReadableStreamDefaultController<Uint8Array>,
) {
  const res = await callGateway(key, { model: MODEL, messages, stream: true, temperature: 0.4 });
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const j = JSON.parse(payload);
        const delta = j.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          controller.enqueue(jsonLine({ type: "token", text: delta }));
        }
      } catch { /* ignore malformed lines */ }
    }
  }
}

export const Route = createFileRoute("/api/ai-shopping")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as {
          messages?: ChatMessage[];
          context?: ShoppingContext;
        };
        const shoppingContext = body.context ?? null;
        const incoming = Array.isArray(body.messages) ? body.messages : [];
        const sanitized: ChatMessage[] = incoming
          .filter((m) => m && (m.role === "user" || m.role === "assistant"))
          .map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : "" }))
          .slice(-24);
        if (sanitized.length === 0 || sanitized[sanitized.length - 1].role !== "user") {
          return new Response(JSON.stringify({ error: "Last message must be from the user." }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const userText = sanitized[sanitized.length - 1].content ?? "";

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              await streamAiShopping(userText, sanitized, controller, shoppingContext);
            } catch (err) {
              const message = err instanceof Error ? err.message : "AI request failed";
              controller.enqueue(jsonLine({ type: "error", message }));
              controller.enqueue(jsonLine({ type: "done" }));
            } finally {
              controller.close();
            }
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
