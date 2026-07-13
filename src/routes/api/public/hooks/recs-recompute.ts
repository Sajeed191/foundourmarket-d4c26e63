import { createFileRoute } from "@tanstack/react-router";

/**
 * Nightly Intelligence Job — precompute the expensive recommendation signals
 * once per night so daytime reads stay cheap.
 *
 * Recomputes from order history:
 *  - Co-purchase graph (bought_with edges) → product_graph_edges
 *  - Popularity / FBT strength / conversion per product → product_scores
 *
 * Auth: `apikey` header must match the project anon key (pg_cron pattern).
 * Idempotent (upserts), per-section fault isolated, read-only against orders.
 */

const LOOKBACK_DAYS = 90;
const MAX_EDGES_PER_SEED = 20;
const MAX_PAIRS_PER_ORDER = 40; // guard against pathological large baskets

export const Route = createFileRoute("/api/public/hooks/recs-recompute")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
        const accepted = [process.env.SUPABASE_PUBLISHABLE_KEY, process.env.SUPABASE_ANON_KEY].filter(Boolean);
        if (!accepted.length || !accepted.includes(apikey)) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const summary: Record<string, unknown> = { startedAt: new Date().toISOString() };
        const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

        // ---- Load recent order items ----
        let items: { order_id: string; product_slug: string }[] = [];
        try {
          const { data, error } = await supabaseAdmin
            .from("order_items")
            .select("order_id, product_slug")
            .gte("created_at", since)
            .limit(100000);
          if (error) throw error;
          items = (data ?? []).filter((r) => r.product_slug) as typeof items;
          summary.orderItems = items.length;
        } catch (e) {
          summary.orderItemsError = String(e);
        }

        // ---- Co-purchase graph + popularity ----
        try {
          const byOrder = new Map<string, Set<string>>();
          const popularity = new Map<string, number>();
          for (const it of items) {
            popularity.set(it.product_slug, (popularity.get(it.product_slug) ?? 0) + 1);
            let set = byOrder.get(it.order_id);
            if (!set) {
              set = new Set();
              byOrder.set(it.order_id, set);
            }
            set.add(it.product_slug);
          }

          // Directed co-occurrence counts.
          const pair = new Map<string, Map<string, number>>();
          const bump = (a: string, b: string) => {
            let m = pair.get(a);
            if (!m) {
              m = new Map();
              pair.set(a, m);
            }
            m.set(b, (m.get(b) ?? 0) + 1);
          };
          for (const set of byOrder.values()) {
            const slugs = [...set];
            if (slugs.length < 2) continue;
            const capped = slugs.slice(0, MAX_PAIRS_PER_ORDER);
            for (let i = 0; i < capped.length; i++) {
              for (let j = 0; j < capped.length; j++) {
                if (i !== j) bump(capped[i], capped[j]);
              }
            }
          }

          // Build bought_with edge rows (top N per seed).
          const now = new Date().toISOString();
          const edgeRows: {
            from_slug: string;
            edge_type: string;
            to_slug: string;
            weight: number;
            updated_at: string;
          }[] = [];
          const fbtStrength = new Map<string, number>();
          for (const [from, m] of pair) {
            const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_EDGES_PER_SEED);
            fbtStrength.set(from, top[0]?.[1] ?? 0);
            for (const [to, weight] of top) {
              edgeRows.push({ from_slug: from, edge_type: "bought_with", to_slug: to, weight, updated_at: now });
            }
          }

          // Refresh bought_with edges: clear stale, insert fresh (chunked).
          await supabaseAdmin.from("product_graph_edges").delete().eq("edge_type", "bought_with");
          for (let i = 0; i < edgeRows.length; i += 1000) {
            const chunk = edgeRows.slice(i, i + 1000);
            const { error } = await supabaseAdmin.from("product_graph_edges").insert(chunk);
            if (error) throw error;
          }
          summary.edgesWritten = edgeRows.length;

          // Product scores upsert.
          const maxPop = Math.max(1, ...popularity.values());
          const scoreRows = [...popularity.entries()].map(([slug, count]) => ({
            product_slug: slug,
            popularity: Math.round((count / maxPop) * 100),
            fbt_strength: fbtStrength.get(slug) ?? 0,
            conversion: 0,
            trending: count,
            aggregates: {},
            updated_at: now,
          }));
          for (let i = 0; i < scoreRows.length; i += 1000) {
            const chunk = scoreRows.slice(i, i + 1000);
            const { error } = await supabaseAdmin
              .from("product_scores")
              .upsert(chunk, { onConflict: "product_slug" });
            if (error) throw error;
          }
          summary.scoresWritten = scoreRows.length;
        } catch (e) {
          summary.graphError = String(e);
        }

        summary.finishedAt = new Date().toISOString();
        return new Response(JSON.stringify({ success: true, summary }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
