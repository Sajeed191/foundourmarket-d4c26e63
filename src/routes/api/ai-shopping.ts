import { createFileRoute } from "@tanstack/react-router";
import { AI_SHOPPING_TOOLS, executeTool, type AiProductSummary } from "@/lib/ai-shopping/tools.server";

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

async function runAiShopping(userMessages: ChatMessage[]): Promise<{
  reply: string;
  products: AiProductSummary[];
}> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...userMessages,
  ];

  const productBySlug = new Map<string, AiProductSummary>();

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        tools: round < MAX_TOOL_ROUNDS ? AI_SHOPPING_TOOLS : undefined,
        temperature: 0.4,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("AI is busy right now — please try again in a moment.");
      if (res.status === 402) throw new Error("AI credits exhausted. Please top up in workspace billing.");
      throw new Error(`AI gateway ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = await res.json();
    const choice = json.choices?.[0];
    const msg = choice?.message as ChatMessage | undefined;
    if (!msg) throw new Error("Empty AI response");

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      messages.push({
        role: "assistant",
        content: msg.content ?? "",
        tool_calls: msg.tool_calls,
      });
      for (const call of msg.tool_calls) {
        let toolResult: unknown;
        try {
          const args = JSON.parse(call.function.arguments || "{}");
          toolResult = await executeTool(call.function.name, args);
          // Track any products the assistant retrieved so we can render cards.
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

    return {
      reply: (msg.content ?? "").trim() || "I'm not sure how to help with that — try asking me to find a product or compare two.",
      products: Array.from(productBySlug.values()),
    };
  }

  return {
    reply: "I couldn't finalize a recommendation. Please try rephrasing your request.",
    products: Array.from(productBySlug.values()),
  };
}

export const Route = createFileRoute("/api/ai-shopping")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { messages?: ChatMessage[] };
          const incoming = Array.isArray(body.messages) ? body.messages : [];
          // Only keep user/assistant text turns from the client; drop any tool
          // plumbing the client might send.
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
          const result = await runAiShopping(sanitized);
          return new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "AI request failed";
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
