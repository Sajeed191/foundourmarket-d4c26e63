import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CategoryStatus = "draft" | "published" | "hidden" | "archived";
export type CategoryRegion = "all" | "india" | "international";

export type Category = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  image: string | null;
  sort_order: number;
  status: CategoryStatus;
  featured: boolean;
  trending: boolean;
  homepage_visible: boolean;
  icon: string | null;
  banner_image: string | null;
  mobile_image: string | null;
  seo_title: string | null;
  seo_description: string | null;
  region: CategoryRegion;
  views: number;
  clicks: number;
};

export const CATEGORY_COLUMNS =
  "id,slug,name,description,image,sort_order,status,featured,trending,homepage_visible,icon,banner_image,mobile_image,seo_title,seo_description,region,views,clicks";

let cache: Category[] | null = null;
let inflight: Promise<Category[]> | null = null;
const subscribers = new Set<(c: Category[]) => void>();
let realtimeBound = false;

function bindRealtime() {
  if (realtimeBound) return;
  realtimeBound = true;
  supabase
    .channel("categories-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, () => {
      invalidateCategories();
      if (adminCache !== null) loadAdminCategories(true);
    })
    .subscribe();
}

/** Storefront loader — only published, homepage-visible categories. */
export async function loadCategories(force = false): Promise<Category[]> {
  if (cache && !force) return cache;
  if (!inflight) {
    inflight = (async () => {
      const { data } = await supabase
        .from("categories")
        .select(CATEGORY_COLUMNS)
        .eq("status", "published")
        .eq("homepage_visible", true)
        .order("sort_order", { ascending: true });
      const list = (data as Category[] | null) ?? [];
      cache = list;
      inflight = null;
      subscribers.forEach((s) => s(list));
      return list;
    })();
  }
  return inflight;
}

export function invalidateCategories() {
  cache = null;
  loadCategories(true);
}

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>(cache ?? []);
  const [loading, setLoading] = useState(!cache);
  useEffect(() => {
    let active = true;
    bindRealtime();
    const sub = (c: Category[]) => {
      if (active) setCategories(c);
    };
    subscribers.add(sub);
    loadCategories().then((c) => {
      if (active) {
        setCategories(c);
        setLoading(false);
      }
    });
    return () => {
      active = false;
      subscribers.delete(sub);
    };
  }, []);
  return { categories, loading };
}

/* ----------------------------- Admin overlay ----------------------------- */

let adminCache: Category[] | null = null;
const adminSubscribers = new Set<(c: Category[]) => void>();

/** Admin loader — ALL categories (incl. hidden/draft) so staff can toggle. */
async function loadAdminCategories(force = false): Promise<Category[]> {
  if (adminCache && !force) return adminCache;
  const { data } = await supabase
    .from("categories")
    .select(CATEGORY_COLUMNS)
    .order("sort_order", { ascending: true });
  const list = (data as Category[] | null) ?? [];
  adminCache = list;
  adminSubscribers.forEach((s) => s(list));
  return list;
}

/** Live list of every category for admin surfaces. */
export function useAdminCategories(enabled: boolean) {
  const [categories, setCategories] = useState<Category[]>(adminCache ?? []);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    bindRealtime();
    const sub = (c: Category[]) => { if (active) setCategories(c); };
    adminSubscribers.add(sub);
    loadAdminCategories().then((c) => { if (active) setCategories(c); });
    return () => { active = false; adminSubscribers.delete(sub); };
  }, [enabled]);
  return { categories };
}

/** Flip a category's homepage visibility inline (admin overlay). */
export async function toggleCategoryVisible(id: string, next: boolean) {
  const { error } = await supabase
    .from("categories")
    .update({ homepage_visible: next })
    .eq("id", id);
  if (error) throw error;
  await Promise.all([loadAdminCategories(true), loadCategories(true)]);
}
