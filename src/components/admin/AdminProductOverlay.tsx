import type { ReactNode } from "react";
import { ProductCardAdminControls } from "@/components/admin/ProductCardAdminControls";
import type { Product } from "@/lib/products";
import { cn } from "@/lib/utils";

/**
 * Global admin render engine. Wrap ANY product tile/row in this to
 * automatically inject the staff-only quick-action controls in the same
 * top-left position used by the standard ProductCard — so every product
 * surface (flash sales, wishlist, custom rails, etc.) inherits the admin
 * system without per-surface wiring.
 *
 * The controls render nothing for customers and only appear when global
 * Admin Mode is active, so this is a pure UX overlay; all writes remain
 * server-validated.
 */
export function AdminProductOverlay({
  product,
  children,
  className,
}: {
  product: Product;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <ProductCardAdminControls product={product} />
      {children}
    </div>
  );
}
