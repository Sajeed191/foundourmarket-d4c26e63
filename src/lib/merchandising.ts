import { supabase } from "@/integrations/supabase/client";

/** A storefront merchandising section, mapped to a boolean flag column. */
export type MerchSection = { key: string; flag: string; label: string };

export const MERCH_SECTIONS: MerchSection[] = [
  { key: "featured", flag: "featured", label: "Featured" },
  { key: "trending", flag: "trending", label: "Trending" },
  { key: "bestseller", flag: "bestseller", label: "Best Sellers" },
  { key: "new_arrival", flag: "new_arrival", label: "New Arrivals" },
  { key: "flash_deal", flag: "flash_deal", label: "Flash Deals" },
  { key: "staff_pick", flag: "staff_pick", label: "Staff Picks" },
  { key: "recommended", flag: "recommended", label: "Recommended" },
  { key: "homepage_hero", flag: "homepage_hero", label: "Homepage Hero" },
];

export const MERCH_FLAGS = MERCH_SECTIONS.map((s) => s.flag);

export type MerchRow = Record<string, any> & {
  id: string;
  slug: string;
  name: string;
  image: string | null;
  created_at: string;
  views_count: number;
  orders_count: number;
  revenue: number;
  sold_count: number;
  priority_score: number | null;
  homepage_position: number | null;
};

export async function fetchMerchProducts(): Promise<MerchRow[]> {
  const { data, error } = await supabase.from("products").select("*");
  if (error) throw error;
  return (data as MerchRow[]) ?? [];
}

export function conversionOf(r: MerchRow): number {
  const v = Number(r.views_count) || 0;
  return v > 0 ? ((Number(r.orders_count) || 0) / v) * 100 : 0;
}

export function hasAnyMerchFlag(r: MerchRow): boolean {
  return MERCH_FLAGS.some((f) => !!r[f]);
}

/** Sort comparator for a section: explicit position first, then priority score. */
export function sectionSort(a: MerchRow, b: MerchRow): number {
  const pa = a.homepage_position, pb = b.homepage_position;
  if (pa != null && pb != null) return pa - pb;
  if (pa != null) return -1;
  if (pb != null) return 1;
  return (Number(b.priority_score) || 0) - (Number(a.priority_score) || 0);
}

/**
 * Persist an explicit ordering: writes homepage_position (index) and a
 * descending priority_score (100 → 0) for each product in order.
 */
export async function persistOrder(ids: string[]): Promise<void> {
  const n = ids.length;
  const denom = Math.max(1, n - 1);
  await Promise.all(
    ids.map((id, i) =>
      supabase
        .from("products")
        .update({
          homepage_position: i,
          priority_score: Math.max(0, 100 - Math.round((i / denom) * 100)),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id),
    ),
  );
}

export async function setFlag(id: string, flag: string, value: boolean): Promise<void> {
  const { error } = await supabase
    .from("products")
    .update({ [flag]: value, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function setFlagBulk(ids: string[], flag: string, value: boolean): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase
    .from("products")
    .update({ [flag]: value, updated_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw error;
}

/** Set a single product as the homepage hero, clearing the flag on all others. */
export async function setHero(id: string): Promise<void> {
  await supabase.from("products").update({ homepage_hero: false }).neq("id", id).eq("homepage_hero", true);
  const { error } = await supabase
    .from("products")
    .update({ homepage_hero: true, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
