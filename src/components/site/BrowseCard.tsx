/**
 * BrowseCard — Track A · Phase 2.1 (Badge System v2 · UX v3)
 *
 * Thin wrapper over ProductCard. Passes the browse presentation badges into
 * ProductCard so the single-badge priority ladder can pick the winner across
 * admin-assigned, engine-computed, and browse sources. In UX v3 the floating
 * ⓘ info button is removed — the marketing badge itself is the trigger for
 * the "Why you're seeing this" explanation. BrowseCard forwards the reason
 * as `badgeReason`; ProductCard renders the interactive popover.
 */
import { memo } from "react";
import { ProductCard } from "@/components/site/ProductCard";
import type { Product } from "@/lib/products";
import type { BrowsePresentation } from "@/lib/browse";

type BrowseCardProps = {
  product: Product;
  presentation?: BrowsePresentation;
  priority?: boolean;
  highlight?: string;
};

function BrowseCardImpl({ product, presentation, priority, highlight }: BrowseCardProps) {
  return (
    <ProductCard
      product={product}
      priority={priority}
      highlight={highlight}
      browseBadges={presentation?.badges}
      badgeReason={presentation?.reason}
    />
  );
}

export const BrowseCard = memo(BrowseCardImpl);
