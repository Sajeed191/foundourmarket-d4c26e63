import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Category = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  image: string | null;
  sort_order: number;
};

let cache: Category[] | null = null;
let inflight: Promise<Category[]> | null = null;
const subscribers = new Set<(c: Category[]) => void>();

export async function loadCategories(force = false): Promise<Category[]> {
  if (cache && !force) return cache;
  if (!inflight) {
    inflight = (async () => {
      const { data } = await supabase
        .from("categories")
        .select("id,slug,name,description,image,sort_order")
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
    const sub = (c: Category[]) => { if (active) setCategories(c); };
    subscribers.add(sub);
    loadCategories().then((c) => { if (active) { setCategories(c); setLoading(false); } });
    return () => { active = false; subscribers.delete(sub); };
  }, []);
  return { categories, loading };
}
