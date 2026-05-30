import { useIsAdmin, useIsProductAdmin } from "@/lib/use-admin";
import { useAdminMode } from "@/lib/admin-mode";

/**
 * Unified gate for the global admin overlay. Inline edit affordances across the
 * whole storefront (banners, announcements, categories, homepage sections)
 * should use this so a SINGLE "Admin Mode" toggle reveals/hides every editor
 * consistently. Customers never pass this gate; every write is still enforced
 * server-side via RLS + role checks.
 */
export function useAdminEditing() {
  const { isAdmin, loading } = useIsAdmin();
  const { adminMode } = useAdminMode();
  return { canEdit: isAdmin && adminMode, isAdmin, adminMode, loading };
}

/**
 * Stricter variant for product/section editing — only admin / super_admin,
 * AND only when the global Admin Mode overlay is active.
 */
export function useProductAdminEditing() {
  const { isProductAdmin, loading } = useIsProductAdmin();
  const { adminMode } = useAdminMode();
  return { canEdit: isProductAdmin && adminMode, isProductAdmin, adminMode, loading };
}
