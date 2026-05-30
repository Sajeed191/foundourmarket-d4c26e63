import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type HomepageSection = {
  key: string;
  eyebrow: string;
  title: string;
  active: boolean;
};

export type SectionMap = Record<string, HomepageSection>;

const DEFAULTS: SectionMap = {
  trending: { key: "trending", eyebrow: "Hot Right Now", title: "Trending Products", active: true },
  recommended: { key: "recommended", eyebrow: "Curated For You", title: "Recommended Products", active: true },
  new_arrivals: { key: "new_arrivals", eyebrow: "Just Landed", title: "New Arrivals", active: true },
};

let cache: SectionMap | null = null;
const subscribers = new Set<(m: SectionMap) => void>();

async function load(): Promise<SectionMap> {
  const { data } = await supabase
    .from("homepage_sections")
    .select("key,eyebrow,title,active");
  const map: SectionMap = { ...DEFAULTS };
  (data ?? []).forEach((row: { key: string; eyebrow: string; title: string; active?: boolean | null }) => {
    map[row.key] = { key: row.key, eyebrow: row.eyebrow, title: row.title, active: row.active ?? true };
  });
  cache = map;
  subscribers.forEach((s) => s(map));
  return map;
}

let realtimeBound = false;
function bindRealtime() {
  if (realtimeBound || typeof window === "undefined") return;
  realtimeBound = true;
  supabase
    .channel("rt-homepage-sections")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "homepage_sections" },
      () => load(),
    )
    .subscribe();
}

/**
 * Live homepage section headings (eyebrow + title) for the product rails.
 * Public read; admin writes go through saveHomepageSection. Falls back to
 * sensible defaults when a row is missing.
 */
export function useHomepageSections() {
  const [sections, setSections] = useState<SectionMap>(cache ?? DEFAULTS);

  useEffect(() => {
    bindRealtime();
    let active = true;
    const sub = (m: SectionMap) => { if (active) setSections(m); };
    subscribers.add(sub);
    if (cache) setSections(cache);
    else load();
    return () => { active = false; subscribers.delete(sub); };
  }, []);

  return { sections };
}

export async function saveHomepageSection(
  key: string,
  patch: { eyebrow: string; title: string; active: boolean },
) {
  const { error } = await supabase
    .from("homepage_sections")
    .upsert(
      { key, eyebrow: patch.eyebrow, title: patch.title, active: patch.active },
      { onConflict: "key" },
    );
  if (error) throw error;
  await load();
}
