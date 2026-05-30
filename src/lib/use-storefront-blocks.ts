import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/components/admin/AdminShell";

export type BlockType =
  | "hero"
  | "banner_carousel"
  | "announcement_bar"
  | "featured_products"
  | "new_arrivals"
  | "trending_products"
  | "flash_sales"
  | "testimonials"
  | "trust"
  | "category_showcase"
  | "blog"
  | "custom_html"
  | "spacer"
  | "faq"
  | "newsletter";

export type BlockStatus = "draft" | "published" | "archived";
export type BlockRegion = "all" | "india" | "international";

export interface StorefrontBlock {
  id: string;
  type: BlockType;
  title: string;
  subtitle: string;
  sort_order: number;
  status: BlockStatus;
  region: BlockRegion;
  publish_at: string | null;
  unpublish_at: string | null;
  config: Record<string, any>;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const BLOCK_TYPE_META: Record<
  BlockType,
  { label: string; icon: string; desc: string; defaultConfig?: Record<string, any> }
> = {
  hero: { label: "Hero", icon: "Sparkles", desc: "Big headline + call-to-action" },
  banner_carousel: { label: "Banner Carousel", icon: "GalleryHorizontal", desc: "Rotating promo banners" },
  announcement_bar: { label: "Announcement Bar", icon: "Megaphone", desc: "Slim notice strip" },
  featured_products: { label: "Featured Products", icon: "Star", desc: "Hand-picked products", defaultConfig: { limit: 8, sort: "manual", slugs: [] } },
  new_arrivals: { label: "New Arrivals", icon: "PackagePlus", desc: "Latest products", defaultConfig: { limit: 8, sort: "newest" } },
  trending_products: { label: "Trending Products", icon: "Flame", desc: "Hot right now", defaultConfig: { limit: 8, sort: "trending" } },
  flash_sales: { label: "Flash Sales", icon: "Zap", desc: "Live flash-sale strip" },
  testimonials: { label: "Testimonials", icon: "Quote", desc: "Customer reviews carousel" },
  trust: { label: "Trust Section", icon: "ShieldCheck", desc: "Guarantees & badges" },
  category_showcase: { label: "Category Showcase", icon: "LayoutGrid", desc: "Featured categories", defaultConfig: { limit: 8, style: "grid" } },
  blog: { label: "Blog Section", icon: "Newspaper", desc: "Latest journal posts", defaultConfig: { limit: 3 } },
  custom_html: { label: "Custom HTML", icon: "Code", desc: "Free-form rich content", defaultConfig: { html: "" } },
  spacer: { label: "Spacer", icon: "Minus", desc: "Vertical spacing", defaultConfig: { height: 48 } },
  faq: { label: "FAQ Section", icon: "HelpCircle", desc: "Question & answer list", defaultConfig: { items: [] } },
  newsletter: { label: "Newsletter", icon: "Mail", desc: "Email capture block" },
};

export const BLOCK_TYPES = Object.keys(BLOCK_TYPE_META) as BlockType[];

/** Whether a block is visible to a customer in the given region right now. */
export function isBlockLive(
  b: StorefrontBlock,
  region: BlockRegion | "all",
  now: Date = new Date(),
): boolean {
  if (b.status !== "published" || !b.active) return false;
  if (b.publish_at && new Date(b.publish_at) > now) return false;
  if (b.unpublish_at && new Date(b.unpublish_at) <= now) return false;
  if (b.region !== "all" && region !== "all" && b.region !== region) return false;
  return true;
}

let cache: StorefrontBlock[] | null = null;
const subscribers = new Set<(b: StorefrontBlock[]) => void>();

function sortBlocks(rows: StorefrontBlock[]) {
  return [...rows].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
}

async function load(): Promise<StorefrontBlock[]> {
  const { data } = await (supabase.from("storefront_blocks" as any) as any)
    .select("*")
    .order("sort_order", { ascending: true });
  const rows = sortBlocks(((data as StorefrontBlock[]) ?? []));
  cache = rows;
  subscribers.forEach((s) => s(rows));
  return rows;
}

let realtimeBound = false;
function bindRealtime() {
  if (realtimeBound || typeof window === "undefined") return;
  realtimeBound = true;
  supabase
    .channel("rt-storefront-blocks")
    .on("postgres_changes", { event: "*", schema: "public", table: "storefront_blocks" }, () => load())
    .subscribe();
}

/**
 * Live storefront blocks feed. Staff receive every block (draft/archived
 * included via RLS); customers only ever receive published+active rows.
 */
export function useStorefrontBlocks() {
  const [blocks, setBlocks] = useState<StorefrontBlock[]>(cache ?? []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    bindRealtime();
    let active = true;
    const sub = (b: StorefrontBlock[]) => { if (active) setBlocks(b); };
    subscribers.add(sub);
    if (cache) { setBlocks(cache); setLoading(false); }
    load().then(() => { if (active) setLoading(false); });
    return () => { active = false; subscribers.delete(sub); };
  }, []);

  return { blocks, loading, reload: load };
}

const table = () => supabase.from("storefront_blocks" as any) as any;

export async function createBlock(
  type: BlockType,
  partial: Partial<StorefrontBlock> = {},
): Promise<StorefrontBlock | null> {
  const { data: auth } = await supabase.auth.getUser();
  const maxOrder = (cache ?? []).reduce((m, b) => Math.max(m, b.sort_order), 0);
  const meta = BLOCK_TYPE_META[type];
  const payload = {
    type,
    title: partial.title ?? meta.label,
    subtitle: partial.subtitle ?? "",
    sort_order: partial.sort_order ?? maxOrder + 1,
    status: partial.status ?? "draft",
    region: partial.region ?? "all",
    publish_at: partial.publish_at ?? null,
    unpublish_at: partial.unpublish_at ?? null,
    config: partial.config ?? meta.defaultConfig ?? {},
    active: partial.active ?? true,
    created_by: auth.user?.id ?? null,
  };
  const { data, error } = await table().insert(payload).select("*").single();
  if (error) throw error;
  logActivity("block_create", "storefront_block", data.id, { type });
  await load();
  return data as StorefrontBlock;
}

export async function updateBlock(id: string, patch: Partial<StorefrontBlock>) {
  const { error } = await table().update(patch).eq("id", id);
  if (error) throw error;
  logActivity("block_update", "storefront_block", id, { fields: Object.keys(patch) });
  await load();
}

export async function deleteBlock(id: string) {
  const { error } = await table().delete().eq("id", id);
  if (error) throw error;
  logActivity("block_delete", "storefront_block", id);
  await load();
}

export async function duplicateBlock(b: StorefrontBlock) {
  const dup = await createBlock(b.type, {
    title: `${b.title} (copy)`,
    subtitle: b.subtitle,
    region: b.region,
    config: b.config,
    active: b.active,
    status: "draft",
    sort_order: b.sort_order + 1,
  });
  logActivity("block_duplicate", "storefront_block", dup?.id, { from: b.id });
  return dup;
}

export async function setBlockStatus(id: string, status: BlockStatus) {
  await updateBlock(id, { status });
  logActivity(`block_${status}`, "storefront_block", id);
}

export async function toggleBlockActive(id: string, active: boolean) {
  await updateBlock(id, { active });
}

/** Persist a new ordering. `orderedIds` is the full list top→bottom. */
export async function reorderBlocks(orderedIds: string[]) {
  await Promise.all(
    orderedIds.map((id, i) => table().update({ sort_order: i + 1 }).eq("id", id)),
  );
  logActivity("block_reorder", "storefront_block", undefined, { count: orderedIds.length });
  await load();
}
