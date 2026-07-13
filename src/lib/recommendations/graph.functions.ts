import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Global Commerce Graph — read access to the typed product relationship graph.
 *
 * The graph stores relationships (bought_with, viewed_with, similar_to,
 * upgrade_to, budget_alt, accessory_of, same_brand, same_category) with a
 * strength weight, precomputed nightly. Daytime reads are cheap top-N lookups
 * that feed the existing engine's `seedScores` + `restrictTo` — no real-time
 * joins, no engine rewrite.
 */

const EDGE_TYPES = [
  "bought_with",
  "viewed_with",
  "similar_to",
  "upgrade_to",
  "budget_alt",
  "accessory_of",
  "same_brand",
  "same_category",
] as const;

export type GraphEdgeType = (typeof EDGE_TYPES)[number];

export type GraphEdge = { to_slug: string; weight: number };

function publicClient() {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(process.env.SUPABASE_URL!, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

const inputSchema = z.object({
  fromSlug: z.string().min(1),
  edgeType: z.enum(EDGE_TYPES),
  limit: z.number().int().min(1).max(50).optional().default(20),
});

/** Top-N related products for one seed + edge type, strongest first. */
export const getGraphEdges = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<GraphEdge[]> => {
    const supabase = publicClient();
    const { data: rows, error } = await supabase
      .from("product_graph_edges")
      .select("to_slug, weight")
      .eq("from_slug", data.fromSlug)
      .eq("edge_type", data.edgeType)
      .order("weight", { ascending: false })
      .limit(data.limit);
    if (error) {
      console.error(`[graph] getGraphEdges failed [${error.code}]: ${error.message}`);
      return [];
    }
    return (rows ?? []).map((r) => ({ to_slug: r.to_slug, weight: Number(r.weight) }));
  });

/** Fetch several edge types for one seed at once (PDP rails). */
const multiSchema = z.object({
  fromSlug: z.string().min(1),
  edgeTypes: z.array(z.enum(EDGE_TYPES)).min(1).max(8),
  limit: z.number().int().min(1).max(50).optional().default(20),
});

export const getGraphEdgeSets = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => multiSchema.parse(data))
  .handler(async ({ data }): Promise<Record<string, GraphEdge[]>> => {
    const supabase = publicClient();
    const { data: rows, error } = await supabase
      .from("product_graph_edges")
      .select("edge_type, to_slug, weight")
      .eq("from_slug", data.fromSlug)
      .in("edge_type", data.edgeTypes)
      .order("weight", { ascending: false });
    if (error) {
      console.error(`[graph] getGraphEdgeSets failed [${error.code}]: ${error.message}`);
      return {};
    }
    const out: Record<string, GraphEdge[]> = {};
    for (const t of data.edgeTypes) out[t] = [];
    for (const r of rows ?? []) {
      const bucket = out[r.edge_type];
      if (bucket && bucket.length < data.limit) bucket.push({ to_slug: r.to_slug, weight: Number(r.weight) });
    }
    return out;
  });
