import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type BadgeType = {
  id: string;
  badgeKey: string;
  label: string;
  color: string;
  textColor: string;
  emoji: string;
  enabled: boolean;
  priority: number;
  isDiscount: boolean;
};

export type RenderBadge = BadgeType & { sortOrder: number };

type BadgeTypeRow = {
  id: string;
  badge_key: string;
  label: string;
  color: string;
  text_color: string;
  emoji: string;
  enabled: boolean;
  priority: number;
  is_discount: boolean;
};

type AssignmentRow = {
  product_slug: string;
  sort_order: number;
  badge_type_id: string;
};

function rowToType(r: BadgeTypeRow): BadgeType {
  return {
    id: r.id,
    badgeKey: r.badge_key,
    label: r.label,
    color: r.color,
    textColor: r.text_color,
    emoji: r.emoji ?? "",
    enabled: r.enabled,
    priority: r.priority,
    isDiscount: r.is_discount,
  };
}

// ---- module-level cache + pub/sub so the whole grid shares one fetch ----
type Snapshot = { types: BadgeType[]; map: Map<string, RenderBadge[]> };
let cache: Snapshot | null = null;
let inflight: Promise<Snapshot> | null = null;
const subscribers = new Set<(s: Snapshot) => void>();
let realtimeBound = false;

function bindRealtime() {
  if (realtimeBound || typeof window === "undefined") return;
  realtimeBound = true;
  supabase
    .channel("rt-product-badges")
    .on("postgres_changes", { event: "*", schema: "public", table: "badge_types" }, () => load(true))
    .on("postgres_changes", { event: "*", schema: "public", table: "product_badges" }, () => load(true))
    .subscribe();
}

async function load(force = false): Promise<Snapshot> {
  if (cache && !force) return cache;
  if (!inflight || force) {
    inflight = (async () => {
      const [{ data: typeRows }, { data: assignRows }] = await Promise.all([
        supabase.from("badge_types").select("*").order("priority", { ascending: false }),
        supabase.from("product_badges").select("product_slug, sort_order, badge_type_id"),
      ]);
      const types = (typeRows ?? []).map((r) => rowToType(r as BadgeTypeRow));
      const typeById = new Map(types.map((t) => [t.id, t]));
      const map = new Map<string, RenderBadge[]>();
      for (const a of (assignRows ?? []) as AssignmentRow[]) {
        const t = typeById.get(a.badge_type_id);
        if (!t || !t.enabled) continue;
        const list = map.get(a.product_slug) ?? [];
        list.push({ ...t, sortOrder: a.sort_order });
        map.set(a.product_slug, list);
      }
      // Sort each product's badges by sortOrder then priority desc.
      for (const [, list] of map) {
        list.sort((x, y) => x.sortOrder - y.sortOrder || y.priority - x.priority);
      }
      const snap: Snapshot = { types, map };
      cache = snap;
      inflight = null;
      subscribers.forEach((fn) => fn(snap));
      return snap;
    })();
  }
  return inflight;
}

/** Returns assigned badges for a single product slug (storefront cards). */
export function useProductBadges(slug: string): RenderBadge[] {
  const [snap, setSnap] = useState<Snapshot | null>(cache);
  useEffect(() => {
    bindRealtime();
    let active = true;
    const sub = (s: Snapshot) => active && setSnap(s);
    subscribers.add(sub);
    load().then((s) => active && setSnap(s));
    return () => {
      active = false;
      subscribers.delete(sub);
    };
  }, []);
  return snap?.map.get(slug) ?? [];
}

/** Full badge catalog + per-product assignment map (admin tooling). */
export function useBadgeCatalog() {
  const [snap, setSnap] = useState<Snapshot>(cache ?? { types: [], map: new Map() });
  useEffect(() => {
    bindRealtime();
    let active = true;
    const sub = (s: Snapshot) => active && setSnap(s);
    subscribers.add(sub);
    load().then((s) => active && setSnap(s));
    return () => {
      active = false;
      subscribers.delete(sub);
    };
  }, []);
  return snap;
}

export async function refreshBadges() {
  await load(true);
}

// ---- Admin mutations (RLS enforces staff-only) ----
export async function assignBadge(slug: string, badgeTypeId: string) {
  const existing = cache?.map.get(slug) ?? [];
  const sortOrder = existing.length;
  const { error } = await supabase
    .from("product_badges")
    .insert({ product_slug: slug, badge_type_id: badgeTypeId, sort_order: sortOrder });
  if (error) throw new Error(error.message);
  await load(true);
}

export async function unassignBadge(slug: string, badgeTypeId: string) {
  const { error } = await supabase
    .from("product_badges")
    .delete()
    .eq("product_slug", slug)
    .eq("badge_type_id", badgeTypeId);
  if (error) throw new Error(error.message);
  await load(true);
}

export async function reorderProductBadges(slug: string, orderedBadgeTypeIds: string[]) {
  await Promise.all(
    orderedBadgeTypeIds.map((id, i) =>
      supabase
        .from("product_badges")
        .update({ sort_order: i })
        .eq("product_slug", slug)
        .eq("badge_type_id", id),
    ),
  );
  await load(true);
}

export async function updateBadgeType(id: string, patch: Partial<BadgeTypeRow>) {
  const { error } = await supabase.from("badge_types").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  await load(true);
}
