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
  soldCount: number;
  wishlistCount: number;
  // Dual-region independent admin-defined pricing (no currency conversion)
  priceInr: number | null;
  comparePriceInr: number | null;
  priceUsd: number | null;
  comparePriceUsd: number | null;
  indiaVisible: boolean;
  internationalVisible: boolean;
  warranty: string;
  // Admin OS fields
  status: ProductStatus;
  costPriceInr: number | null;
  costPriceUsd: number | null;
  shippingFeeInr: number;
  shippingFeeUsd: number;
  razorpayEnabled: boolean;
  stripeEnabled: boolean;
  paypalEnabled: boolean;
  codEnabled: boolean;
  returnEligible: boolean;
  replacementEligible: boolean;
  returnWindowDays: number;
  pickupSupported: boolean;
  internationalShipping: boolean;
  fragile: boolean;
  customsInfo: string;
  barcode: string;
  warehouseLocation: string;
  restockEta: string;
  preorder: boolean;
  reservedQuantity: number;
  scheduledPublishAt: string | null;
  scheduledExpiryAt: string | null;
};

export type ProductStatus =
  | "draft"
  | "published"
  | "hidden"
  | "archived"
  | "scheduled"
  | "preorder"
  | "out_of_stock";


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
  sold_count?: number | null; wishlist_count?: number | null;
  price_inr?: number | string | null; compare_price_inr?: number | string | null;
  price_usd?: number | string | null; compare_price_usd?: number | string | null;
  india_visible?: boolean | null; international_visible?: boolean | null;
  warranty?: string | null;
  status?: string | null;
  cost_price_inr?: number | string | null; cost_price_usd?: number | string | null;
  shipping_fee_inr?: number | string | null; shipping_fee_usd?: number | string | null;
  razorpay_enabled?: boolean | null; stripe_enabled?: boolean | null; paypal_enabled?: boolean | null;
  cod_enabled?: boolean | null; return_eligible?: boolean | null; replacement_eligible?: boolean | null;
  return_window_days?: number | null; pickup_supported?: boolean | null;
  international_shipping?: boolean | null; fragile?: boolean | null;
  customs_info?: string | null; barcode?: string | null;
  warehouse_location?: string | null; restock_eta?: string | null;
  preorder?: boolean | null; reserved_quantity?: number | null;
  scheduled_publish_at?: string | null; scheduled_expiry_at?: string | null;
};

const num = (v: number | string | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);

export function rowToProduct(r: Row): Product {
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
    soldCount: r.sold_count ?? 0,
    wishlistCount: r.wishlist_count ?? 0,
    priceInr: num(r.price_inr),
    comparePriceInr: num(r.compare_price_inr),
    priceUsd: num(r.price_usd),
    comparePriceUsd: num(r.compare_price_usd),
    indiaVisible: r.india_visible ?? true,
    internationalVisible: r.international_visible ?? true,
    warranty: r.warranty ?? "12 months",
    status: (r.status as ProductStatus) ?? "published",
    costPriceInr: num(r.cost_price_inr),
    costPriceUsd: num(r.cost_price_usd),
    shippingFeeInr: Number(r.shipping_fee_inr ?? 0),
    shippingFeeUsd: Number(r.shipping_fee_usd ?? 0),
    razorpayEnabled: r.razorpay_enabled ?? true,
    stripeEnabled: r.stripe_enabled ?? true,
    paypalEnabled: r.paypal_enabled ?? false,
    codEnabled: r.cod_enabled ?? true,
    returnEligible: r.return_eligible ?? true,
    replacementEligible: r.replacement_eligible ?? true,
    returnWindowDays: r.return_window_days ?? 7,
    pickupSupported: r.pickup_supported ?? true,
    internationalShipping: r.international_shipping ?? true,
    fragile: r.fragile ?? false,
    customsInfo: r.customs_info ?? "",
    barcode: r.barcode ?? "",
    warehouseLocation: r.warehouse_location ?? "",
    restockEta: r.restock_eta ?? "",
    preorder: r.preorder ?? false,
    reservedQuantity: r.reserved_quantity ?? 0,
    scheduledPublishAt: r.scheduled_publish_at ?? null,
    scheduledExpiryAt: r.scheduled_expiry_at ?? null,
  };
}

const SELECT_COLS = "slug,name,tagline,category,price,rating,reviews,image,description,in_stock,discount,featured,sku,stock_quantity,low_stock_threshold,views_count,created_at,sold_count,wishlist_count,price_inr,compare_price_inr,price_usd,compare_price_usd,india_visible,international_visible,warranty,status,cost_price_inr,cost_price_usd,shipping_fee_inr,shipping_fee_usd,razorpay_enabled,stripe_enabled,paypal_enabled,cod_enabled,return_eligible,replacement_eligible,return_window_days,pickup_supported,international_shipping,fragile,customs_info,barcode,warehouse_location,restock_eta,preorder,reserved_quantity,scheduled_publish_at,scheduled_expiry_at";


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
