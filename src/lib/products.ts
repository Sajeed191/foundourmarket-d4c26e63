import earbuds from "@/assets/product-earbuds.jpg";
import watch from "@/assets/product-watch.jpg";
import lamp from "@/assets/product-lamp.jpg";
import headphones from "@/assets/product-headphones.jpg";
import flask from "@/assets/product-flask.jpg";
import keyboard from "@/assets/product-keyboard.jpg";
import backpack from "@/assets/product-backpack.jpg";
import sunglasses from "@/assets/product-sunglasses.jpg";
import { supabase } from "@/integrations/supabase/client";

export type Product = {
  slug: string;
  name: string;
  tagline: string;
  category: string;
  price: number;
  rating: number;
  reviews: number;
  image: string;
  description: string;
  inStock: boolean;
  discount?: number;
};

// Bundled assets keyed by filename so DB rows can reference them by basename.
const ASSET_MAP: Record<string, string> = {
  "product-earbuds.jpg": earbuds,
  "product-watch.jpg": watch,
  "product-lamp.jpg": lamp,
  "product-headphones.jpg": headphones,
  "product-flask.jpg": flask,
  "product-keyboard.jpg": keyboard,
  "product-backpack.jpg": backpack,
  "product-sunglasses.jpg": sunglasses,
};

export function resolveImage(raw: string | null | undefined): string {
  if (!raw) return "";
  if (raw.startsWith("http") || raw.startsWith("data:")) return raw;
  const base = raw.split("/").pop() ?? raw;
  return ASSET_MAP[base] ?? raw;
}

// Categories are now managed in the database — see src/lib/use-categories.ts


type Row = {
  slug: string; name: string; tagline: string | null; category: string;
  price: number | string; rating: number | string; reviews: number;
  image: string | null; description: string | null; in_stock: boolean;
  discount: number | null;
};

function rowToProduct(r: Row): Product {
  return {
    slug: r.slug,
    name: r.name,
    tagline: r.tagline ?? "",
    category: r.category,
    price: Number(r.price),
    rating: Number(r.rating),
    reviews: r.reviews,
    image: resolveImage(r.image),
    description: r.description ?? "",
    inStock: r.in_stock,
    discount: r.discount ?? undefined,
  };
}

export async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select("slug,name,tagline,category,price,rating,reviews,image,description,in_stock,discount")
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return (data as Row[]).map(rowToProduct);
}

export async function fetchProduct(slug: string): Promise<Product | null> {
  const { data } = await supabase
    .from("products")
    .select("slug,name,tagline,category,price,rating,reviews,image,description,in_stock,discount")
    .eq("slug", slug)
    .maybeSingle();
  return data ? rowToProduct(data as Row) : null;
}
