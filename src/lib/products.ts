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
  featured: boolean;
  sku?: string | null;
  stockQuantity: number;
  lowStockThreshold: number;
  viewsCount: number;
  createdAt: string;
};


export type ProductImage = { id: string; url: string; alt: string | null; sortOrder: number };
export type ProductVariant = {
  id: string;
  name: string;
  sku: string | null;
  priceOverride: number | null;
  stockQuantity: number;
  sortOrder: number;
};

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

type Row = {
  slug: string; name: string; tagline: string | null; category: string;
  price: number | string; rating: number | string; reviews: number;
  image: string | null; description: string | null; in_stock: boolean;
  discount: number | null; featured?: boolean | null;
  sku?: string | null; stock_quantity?: number | null; low_stock_threshold?: number | null;
  views_count?: number | null; created_at?: string | null;
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
    featured: r.featured ?? false,
    sku: r.sku ?? null,
    stockQuantity: r.stock_quantity ?? 0,
    lowStockThreshold: r.low_stock_threshold ?? 5,
    viewsCount: r.views_count ?? 0,
    createdAt: r.created_at ?? "",
  };
}

const SELECT_COLS = "slug,name,tagline,category,price,rating,reviews,image,description,in_stock,discount,featured,sku,stock_quantity,low_stock_threshold,views_count,created_at";


export async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select(SELECT_COLS)
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return (data as Row[]).map(rowToProduct);
}

export async function fetchProductsBySlugs(slugs: string[]): Promise<Product[]> {
  if (!slugs.length) return [];
  const { data } = await supabase.from("products").select(SELECT_COLS).in("slug", slugs);
  const map = new Map((data as Row[] ?? []).map((r) => [r.slug, rowToProduct(r)]));
  return slugs.map((s) => map.get(s)).filter((p): p is Product => !!p);
}

export async function fetchProduct(slug: string): Promise<Product | null> {
  const { data } = await supabase
    .from("products")
    .select(SELECT_COLS)
    .eq("slug", slug)
    .maybeSingle();
  return data ? rowToProduct(data as Row) : null;
}

export async function fetchProductImages(slug: string): Promise<ProductImage[]> {
  const { data } = await supabase
    .from("product_images")
    .select("id,url,alt,sort_order")
    .eq("product_slug", slug)
    .order("sort_order", { ascending: true });
  return (data ?? []).map((r: any) => ({
    id: r.id, url: resolveImage(r.url), alt: r.alt, sortOrder: r.sort_order,
  }));
}

export async function fetchProductVariants(slug: string): Promise<ProductVariant[]> {
  const { data } = await supabase
    .from("product_variants")
    .select("id,name,sku,price_override,stock_quantity,sort_order")
    .eq("product_slug", slug)
    .order("sort_order", { ascending: true });
  return (data ?? []).map((r: any) => ({
    id: r.id, name: r.name, sku: r.sku,
    priceOverride: r.price_override != null ? Number(r.price_override) : null,
    stockQuantity: r.stock_quantity, sortOrder: r.sort_order,
  }));
}
