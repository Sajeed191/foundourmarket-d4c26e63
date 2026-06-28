import { memo } from "react";
import type { CSSProperties } from "react";
import { getResponsiveImage } from "@/lib/product-images";

type Props = {
  src: string;
  alt: string;
  /** Responsive sizes hint. Defaults tuned for the homepage card grid/rails. */
  sizes?: string;
  className?: string;
  /** Set true only for the LCP/above-the-fold image; everything else lazy-loads. */
  priority?: boolean;
  width?: number;
  height?: number;
  style?: CSSProperties;
  onLoad?: () => void;
};

/**
 * Stable, keyed product image.
 *
 * React must never reuse a decoded <img> DOM node for a different product while
 * sorting/filtering/incrementally loading. The key includes the src and intrinsic
 * dimensions so stale bitmaps cannot appear in another card. The component has
 * no post-mount state and never swaps DOM after hydration; the browser owns
 * lazy loading/decoding directly.
 */
function ProductImageImpl({
  src,
  alt,
  sizes = "(min-width: 1024px) 300px, (min-width: 640px) 45vw, 76vw",
  className = "",
  priority = false,
  width = 800,
  height = 600,
}: Props) {
  const responsive = getResponsiveImage(src);

  return (
    <img
      key={`${src}|${width}x${height}`}
      src={src}
      srcSet={responsive?.srcset}
      sizes={responsive ? sizes : undefined}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "low"}
      decoding="async"
      data-product-image
      className={className}
    />
  );
}

export const ProductImage = memo(ProductImageImpl);