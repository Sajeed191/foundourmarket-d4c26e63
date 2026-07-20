// Server-only product-lookup tools for the AI Shopping Assistant.
// Uses the service-role client to read public product data (RLS bypass is
// safe here — every field returned is already public storefront data).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AiProductSummary = {
  slug: string;
  name: string;
  category: string | null;
  brand: string | null;
  price_inr: number | null;
  price_usd: number | null;
  compare_price_inr: number | null;
  rating: number | null;
  reviews: number | null;
  in_stock: boolean;
  image: string | null;
  tagline: string | null;
  description: string | null;
  features: string[] | null;
};

const SELECT =
  "slug,name,category,brand,price_inr,price_usd,compare_price_inr,rating,reviews,in_stock,image,tagline,description,features";

function normalize(row: Record<string, unknown>): AiProductSummary {
  return {
    slug: String(row.slug ?? ""),
    name: String(row.name ?? ""),
    category: (row.category as string | null) ?? null,
    brand: (row.brand as string | null) ?? null,
    price_inr: (row.price_inr as number | null) ?? null,
    price_usd: (row.price_usd as number | null) ?? null,
    compare_price_inr: (row.compare_price_inr as number | null) ?? null,
    rating: (row.rating as number | null) ?? null,
    reviews: (row.reviews as number | null) ?? null,
    in_stock: Boolean(row.in_stock),
    image: (row.image as string | null) ?? null,
    tagline: (row.tagline as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    features: (row.features as string[] | null) ?? null,
  };
}

export async function searchProducts(args: {
  query?: string;
  category?: string;
  min_price_inr?: number;
  max_price_inr?: number;
  brand?: string;
  in_stock_only?: boolean;
  limit?: number;
}): Promise<AiProductSummary[]> {
  const limit = Math.min(Math.max(args.limit ?? 8, 1), 12);
  let q = supabaseAdmin
    .from("products")
    .select(SELECT)
    .is("deleted_at", null)
    .eq("hide_from_recommendations", false)
    .eq("hide_from_search", false)
    .limit(limit);

  if (args.query && args.query.trim()) {
    const term = args.query.trim().replace(/[%_]/g, "");
    q = q.or(
      `name.ilike.%${term}%,tagline.ilike.%${term}%,description.ilike.%${term}%,category.ilike.%${term}%,brand.ilike.%${term}%`,
    );
  }
  if (args.category) q = q.ilike("category", `%${args.category}%`);
  if (args.brand) q = q.ilike("brand", `%${args.brand}%`);
  if (typeof args.min_price_inr === "number") q = q.gte("price_inr", args.min_price_inr);
  if (typeof args.max_price_inr === "number") q = q.lte("price_inr", args.max_price_inr);
  if (args.in_stock_only) q = q.eq("in_stock", true);

  q = q.order("rating", { ascending: false, nullsFirst: false });

  const { data, error } = await q;
  if (error) throw new Error(`search_products: ${error.message}`);
  return (data ?? []).map(normalize);
}

export async function getProduct(slug: string): Promise<AiProductSummary | null> {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select(SELECT)
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`get_product: ${error.message}`);
  return data ? normalize(data) : null;
}

export async function compareProducts(slugs: string[]): Promise<AiProductSummary[]> {
  const clean = slugs.map((s) => String(s).trim()).filter(Boolean).slice(0, 4);
  if (clean.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("products")
    .select(SELECT)
    .in("slug", clean)
    .is("deleted_at", null);
  if (error) throw new Error(`compare_products: ${error.message}`);
  return (data ?? []).map(normalize);
}

/**
 * Batch fetch products by slug — used to hydrate the visible list from the
 * Shopping Context Engine before falling back to a broader search. Respects
 * the same visibility filters as the catalog.
 */
export async function getProductsBySlugs(slugs: string[]): Promise<AiProductSummary[]> {
  const clean = Array.from(new Set(slugs.map((s) => String(s).trim()).filter(Boolean))).slice(0, 12);
  if (clean.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("products")
    .select(SELECT)
    .in("slug", clean)
    .is("deleted_at", null)
    .eq("hide_from_recommendations", false)
    .eq("hide_from_search", false);
  if (error) throw new Error(`get_products_by_slugs: ${error.message}`);
  return (data ?? []).map(normalize);
}


// OpenAI-style function tool schemas the model sees.
export const AI_SHOPPING_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "search_products",
      description:
        "Search the FoundOurMarket catalog. Use for any request like 'show me X', 'find Y under ₹Z', 'gift ideas for ...'. Returns up to 12 products.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Natural-language keywords, e.g. 'lightweight running shoes'." },
          category: { type: "string", description: "Category filter, e.g. 'Footwear'." },
          brand: { type: "string" },
          min_price_inr: { type: "number", description: "Minimum price in INR." },
          max_price_inr: { type: "number", description: "Maximum price in INR." },
          in_stock_only: { type: "boolean" },
          limit: { type: "number", description: "1-12", default: 6 },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_product",
      description: "Fetch full details for a single product by its slug.",
      parameters: {
        type: "object",
        required: ["slug"],
        properties: { slug: { type: "string" } },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "compare_products",
      description: "Fetch 2-4 products by slug for side-by-side comparison.",
      parameters: {
        type: "object",
        required: ["slugs"],
        properties: {
          slugs: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_products_by_slugs",
      description:
        "Batch-fetch full product details for up to 12 slugs. USE THIS FIRST when the Shopping Context Engine already lists visible products (category.visible, search.visible, cart.entries, wishlist.entries). Cheaper than search_products and keeps recommendations inside what the customer is actually looking at.",
      parameters: {
        type: "object",
        required: ["slugs"],
        properties: {
          slugs: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 12 },
        },
      },
    },
  },
];

export async function executeTool(name: string, args: Record<string, unknown>) {
  if (name === "search_products") return searchProducts(args as Parameters<typeof searchProducts>[0]);
  if (name === "get_product") return getProduct(String(args.slug ?? ""));
  if (name === "compare_products") return compareProducts((args.slugs as string[]) ?? []);
  if (name === "get_products_by_slugs") return getProductsBySlugs((args.slugs as string[]) ?? []);
  throw new Error(`Unknown tool: ${name}`);
}

