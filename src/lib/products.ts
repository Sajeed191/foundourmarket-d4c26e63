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
  ratingSource?: string;
  image: string;
  description: string;
  inStock: boolean;
  discount?: number;
  featured: boolean;
  sku?: string | null;
  // SEO (auto-generated, manual edits preserved)
  seoTitle?: string | null;
  seoDescription?: string | null;
  metaKeywords?: string[];
  brand?: string | null;
  productType?: string | null;
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
  // Merchandising flags
  trending: boolean;
  bestseller: boolean;
  newArrival: boolean;
  hotDeal: boolean;
  flashDeal: boolean;
  staffPick: boolean;
  recommended: boolean;
  homepageHero: boolean;
  giftIdea: boolean;
  // Store placement
  homepageSection: string | null;
  isCategoryBanner: boolean;
  hideFromSearch: boolean;
  hideFromRecommendations: boolean;
  homepagePosition: number | null;
  categoryPosition: number | null;
  featuredUntil: string | null;
  // Related merchandising
  relatedProducts: string[];
  crossSellProducts: string[];
  upsellProducts: string[];
  // Manual merchandising labels
  premium: boolean;
  fastSelling: boolean;
  editorsChoice: boolean;
  // Sorting priority within a storefront section (1–100)
  priorityScore: number | null;
  // Named collections a product belongs to
  collections: string[];
  // Analytics
  ordersCount: number;
  revenue: number;
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

/**
 * The single source of truth for the displayed discount badge. Computed
 * directly from the selling price and the compare ("original") price so the
 * percentage shown ALWAYS matches the real price difference — there is no
 * manual percentage entry and no hardcoded value. Returns null when there is
 * no genuine discount (no/invalid compare price, or compare <= selling).
 *
 *   discount% = round((compare - price) / compare * 100)
 */
export function discountPercent(
  price: number,
  comparePrice: number | null | undefined,
): number | null {
  if (comparePrice == null) return null;
  if (!(comparePrice > 0) || !(price >= 0)) return null;
  if (comparePrice <= price) return null;
  const pct = Math.round(((comparePrice - price) / comparePrice) * 100);
  return pct > 0 ? pct : null;
}

type Row = {
  slug: string; name: string; tagline: string | null; category: string;
  price: number | string; rating: number | string; reviews: number; rating_source?: string | null;
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
  trending?: boolean | null; bestseller?: boolean | null; new_arrival?: boolean | null;
  hot_deal?: boolean | null; flash_deal?: boolean | null; staff_pick?: boolean | null;
  recommended?: boolean | null; homepage_hero?: boolean | null; gift_idea?: boolean | null;
  homepage_section?: string | null; is_category_banner?: boolean | null;
  hide_from_search?: boolean | null; hide_from_recommendations?: boolean | null;
  homepage_position?: number | null; category_position?: number | null;
  featured_until?: string | null;
  related_products?: string[] | null; cross_sell_products?: string[] | null;
  upsell_products?: string[] | null;
  orders_count?: number | null; revenue?: number | string | null;
  premium?: boolean | null; fast_selling?: boolean | null; editors_choice?: boolean | null;
  priority_score?: number | null; collections?: string[] | null;
  seo_title?: string | null; seo_description?: string | null;
  meta_keywords?: string[] | null; brand?: string | null; product_type?: string | null;
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
    ratingSource: r.rating_source ?? undefined,
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
    returnWindowDays: r.return_window_days ?? 4,
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
    trending: r.trending ?? false,
    bestseller: r.bestseller ?? false,
    newArrival: r.new_arrival ?? false,
    hotDeal: r.hot_deal ?? false,
    flashDeal: r.flash_deal ?? false,
    staffPick: r.staff_pick ?? false,
    recommended: r.recommended ?? false,
    homepageHero: r.homepage_hero ?? false,
    giftIdea: r.gift_idea ?? false,
    homepageSection: r.homepage_section ?? null,
    isCategoryBanner: r.is_category_banner ?? false,
    hideFromSearch: r.hide_from_search ?? false,
    hideFromRecommendations: r.hide_from_recommendations ?? false,
    homepagePosition: r.homepage_position ?? null,
    categoryPosition: r.category_position ?? null,
    featuredUntil: r.featured_until ?? null,
    relatedProducts: r.related_products ?? [],
    crossSellProducts: r.cross_sell_products ?? [],
    upsellProducts: r.upsell_products ?? [],
    ordersCount: r.orders_count ?? 0,
    revenue: Number(r.revenue ?? 0),
    premium: r.premium ?? false,
    fastSelling: r.fast_selling ?? false,
    editorsChoice: r.editors_choice ?? false,
    priorityScore: r.priority_score ?? null,
    collections: r.collections ?? [],
  };
}

// Public catalog columns only — sensitive fields (cost, cost prices, barcode,
// warehouse_location, admin_notes) are NOT exposed via the products_public view.
const SELECT_COLS = "slug,name,tagline,category,price,rating,reviews,rating_source,image,description,in_stock,discount,featured,sku,stock_quantity,low_stock_threshold,views_count,created_at,sold_count,wishlist_count,price_inr,compare_price_inr,price_usd,compare_price_usd,india_visible,international_visible,warranty,status,shipping_fee_inr,shipping_fee_usd,razorpay_enabled,stripe_enabled,paypal_enabled,cod_enabled,return_eligible,replacement_eligible,return_window_days,pickup_supported,international_shipping,fragile,customs_info,restock_eta,preorder,reserved_quantity,scheduled_publish_at,scheduled_expiry_at,trending,bestseller,new_arrival,hot_deal,flash_deal,staff_pick,recommended,homepage_hero,gift_idea,homepage_section,is_category_banner,hide_from_search,hide_from_recommendations,homepage_position,category_position,featured_until,related_products,cross_sell_products,upsell_products,premium,fast_selling,editors_choice,priority_score,collections";


export async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products_public")
    .select(SELECT_COLS)
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return (data as Row[]).map(rowToProduct);
}

export async function fetchProductsBySlugs(slugs: string[]): Promise<Product[]> {
  if (!slugs.length) return [];
  const { data } = await supabase.from("products_public").select(SELECT_COLS).in("slug", slugs);
  const map = new Map((data as Row[] ?? []).map((r) => [r.slug, rowToProduct(r)]));
  return slugs.map((s) => map.get(s)).filter((p): p is Product => !!p);
}

export async function fetchProduct(slug: string): Promise<Product | null> {
  const { data } = await supabase
    .from("products_public")
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
    .from("product_variants_public")
    .select("id,name,price_override,stock_quantity,sort_order")
    .eq("product_slug", slug)
    .order("sort_order", { ascending: true });
  return (data ?? []).map((r: any) => ({
    id: r.id, name: r.name, sku: null,
    priceOverride: r.price_override != null ? Number(r.price_override) : null,
    stockQuantity: r.stock_quantity, sortOrder: r.sort_order,
  }));
}
