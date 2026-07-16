import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { type BadgeSettings, DEFAULT_BADGE_SETTINGS } from "./badges";

type Row = {
  trending_enabled: boolean;
  trending_views_min: number;
  trending_wishlist_min: number;
  bestseller_enabled: boolean;
  bestseller_sales_min: number;
  fast_selling_enabled: boolean;
  fast_selling_per_day_min: number | string;
  limited_stock_enabled: boolean;
  limited_stock_max: number;
  new_arrival_enabled: boolean;
  new_arrival_days: number;
  hot_deal_enabled: boolean;
  hot_deal_discount_min: number;
  max_badges: number;
};

function rowToSettings(r: Row): BadgeSettings {
  return {
    trendingEnabled: r.trending_enabled,
    trendingViewsMin: r.trending_views_min,
    trendingWishlistMin: r.trending_wishlist_min,
    bestsellerEnabled: r.bestseller_enabled,
    bestsellerSalesMin: r.bestseller_sales_min,
    newArrivalEnabled: r.new_arrival_enabled,
    newArrivalDays: r.new_arrival_days,
    hotDealEnabled: r.hot_deal_enabled,
    hotDealDiscountMin: r.hot_deal_discount_min,
    maxBadges: r.max_badges,
  };
}

function settingsToRow(s: BadgeSettings) {
  return {
    trending_enabled: s.trendingEnabled,
    trending_views_min: s.trendingViewsMin,
    trending_wishlist_min: s.trendingWishlistMin,
    bestseller_enabled: s.bestsellerEnabled,
    bestseller_sales_min: s.bestsellerSalesMin,
    new_arrival_enabled: s.newArrivalEnabled,
    new_arrival_days: s.newArrivalDays,
    hot_deal_enabled: s.hotDealEnabled,
    hot_deal_discount_min: s.hotDealDiscountMin,
    max_badges: s.maxBadges,
  };
}

let cache: BadgeSettings | null = null;
let inflight: Promise<BadgeSettings> | null = null;
const subscribers = new Set<(s: BadgeSettings) => void>();
let realtimeBound = false;

function bindRealtime() {
  if (realtimeBound || typeof window === "undefined") return;
  realtimeBound = true;
  supabase
    .channel("rt-badge-settings")
    .on("postgres_changes", { event: "*", schema: "public", table: "badge_settings" }, () => {
      cache = null;
      load(true);
    })
    .subscribe();
}

async function load(force = false): Promise<BadgeSettings> {
  if (cache && !force) return cache;
  if (!inflight) {
    inflight = (async () => {
      const { data } = await supabase
        .from("badge_settings")
        .select("*")
        .eq("id", true)
        .maybeSingle();
      const s = data ? rowToSettings(data as Row) : DEFAULT_BADGE_SETTINGS;
      cache = s;
      inflight = null;
      subscribers.forEach((fn) => fn(s));
      return s;
    })();
  }
  return inflight;
}

export function useBadgeSettings() {
  const [settings, setSettings] = useState<BadgeSettings>(cache ?? DEFAULT_BADGE_SETTINGS);
  useEffect(() => {
    bindRealtime();
    let active = true;
    const sub = (s: BadgeSettings) => active && setSettings(s);
    subscribers.add(sub);
    load().then((s) => active && setSettings(s));
    return () => {
      active = false;
      subscribers.delete(sub);
    };
  }, []);
  return settings;
}

export async function saveBadgeSettings(s: BadgeSettings): Promise<void> {
  const { error } = await supabase
    .from("badge_settings")
    .update(settingsToRow(s))
    .eq("id", true);
  if (error) throw new Error(error.message);
  cache = s;
  subscribers.forEach((fn) => fn(s));
}
