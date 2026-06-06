import { lazy, Suspense } from "react";
import { useIsProductAdmin } from "@/lib/use-admin";
import { useAdminMode } from "@/lib/admin-mode";
import type { Product } from "@/lib/products";

/**
 * Lazy gate for the product-card admin overlay.
 *
 * The real controls (and their heavy dependency graph — ProductQuickEditSheet,
 * server-fn clients, framer-motion menus) are only fetched when a verified
 * admin has Admin Mode active. For the ~100% of visitors who are customers,
 * NOTHING is downloaded: the chunk is never requested and never appears in the
 * route's modulepreload manifest. Behaviour for admins is byte-identical.
 */
const ProductCardAdminControls = lazy(() =>
  import("@/components/admin/ProductCardAdminControls").then((m) => ({
    default: m.ProductCardAdminControls,
  })),
);

export function ProductCardAdminControlsGate({ product }: { product: Product }) {
  const { isProductAdmin } = useIsProductAdmin();
  const { adminMode } = useAdminMode();
  if (!isProductAdmin || !adminMode) return null;
  return (
    <Suspense fallback={null}>
      <ProductCardAdminControls product={product} />
    </Suspense>
  );
}
