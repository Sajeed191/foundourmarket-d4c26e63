import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";

type AppRole =
  | "admin"
  | "super_admin"
  | "manager"
  | "support"
  | "fulfillment"
  | "warehouse_staff"
  | "editor";

const STAFF_ROLES: AppRole[] = [
  "admin",
  "super_admin",
  "manager",
  "support",
  "fulfillment",
  "warehouse_staff",
  "editor",
];

const PRODUCT_ADMIN_ROLES: AppRole[] = ["admin", "super_admin"];

/**
 * Shared role cache. Every admin-aware component (product cards, banners,
 * categories…) reads from a SINGLE source of truth instead of firing its own
 * `user_roles` query. This permanently fixes the "edit controls show on some
 * products but not others / disappear" bug — which was caused by dozens of
 * independent, racing per-card queries — and removes N+1 DB load on large
 * catalogs. This is a UX gate only; every write is still enforced server-side
 * via RLS + role checks.
 */
type RoleState = {
  userId: string | null;
  roles: Set<AppRole>;
  loading: boolean;
};

let state: RoleState = { userId: null, roles: new Set(), loading: true };
let inflightFor: string | null = null;
const subscribers = new Set<() => void>();

function emit() {
  subscribers.forEach((s) => s());
}

async function fetchRoles(userId: string) {
  if (inflightFor === userId) return;
  inflightFor = userId;
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  // Ignore stale responses if the user changed mid-flight.
  if (inflightFor !== userId) return;
  const roles = new Set<AppRole>(((data as { role: AppRole }[] | null) ?? []).map((r) => r.role));
  state = { userId, roles, loading: false };
  inflightFor = null;
  emit();
}

function ensureLoaded(userId: string | null, authLoading: boolean) {
  if (authLoading) return;
  if (!userId) {
    if (state.userId !== null || state.loading) {
      state = { userId: null, roles: new Set(), loading: false };
      emit();
    }
    return;
  }
  if (state.userId === userId && !state.loading) return;
  if (state.loading && state.userId === userId) return;
  // New user (or first load): mark loading and fetch once.
  if (state.userId !== userId) {
    state = { userId, roles: new Set(), loading: true };
    emit();
  }
  void fetchRoles(userId);
}

function useRoles() {
  const { user, loading: authLoading } = useAuth();
  const [, force] = useState(0);

  useEffect(() => {
    const sub = () => force((n) => n + 1);
    subscribers.add(sub);
    ensureLoaded(user?.id ?? null, authLoading);
    return () => {
      subscribers.delete(sub);
    };
  }, [user?.id, authLoading]);

  return state;
}

function hasAny(roles: Set<AppRole>, allowed: AppRole[]) {
  return allowed.some((r) => roles.has(r));
}

/**
 * Client-side staff/admin detection (broad — any staff role).
 */
export function useIsAdmin() {
  const s = useRoles();
  return { isAdmin: hasAny(s.roles, STAFF_ROLES), loading: s.loading };
}

/**
 * Stricter gate for product editing — only true admins (admin / super_admin).
 * Mirrors the products RLS policy so the UI never shows controls that would
 * fail server-side.
 */
export function useIsProductAdmin() {
  const s = useRoles();
  return { isProductAdmin: hasAny(s.roles, PRODUCT_ADMIN_ROLES), loading: s.loading };
}

/**
 * Full staff role set for fine-grained permission gating (Command Center).
 * Reads from the same shared cache as useIsAdmin — no extra DB queries.
 */
export function useStaffRoles() {
  const s = useRoles();
  return { roles: s.roles as Set<AppRole>, loading: s.loading };
}
