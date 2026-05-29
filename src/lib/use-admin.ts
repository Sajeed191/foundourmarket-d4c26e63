import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";

const STAFF_ROLES: (
  | "admin"
  | "super_admin"
  | "manager"
  | "support"
  | "fulfillment"
  | "warehouse_staff"
  | "editor"
)[] = [
  "admin",
  "super_admin",
  "manager",
  "support",
  "fulfillment",
  "warehouse_staff",
  "editor",
];

/**
 * Client-side staff/admin detection. This is a UX gate only — every write is
 * additionally enforced server-side via RLS + role checks. A tampered client
 * flag cannot grant data access.
 */
export function useIsAdmin() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (authLoading) return;
    if (!user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", STAFF_ROLES)
      .then(({ data }) => {
        if (!active) return;
        setIsAdmin(!!data && data.length > 0);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user, authLoading]);

  return { isAdmin, loading };
}
