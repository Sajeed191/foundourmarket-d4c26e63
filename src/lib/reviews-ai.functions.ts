import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STAFF_ROLES = ["admin", "super_admin", "manager", "support"];

async function assertStaff(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", STAFF_ROLES);
  if (!data || data.length === 0) {
    throw new Error("Forbidden: staff access required.");
  }
}

const inputSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(20),
});

type Analysis = {
  sentiment: "positive" | "neutral" | "negative" | "mixed";
  sentiment_score: number;
  sentiment_summary: string;
  fake_score: number;
  fake_reasons: string;
};

const SYSTEM_PROMPT = `You are a senior e-commerce trust & safety analyst for a premium global marketplace.
You analyse a single customer product review and return STRICT JSON only (no markdown, no prose).

Return an object with exactly these keys:
- "sentiment": one of "positive", "neutral", "negative", "mixed".
- "sentiment_score": number 0-100 (0 = extremely negative, 50 = neutral, 100 = extremely positive).
- "sentiment_summary": one concise sentence (max 140 chars) summarising the customer's feeling.
- "fake_score": number 0-100 likelihood the review is fake/inauthentic/spam (0 = clearly genuine, 100 = almost certainly fake).
- "fake_reasons": one concise sentence (max 160 chars) explaining the fake_score signals (generic language, extreme praise, irrelevance, copy-paste, incentivised tone). If genuine, say so briefly.

Consider rating vs text consistency, specificity, verified purchase status, and length. Output ONLY the JSON object.`;

async function callAI(payload: {
  rating: number;
  title: string | null;
  body: string | null;
  verified: boolean;
}): Promise<Analysis> {
  const userPrompt = `Review to analyse:
Rating: ${payload.rating}/5
Verified purchase: ${payload.verified ? "yes" : "no"}
Title: ${payload.title ?? "(none)"}
Body: ${payload.body ?? "(none)"}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (res.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
  if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Settings.");
  if (!res.ok) throw new Error(`AI request failed (${res.status}).`);

  const json = await res.json();
  const content: string = json?.choices?.[0]?.message?.content ?? "{}";
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : {};
  }

  const clamp = (n: any) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
  const sentiment = ["positive", "neutral", "negative", "mixed"].includes(parsed.sentiment)
    ? parsed.sentiment
    : "neutral";
  return {
    sentiment,
    sentiment_score: clamp(parsed.sentiment_score),
    sentiment_summary: String(parsed.sentiment_summary ?? "").slice(0, 200),
    fake_score: clamp(parsed.fake_score),
    fake_reasons: String(parsed.fake_reasons ?? "").slice(0, 240),
  };
}

/**
 * Run AI sentiment + fake-review analysis on a batch of reviews and persist the
 * results. Staff-only: requireSupabaseAuth scopes the client to the signed-in
 * user, we re-check their staff role, and the product_reviews moderation
 * columns are RLS/trigger-protected so only staff writes land.
 */
export const analyzeReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertStaff(supabase, userId);

    const { data: reviews, error } = await supabase
      .from("product_reviews")
      .select("id, rating, title, body, verified_purchase")
      .in("id", data.ids);
    if (error) throw new Error(error.message);

    const results: { id: string; ok: boolean; error?: string }[] = [];
    const now = new Date().toISOString();

    for (const r of reviews ?? []) {
      try {
        const a = await callAI({
          rating: r.rating,
          title: r.title,
          body: r.body,
          verified: r.verified_purchase,
        });
        const { error: upErr } = await supabase
          .from("product_reviews")
          .update({
            sentiment: a.sentiment,
            sentiment_score: a.sentiment_score,
            sentiment_summary: a.sentiment_summary,
            sentiment_analyzed_at: now,
            fake_score: a.fake_score,
            fake_reasons: a.fake_reasons,
            moderation_analyzed_at: now,
          })
          .eq("id", r.id);
        if (upErr) throw new Error(upErr.message);
        results.push({ id: r.id, ok: true });
      } catch (e) {
        results.push({ id: r.id, ok: false, error: e instanceof Error ? e.message : "failed" });
      }
    }

    return { analyzed: results.filter((r) => r.ok).length, total: results.length, results };
  });
