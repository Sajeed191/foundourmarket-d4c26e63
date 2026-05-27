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
}: {
  products: Product[];
  className?: string;
}) {
  if (!products.length) return null;
  return (
    <div className={`sm:hidden -mx-4 ${className}`}>
      <div
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory px-4 pb-3 pt-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{
          scrollPaddingLeft: "1rem",
          scrollPaddingRight: "1rem",
          WebkitOverflowScrolling: "touch",
          overscrollBehaviorX: "contain",
        }}
      >
        {products.map((p) => (
          <div
            key={p.slug}
            className="snap-start shrink-0 w-[68%] min-[420px]:w-[58%]"
          >
            <ProductCard product={p} />
          </div>
        ))}
        {/* trailing spacer so last card can fully snap to start */}
        <div aria-hidden className="shrink-0 w-1" />
      </div>
    </div>
  );
}
