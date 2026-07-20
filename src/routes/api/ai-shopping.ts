import { createFileRoute } from "@tanstack/react-router";
import { AI_SHOPPING_TOOLS, executeTool, type AiProductSummary } from "@/lib/ai-shopping/tools.server";
import { generateSuggestions } from "@/lib/ai-shopping/suggestions";
import { summarizeShoppingContext, type ShoppingContext } from "@/lib/ai-shopping/shopping-context";

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

Style:
- Warm, concise, editorial. Prefer bullet points over long paragraphs. Keep replies under ~120 words unless the user asks for depth.
- NEVER invent products, prices, specs, or availability. Always call a tool to look up real catalog data before recommending.
- Recommend ONLY products from the FoundOurMarket™ catalog returned by the tools. Do not mention brands, models, or products not present in tool results.
- When you show products, briefly explain WHY each fits (1 short sentence each).
- Prices are in INR (₹) unless the user specifies otherwise.
- If the catalog has nothing matching, say so honestly and suggest an adjacent query.
- For "compare" requests, always call compare_products with 2-4 slugs.
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
          toolResult = await executeTool(call.function.name, args);
          const collect = (p: AiProductSummary | null | undefined) => {
            if (p && p.slug) productBySlug.set(p.slug, p);
          };
          if (Array.isArray(toolResult)) toolResult.forEach(collect);
          else collect(toolResult as AiProductSummary | null);
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

  const products = Array.from(productBySlug.values());
  if (products.length > 0) {
    controller.enqueue(jsonLine({ type: "products", products }));
  }

  // Suggestion chips derived from context — cheap, deterministic, no extra AI call.
  const reply = messages.filter((m) => m.role === "assistant").pop()?.content ?? "";
  const suggestions = generateSuggestions({ userText, reply: String(reply), products });
  controller.enqueue(jsonLine({ type: "suggestions", suggestions }));
  controller.enqueue(jsonLine({ type: "done" }));
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
