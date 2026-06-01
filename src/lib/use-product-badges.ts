import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AutoRule = {
  metric: "sales" | "age_days" | "stock" | "conversion" | "rating" | "views";
  op: ">" | "<" | ">=" | "<=";
  value: number;
  enabled: boolean;
} | null;

export type BadgeAnimation =
  | "none" | "pulse" | "bounce" | "shine" | "glow" | "float" | "slide" | "flash";

export const BADGE_ANIMATIONS: BadgeAnimation[] = [
  "none", "pulse", "bounce", "shine", "glow", "float", "slide", "flash",
];

export const BADGE_CATEGORIES = [
  "Sales", "Trending", "Inventory", "Premium", "Seasonal", "Trust", "Marketing", "Custom",
] as const;

/** Maps a badge animation to its CSS utility class (defined in styles.css). */
export function badgeAnimationClass(a: BadgeAnimation | string | undefined): string {
  switch (a) {
    case "pulse": return "badge-anim-pulse";
    case "bounce": return "badge-anim-bounce";
    case "shine": return "badge-anim-shine";
    case "glow": return "badge-anim-glow";
    case "float": return "badge-anim-float";
    case "slide": return "badge-anim-slide";
    case "flash": return "badge-anim-flash";
    default: return "";
  }
}

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
  description: string;
  backgroundColor: string;
  borderColor: string;
  glowColor: string;
  iconColor: string;
  shadowStrength: number;
  radius: number;
  startAt: string | null;
  endAt: string | null;
  autoRule: AutoRule;
  category: string;
  subtitle: string;
  fontSize: number;
  fontWeight: number;
  animation: BadgeAnimation;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
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
  description?: string | null;
  background_color?: string | null;
  border_color?: string | null;
  glow_color?: string | null;
  icon_color?: string | null;
  shadow_strength?: number | null;
  radius?: number | null;
  start_at?: string | null;
  end_at?: string | null;
  auto_rule?: AutoRule;
  category?: string | null;
  subtitle?: string | null;
  font_size?: number | null;
  font_weight?: number | null;
  animation?: string | null;
  archived?: boolean | null;
  created_at?: string;
  updated_at?: string;
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
    description: r.description ?? "",
    backgroundColor: r.background_color || r.color,
    borderColor: r.border_color ?? "",
    glowColor: r.glow_color ?? "",
    iconColor: r.icon_color ?? "",
    shadowStrength: r.shadow_strength ?? 0,
    radius: r.radius ?? 6,
    startAt: r.start_at ?? null,
    endAt: r.end_at ?? null,
    autoRule: (r.auto_rule as AutoRule) ?? null,
    category: r.category ?? "Custom",
    subtitle: r.subtitle ?? "",
    fontSize: r.font_size ?? 11,
    fontWeight: r.font_weight ?? 700,
    animation: (r.animation as BadgeAnimation) ?? "none",
    archived: r.archived ?? false,
    createdAt: r.created_at ?? "",
    updatedAt: r.updated_at ?? "",
  };
}

/** A scheduled badge is live only inside its [startAt, endAt] window. */
export function isBadgeLive(b: BadgeType, now = Date.now()): boolean {
  if (!b.enabled) return false;
  if (b.startAt && new Date(b.startAt).getTime() > now) return false;
  if (b.endAt && new Date(b.endAt).getTime() < now) return false;
  return true;
}

export function badgeScheduleState(b: BadgeType, now = Date.now()): "scheduled" | "expired" | "live" | "disabled" {
  if (!b.enabled) return "disabled";
  if (b.startAt && new Date(b.startAt).getTime() > now) return "scheduled";
  if (b.endAt && new Date(b.endAt).getTime() < now) return "expired";
  return "live";
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
        if (!t) continue;
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

/** Returns live, scheduled-aware badges for a single product slug (storefront cards). */
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
  const list = snap?.map.get(slug) ?? [];
  return list.filter((b) => isBadgeLive(b));
}

/** Full badge catalog + per-product assignment map (admin tooling). */
export function useBadgeCatalog() {
  const [snap, setSnap] = useState<Snapshot>(cache ?? { types: [], map: new Map() });
  const [loading, setLoading] = useState(!cache);
  useEffect(() => {
    bindRealtime();
    let active = true;
    const sub = (s: Snapshot) => active && setSnap(s);
    subscribers.add(sub);
    load().then((s) => {
      if (!active) return;
      setSnap(s);
      setLoading(false);
    });
    return () => {
      active = false;
      subscribers.delete(sub);
    };
  }, []);
  return { ...snap, loading };
}

