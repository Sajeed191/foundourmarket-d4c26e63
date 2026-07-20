/**
 * Site Rules Controller — client hook + persistence for the marketplace
 * behavior rules stored in `public.site_rules` (jsonb per rule key).
 *
 * This file owns ONE rule today: `homepage_collections`. It is deliberately
 * generic so future rule keys (search, reviews, SEO, etc.) can be layered on
 * without another table.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type HomepageCollectionKey =
  | "flash_deals"
  | "trending"
  | "best_sellers"
  | "new_arrivals"
  | "featured";

export type HomepageCollectionRules = {
  limits: Record<HomepageCollectionKey, number>;
  /** How often the fair-rotation window advances (hours). */
  rotationHours: number;
  /** IST wall-clock times when the daily reshuffle nonce is bumped. */
  reshuffleTimesIst: string[];
  /** Master switch for automatic reshuffles. */
  reshuffleEnabled: boolean;
};

export const DEFAULT_HOMEPAGE_RULES: HomepageCollectionRules = {
  limits: {
    flash_deals: 10,
    trending: 50,
    best_sellers: 50,
    new_arrivals: 50,
    featured: 50,
  },
  rotationHours: 2,
  reshuffleTimesIst: ["06:00", "12:00", "18:00", "00:00"],
  reshuffleEnabled: true,
};

export const ROTATION_HOUR_OPTIONS = [1, 2, 4, 6, 12, 24] as const;

function coerce(raw: unknown): HomepageCollectionRules {
  const src = (raw ?? {}) as Partial<HomepageCollectionRules> & {
    limits?: Partial<Record<HomepageCollectionKey, number>>;
  };
  const limits = { ...DEFAULT_HOMEPAGE_RULES.limits };
  if (src.limits && typeof src.limits === "object") {
    for (const k of Object.keys(limits) as HomepageCollectionKey[]) {
      const v = Number(src.limits[k]);
      if (Number.isFinite(v) && v > 0) limits[k] = Math.min(500, Math.floor(v));
    }
  }
  const hours = Number(src.rotationHours);
  const rotationHours =
    ROTATION_HOUR_OPTIONS.find((h) => h === hours) ?? DEFAULT_HOMEPAGE_RULES.rotationHours;
  const times = Array.isArray(src.reshuffleTimesIst)
    ? src.reshuffleTimesIst
        .filter((t): t is string => typeof t === "string" && /^\d{2}:\d{2}$/.test(t))
        .slice(0, 12)
    : DEFAULT_HOMEPAGE_RULES.reshuffleTimesIst;
  return {
    limits,
    rotationHours,
    reshuffleTimesIst: times.length > 0 ? times : DEFAULT_HOMEPAGE_RULES.reshuffleTimesIst,
    reshuffleEnabled: src.reshuffleEnabled !== false,
  };
}

// Module-level cache + realtime subscribers (mirrors use-badge-settings).
let cache: HomepageCollectionRules | null = null;
let inflight: Promise<HomepageCollectionRules> | null = null;
const subs = new Set<(r: HomepageCollectionRules) => void>();
let realtimeBound = false;

function bindRealtime() {
  if (realtimeBound || typeof window === "undefined") return;
  realtimeBound = true;
  supabase
    .channel(`rt-site-rules-${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "site_rules", filter: "key=eq.homepage_collections" },
      () => {
        cache = null;
        void load(true);
      },
    )
    .subscribe();
}

async function load(force = false): Promise<HomepageCollectionRules> {
  if (cache && !force) return cache;
  if (!inflight) {
    inflight = (async () => {
      const { data } = await supabase
        .from("site_rules")
        .select("value")
        .eq("key", "homepage_collections")
        .maybeSingle();
      const rules = coerce((data as { value?: unknown } | null)?.value);
      cache = rules;
      inflight = null;
      subs.forEach((fn) => fn(rules));
      return rules;
    })();
  }
  return inflight;
}

export function useHomepageCollectionRules(): HomepageCollectionRules {
  const [rules, setRules] = useState<HomepageCollectionRules>(
    cache ?? DEFAULT_HOMEPAGE_RULES,
  );
  useEffect(() => {
    bindRealtime();
    let active = true;
    const sub = (r: HomepageCollectionRules) => active && setRules(r);
    subs.add(sub);
    load().then((r) => active && setRules(r));
    return () => {
      active = false;
      subs.delete(sub);
    };
  }, []);
  return rules;
}

export async function saveHomepageCollectionRules(
  rules: HomepageCollectionRules,
): Promise<void> {
  const normalized = coerce(rules);
  const { error } = await supabase
    .from("site_rules")
    .upsert({ key: "homepage_collections", value: normalized }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  cache = normalized;
  subs.forEach((fn) => fn(normalized));
}
