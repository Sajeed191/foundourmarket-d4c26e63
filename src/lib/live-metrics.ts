import { supabase } from "@/integrations/supabase/client";
import { includeSeedInAnalytics } from "@/lib/seed-filter";


/** Real, backend-derived snapshot used to seed the Live Activity console.
 * Every figure is read from the database under admin RLS — no mock values. */
export type LiveMetrics = {
  revenueToday: number;
  ordersToday: number;
  ordersPending: number;
  lowStockNow: number;
  subscribersToday: number;
  returnsOpen: number;
  activeSessions: number;
  currency: string;
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export async function fetchLiveMetrics(): Promise<LiveMetrics> {
  const today = startOfToday();
  const sessionWindow = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const includeSeed = await includeSeedInAnalytics();
  const noSeed = <T extends { eq: (c: string, v: unknown) => T }>(q: T): T =>
    includeSeed ? q : q.eq("is_seeded", false);

  const [ordersRes, lowStockRes, subsRes, returnsRes, sessionsRes] = await Promise.all([
    noSeed(supabase.from("orders").select("total,currency,status,created_at").gte("created_at", today) as any),
    supabase.from("products").select("stock_quantity,low_stock_threshold"),
    supabase.from("newsletter_subscribers").select("id", { count: "exact", head: true }).gte("created_at", today),
    noSeed(supabase.from("returns").select("status").not("status", "in", "(completed,rejected,cancelled)") as any),
    noSeed(supabase.from("page_views").select("session_id").gte("created_at", sessionWindow).limit(1000) as any),
  ]);


  const orders = (ordersRes.data ?? []) as { total: number; currency: string; status: string }[];
  const products = (lowStockRes.data ?? []) as { stock_quantity: number; low_stock_threshold: number }[];
  const sessions = (sessionsRes.data ?? []) as { session_id: string | null }[];

  return {
    revenueToday: orders.reduce((s, o) => s + Number(o.total ?? 0), 0),
    ordersToday: orders.length,
    ordersPending: orders.filter((o) => o.status === "pending" || o.status === "processing").length,
    lowStockNow: products.filter((p) => p.stock_quantity <= (p.low_stock_threshold ?? 5)).length,
    subscribersToday: subsRes.count ?? 0,
    returnsOpen: (returnsRes.data ?? []).length,
    activeSessions: new Set(sessions.map((s) => s.session_id).filter(Boolean)).size,
    currency: orders[0]?.currency ?? "USD",
  };
}
