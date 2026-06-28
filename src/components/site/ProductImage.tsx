import { memo, useCallback, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { getResponsiveImage } from "@/lib/product-images";
import { getStorageResponsive } from "@/lib/storage-image";
import { detectUltraLowEndAndroid } from "@/lib/use-low-end-device";

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
  style,
  onLoad,
}: Props) {
  // Bundled demo assets ship a build-time srcset; real (storage-hosted) product
  // images get an on-the-fly resized srcset so we never download the original.
  const bundled = getResponsiveImage(src);
  const ultraLowEndAndroid = detectUltraLowEndAndroid();
  const storage = bundled
    ? null
    : ultraLowEndAndroid
      ? getStorageResponsive(src, { widths: [160, 240, 320, 480], fallbackWidth: 320, quality: 54 })
      : getStorageResponsive(src);
  const srcset = bundled?.srcset ?? storage?.srcset;
  const resolvedSrc = storage?.src ?? src;
  const imgRef = useRef<HTMLImageElement | null>(null);
  const activeSrcRef = useRef(resolvedSrc);

  useEffect(() => {
    activeSrcRef.current = resolvedSrc;
    return () => {
      activeSrcRef.current = "";
      // On ultra low-end Android, aggressively removing src/srcset during card
      // recycling can force Chrome to tear down and recreate image textures while
      // the user is scrolling. That pattern matches the real-device symptoms
      // (colored blocks / black flashes / smeared stale text), so keep the DOM
      // node inert and let the browser release the resource naturally.
      if (detectUltraLowEndAndroid()) return;
      const img = imgRef.current;
      if (!img || img.getAttribute("src") !== resolvedSrc) return;
      img.onload = null;
      img.onerror = null;
      img.removeAttribute("srcset");
      img.removeAttribute("src");
    };
  }, [resolvedSrc]);

  const handleLoad = useCallback(() => {
    if (activeSrcRef.current !== resolvedSrc) return;
    onLoad?.();
  }, [onLoad, resolvedSrc]);

  return (
    <img
      key={`${resolvedSrc}|${width}x${height}`}
      ref={imgRef}
      src={resolvedSrc}
      srcSet={srcset}
      sizes={srcset ? sizes : undefined}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      data-product-image
      style={style}
      onLoad={handleLoad}
      className={className}
    />
  );
}

export const ProductImage = memo(ProductImageImpl);