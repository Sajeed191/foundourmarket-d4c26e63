import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "fom_session_id";

function sessionId(): string {
  if (typeof window === "undefined") return "ssr";
  let s = sessionStorage.getItem(SESSION_KEY);
  if (!s) { s = crypto.randomUUID(); sessionStorage.setItem(SESSION_KEY, s); }
  return s;
}

export type RecEvent =
  | { type: "view"; productSlug: string; category?: string }
  | { type: "add_to_cart"; productSlug: string }
  | { type: "purchase"; productSlug: string }
  | { type: "wishlist"; productSlug: string }
  | { type: "search"; query: string }
  | { type: "category_view"; category: string };

const WEIGHTS: Record<string, number> = {
  view: 1, add_to_cart: 3, purchase: 8, wishlist: 2, search: 1, category_view: 1,
};

export async function recordEvent(e: RecEvent) {
  if (typeof window === "undefined") return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await (supabase.from as any)("recommendation_events").insert({
      user_id: user?.id ?? null,
      session_id: sessionId(),
      event_type: e.type,
      product_slug: "productSlug" in e ? e.productSlug : null,
      category: "category" in e ? e.category : null,
      query: "query" in e ? e.query : null,
      weight: WEIGHTS[e.type] ?? 1,
    });
  } catch {/* swallow */}
}

export async function fetchTrendingSlugs(limit = 8): Promise<string[]> {
  const { data } = await (supabase.from as any)("trending_products")
    .select("product_slug, trend_score")
    .order("trend_score", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r: { product_slug: string }) => r.product_slug).filter(Boolean);
}

export async function fetchFBT(slug: string, limit = 4): Promise<string[]> {
  const { data } = await (supabase.rpc as any)("get_fbt", { _slug: slug, _limit: limit });
  return (data ?? []).map((r: { product_slug: string }) => r.product_slug).filter(Boolean);
}

export async function fetchAlsoViewed(slug: string, limit = 6): Promise<string[]> {
  // Sessions that viewed `slug` and what else they viewed
  const { data: sessions } = await (supabase.from as any)("recommendation_events")
    .select("session_id")
    .eq("event_type", "view")
    .eq("product_slug", slug)
    .not("session_id", "is", null)
    .limit(500);
  const ids = [...new Set((sessions ?? []).map((r: { session_id: string }) => r.session_id))];
  if (!ids.length) return [];
  const { data: others } = await (supabase.from as any)("recommendation_events")
    .select("product_slug")
    .eq("event_type", "view")
    .in("session_id", ids)
    .neq("product_slug", slug)
    .limit(1000);
  const counts = new Map<string, number>();
  for (const r of others ?? []) {
    const s = (r as { product_slug: string }).product_slug;
    if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([s]) => s);
}

export async function fetchPersonalizedSlugs(limit = 8): Promise<string[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fetchTrendingSlugs(limit);
    // Pull recent signals and weight categories
    const { data: events } = await (supabase.from as any)("recommendation_events")
      .select("product_slug, category, event_type, weight, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    const catScore = new Map<string, number>();
    const seen = new Set<string>();
    for (const e of events ?? []) {
      const ev = e as { product_slug: string | null; category: string | null; weight: number };
      if (ev.product_slug) seen.add(ev.product_slug);
      if (ev.category) catScore.set(ev.category, (catScore.get(ev.category) ?? 0) + Number(ev.weight));
    }
    const topCats = [...catScore.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);
    if (!topCats.length) return fetchTrendingSlugs(limit);
    const { data: prods } = await supabase.from("products_public")
      .select("slug, rating, views_count, category")
      .in("category", topCats)
      .order("rating", { ascending: false })
      .limit(limit * 3);
    const ranked = (prods ?? [])
      .filter((p) => !seen.has(p.slug))
      .slice(0, limit)
      .map((p) => p.slug);
    return ranked.length ? ranked : fetchTrendingSlugs(limit);
  } catch {
    return fetchTrendingSlugs(limit);
  }
}
