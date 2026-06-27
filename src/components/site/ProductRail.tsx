import { ProductCard } from "./ProductCard";
import type { Product } from "@/lib/products";

/**
 * Mobile-only horizontal snap rail for product cards.
 * - Edge-padded (matches section px-4) so first/last card aligns with content
 * - Snap-mandatory + scroll-padding for smooth carousel feel
 * - Each card ~68% viewport width so the next card peeks (Amazon/Nike pattern)
 * - Hidden on sm+ where a grid layout is preferred
 */
export function ProductRail({
  products,
  className = "",
  compact = false,
}: {
  products: Product[];
  className?: string;
  compact?: boolean;
}) {
  if (!products.length) return null;
  return (
    <div className={`sm:hidden -mx-4 ${className}`}>
      <div
        data-product-grid
        className={`flex overflow-x-auto snap-x snap-mandatory px-4 pb-3 pt-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${compact ? "gap-2.5" : "gap-3"}`}
        style={{
          scrollPaddingLeft: "1rem",
          scrollPaddingRight: "1rem",
          overscrollBehaviorX: "contain",
        }}
      >
        {products.map((p) => (
          <div
            key={p.id ?? p.slug}
            data-product-card-frame
            className={`snap-start shrink-0 ${compact ? "w-[54%] min-[420px]:w-[46%]" : "w-[76%] min-[420px]:w-[66%]"}`}
          >
            <ProductCard product={p} compact={compact} />
          </div>
        ))}
        {/* trailing spacer so last card can fully snap to start */}
        <div aria-hidden className="shrink-0 w-1" />
      </div>
    </div>
  );
}

