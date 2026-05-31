import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STAFF_ROLES = ["admin", "super_admin", "manager", "support"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertStaff(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).in("role", STAFF_ROLES);
  if (!data || data.length === 0) throw new Error("Forbidden: staff access required.");
}

const inputSchema = z.object({ ticketId: z.string().uuid() });

type Suggestion = {
  sentiment: "positive" | "neutral" | "negative" | "frustrated";
  sentiment_summary: string;
  suggested_reply: string;
  recommendation: string;
  agent_guidance: string;
};

const SYSTEM_PROMPT = `You are a senior customer-support agent for FoundOurMarket, a premium global marketplace.
You are given the REAL context of one support ticket: the customer's profile summary, their order/shipment/refund/return facts, and the full message thread.
Return STRICT JSON only (no markdown) with exactly these keys:
- "sentiment": one of "positive","neutral","negative","frustrated".
- "sentiment_summary": one concise sentence (max 140 chars) on the customer's emotional state.
- "suggested_reply": a polished, empathetic reply the agent can send, grounded ONLY in the facts provided. Never invent tracking numbers, dates, amounts, or promises not supported by the context. If information is missing, ask for it or say it will be checked.
- "recommendation": the single best next action (e.g. "Approve partial refund of the shipping fee", "Escalate to logistics", "Request order ID"). Base it ONLY on real facts.
- "agent_guidance": one short internal note for the agent (max 160 chars).
Do NOT fabricate any information. Output ONLY the JSON object.`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callAI(contextText: string): Promise<Suggestion> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: contextText },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (res.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
  if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Settings.");
  if (!res.ok) throw new Error(`AI request failed (${res.status}).`);
  const json = await res.json();
  const content: string = json?.choices?.[0]?.message?.content ?? "{}";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any;
  try { parsed = JSON.parse(content); } catch {
    const m = content.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : {};
  }
  const sentiment = ["positive", "neutral", "negative", "frustrated"].includes(parsed.sentiment) ? parsed.sentiment : "neutral";
  return {
    sentiment,
    sentiment_summary: String(parsed.sentiment_summary ?? "").slice(0, 200),
    suggested_reply: String(parsed.suggested_reply ?? "").slice(0, 2000),
    recommendation: String(parsed.recommendation ?? "").slice(0, 400),
    agent_guidance: String(parsed.agent_guidance ?? "").slice(0, 240),
  };
}

/**
 * AI-assisted support: generate a suggested reply + recommendation + sentiment
 * for a REAL ticket. Staff-only. All context is read server-side from real
 * tables; the model is instructed never to fabricate facts.
 */
export const suggestSupportReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string }; // eslint-disable-line @typescript-eslint/no-explicit-any
    await assertStaff(supabase, userId);

    const { data: ticket, error } = await supabase
      .from("support_tickets")
      .select("id,user_id,subject,category,status,priority,order_id,market_region,created_at")
      .eq("id", data.ticketId)
      .maybeSingle();
    if (error || !ticket) throw new Error("Ticket not found.");

    const [{ data: messages }, { data: profile }] = await Promise.all([
      supabase.from("support_messages").select("sender_role,body,created_at").eq("ticket_id", ticket.id).order("created_at", { ascending: true }).limit(40),
      supabase.from("profiles").select("full_name,country,market_region").eq("id", ticket.user_id).maybeSingle(),
    ]);

    // Real order / shipment / refund / return facts (only if linked).
    let orderFacts = "No order linked to this ticket.";
    if (ticket.order_id) {
      const [{ data: order }, { data: shipment }, { data: refunds }, { data: returns }] = await Promise.all([
        supabase.from("orders").select("status,total,currency,payment_status,fulfillment_status,tracking_number,carrier,created_at").eq("id", ticket.order_id).maybeSingle(),
        supabase.from("shipments").select("status,carrier,tracking_number,estimated_delivery,shipped_at,delivered_at").eq("order_id", ticket.order_id).maybeSingle(),
        supabase.from("refunds").select("amount,currency,status,reason").eq("order_id", ticket.order_id),
        supabase.from("returns").select("status,reason,refund_amount,refund_status").eq("order_id", ticket.order_id),
      ]);
      orderFacts = [
        order ? `Order: status=${order.status}, total=${order.total} ${order.currency ?? ""}, payment=${order.payment_status}, fulfillment=${order.fulfillment_status}, tracking=${order.tracking_number ?? "none"}, carrier=${order.carrier ?? "none"}` : "Order not found.",
        shipment ? `Shipment: status=${shipment.status}, carrier=${shipment.carrier ?? "none"}, tracking=${shipment.tracking_number ?? "none"}, ETA=${shipment.estimated_delivery ?? "n/a"}, shipped=${shipment.shipped_at ?? "no"}, delivered=${shipment.delivered_at ?? "no"}` : "No shipment record.",
        (refunds ?? []).length ? `Refunds: ${(refunds ?? []).map((r: any) => `${r.amount} ${r.currency ?? ""} (${r.status})`).join("; ")}` : "No refunds.", // eslint-disable-line @typescript-eslint/no-explicit-any
        (returns ?? []).length ? `Returns: ${(returns ?? []).map((r: any) => `${r.status} (${r.reason ?? "no reason"})`).join("; ")}` : "No returns.", // eslint-disable-line @typescript-eslint/no-explicit-any
      ].join("\n");
    }

    const thread = (messages ?? [])
      .map((m: any) => `[${m.sender_role ?? "customer"}] ${m.body ?? ""}`) // eslint-disable-line @typescript-eslint/no-explicit-any
      .join("\n");

    const contextText = `Customer: ${profile?.full_name ?? "Unknown"} (${profile?.market_region ?? profile?.country ?? "?"})
Ticket: "${ticket.subject}" | category=${ticket.category} | priority=${ticket.priority} | status=${ticket.status}
${orderFacts}

Conversation (oldest first):
${thread || "(no messages yet)"}`;

    const suggestion = await callAI(contextText);
    return { ok: true as const, suggestion };
  });