export async function refreshBadges() {
  await load(true);
}

// ---- Badge type CRUD (RLS enforces staff-only) ----
export type BadgeTypeInput = {
  badgeKey: string;
  label: string;
  emoji: string;
  color: string;
  textColor: string;
  backgroundColor: string;
  borderColor: string;
  glowColor: string;
  iconColor: string;
  shadowStrength: number;
  radius: number;
  priority: number;
  description: string;
  enabled: boolean;
  isDiscount: boolean;
  startAt: string | null;
  endAt: string | null;
  autoRule: AutoRule;
  category: string;
  subtitle: string;
  fontSize: number;
  fontWeight: number;
  animation: BadgeAnimation;
};

function inputToRow(input: BadgeTypeInput) {
  return {
    badge_key: input.badgeKey,
    label: input.label,
    emoji: input.emoji,
    color: input.color,
    text_color: input.textColor,
    background_color: input.backgroundColor,
    border_color: input.borderColor,
    glow_color: input.glowColor,
    icon_color: input.iconColor,
    shadow_strength: input.shadowStrength,
    radius: input.radius,
    priority: input.priority,
    description: input.description,
    enabled: input.enabled,
    is_discount: input.isDiscount,
    start_at: input.startAt,
    end_at: input.endAt,
    auto_rule: input.autoRule,
    category: input.category,
    subtitle: input.subtitle,
    font_size: input.fontSize,
    font_weight: input.fontWeight,
    animation: input.animation,
  };
}

export async function createBadgeType(input: BadgeTypeInput) {
  const { error } = await supabase.from("badge_types").insert(inputToRow(input) as never);
  if (error) throw new Error(error.message);
  await load(true);
}

export async function updateBadgeTypeFull(id: string, input: BadgeTypeInput) {
  const { error } = await supabase.from("badge_types").update(inputToRow(input) as never).eq("id", id);
  if (error) throw new Error(error.message);
  await load(true);
}

export async function deleteBadgeType(id: string) {
  const { error } = await supabase.from("badge_types").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await load(true);
}

export async function setBadgeEnabled(id: string, enabled: boolean) {
  const { error } = await supabase.from("badge_types").update({ enabled } as never).eq("id", id);
  if (error) throw new Error(error.message);
  await load(true);
}

export async function reorderBadgeTypes(orderedIds: string[]) {
  // Highest priority first → assign descending priority numbers.
  const n = orderedIds.length;
  await Promise.all(
    orderedIds.map((id, i) =>
      supabase.from("badge_types").update({ priority: (n - i) * 5 } as never).eq("id", id),
    ),
  );
  await load(true);
}

export async function duplicateBadgeType(b: BadgeType) {
  const base = b.badgeKey.replace(/-copy(-\d+)?$/, "");
  const input: BadgeTypeInput = {
    badgeKey: `${base}-copy-${Math.random().toString(36).slice(2, 6)}`,
    label: `${b.label} (Copy)`,
    emoji: b.emoji,
    color: b.color,
    textColor: b.textColor,
    backgroundColor: b.backgroundColor,
    borderColor: b.borderColor,
    glowColor: b.glowColor,
    iconColor: b.iconColor,
    shadowStrength: b.shadowStrength,
    radius: b.radius,
    priority: b.priority,
    description: b.description,
    enabled: false,
    isDiscount: b.isDiscount,
    startAt: b.startAt,
    endAt: b.endAt,
    autoRule: b.autoRule,
    category: b.category,
    subtitle: b.subtitle,
    fontSize: b.fontSize,
    fontWeight: b.fontWeight,
    animation: b.animation,
  };
  await createBadgeType(input);
}

export async function setBadgeArchived(id: string, archived: boolean) {
  const { error } = await supabase.from("badge_types").update({ archived } as never).eq("id", id);
  if (error) throw new Error(error.message);
  await load(true);
}

// ---- Admin assignment mutations ----
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
  const { error } = await supabase.from("badge_types").update(patch as never).eq("id", id);
  if (error) throw new Error(error.message);
  await load(true);
}

// ---- Click analytics ----
export function trackBadgeClick(badgeTypeId: string, slug: string) {
  if (typeof window === "undefined") return;
  void supabase
    .from("badge_events")
    .insert({ badge_type_id: badgeTypeId, product_slug: slug, event_type: "click" } as never);
}
