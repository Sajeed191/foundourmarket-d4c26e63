import { memo, useCallback, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { getResponsiveImage } from "@/lib/product-images";
import { getStorageResponsive, getStorageSafeSrc } from "@/lib/storage-image";

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
  onLoad?: (img: HTMLImageElement) => void;
  /** Kept for call-site compatibility; no longer emits diagnostics. */
  debugId?: string;
};

/**
 * Stable, keyed product image — one path for every device and browser.
 *
 * React must never reuse a decoded <img> DOM node for a different product while
 * sorting/filtering/incrementally loading, so the key includes the src and
 * intrinsic dimensions. Images lazy-load by default (the LCP/`priority` image
 * loads eagerly), use a responsive srcset, and reserve width/height to prevent
 * layout shift. No device classification, no GPU "safe mode", no runtime src
 * swapping — the browser owns lazy loading and decoding directly, which keeps
 * rendering stable across Chrome/Samsung/Edge/Firefox Android and WebView.
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
  const rootDataset = typeof document === "undefined" ? null : document.documentElement.dataset;
  const activePropTest = rootDataset?.bisectOverride === "on" ? rootDataset?.bisectTest : null;
  const disableSrcset =
    rootDataset?.ffImageTransformations === "off" ||
    rootDataset?.ffProductImages === "off" ||
    activePropTest === "product-image-srcset";
  const disableLazyLoading =
    rootDataset?.ffLazyLoading === "off" || activePropTest === "product-image-lazy-loading";
  const disableAsyncDecoding =
    rootDataset?.ffImageDecoding === "off" || activePropTest === "product-image-decoding-async";
  const disableImageDecode =
    rootDataset?.ffImageDecoding === "off" || activePropTest === "product-image-image-decode";
  // Bundled demo assets ship a build-time srcset; real (storage-hosted) product
  // images get an on-the-fly resized srcset so we never download the original.
  // Mali GPU compatibility: when the boot probe flagged data-gpu-unsafe, drop
  // srcset entirely (no high-DPR selection → Chrome never pulls the 960w
  // candidate) and serve one small WebP source: the bundled 288px safeSrc for
  // demo assets, or a capped 480px WebP for storage images. Every other device
  // keeps the exact current srcset behavior.
  const gpuUnsafe = rootDataset?.gpuUnsafe === "true";
  const bundled = disableSrcset ? null : getResponsiveImage(src);
  const storage = disableSrcset || bundled ? null : getStorageResponsive(src);
  const gpuSafeStorageSrc =
    gpuUnsafe && !disableSrcset && !bundled ? getStorageSafeSrc(src) : null;
  const srcset =
    disableSrcset || gpuUnsafe ? undefined : (bundled?.srcset ?? storage?.srcset);
  const resolvedSrc = gpuUnsafe
    ? (bundled?.safeSrc ?? gpuSafeStorageSrc ?? storage?.src ?? src)
    : (storage?.src ?? src);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const activeSrcRef = useRef(resolvedSrc);

  const handleLoad = useCallback(() => {
    if (activeSrcRef.current !== resolvedSrc) return;
    const img = imgRef.current;
    if (!img) return;

    // Decode-gated reveal: wait for the browser to fully rasterize the bitmap
    // before we signal "loaded" and let the image paint. On Chromium Android
    // this prevents the compositor from presenting a partially-decoded frame
    // (horizontal banding / blank tiles) during first scroll or refresh, so
    // the very first paint is already final quality.
    const reveal = () => {
      if (activeSrcRef.current !== resolvedSrc) return;
      onLoad?.(img);
    };

    if (!disableImageDecode && typeof img.decode === "function") {
      img
        .decode()
        .then(reveal)
        // decode() rejects on already-broken images or some cross-origin
        // cases — fall back to the raw load so the image still appears.
        .catch(reveal);
    } else {
      // Older WebViews (and some legacy Android browsers) lack img.decode().
      // Give the browser a beat to finish decoding, then reveal on the next
      // animation frame so the paint still lands on a settled bitmap.
      const t = setTimeout(() => {
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(reveal);
        } else {
          reveal();
        }
      }, 32);
      // Best-effort cleanup if the src changes before the timer fires.
      return () => clearTimeout(t);
    }
  }, [disableImageDecode, onLoad, resolvedSrc]);

  useEffect(() => {
    activeSrcRef.current = resolvedSrc;
    return () => {
      activeSrcRef.current = "";
    };
  }, [resolvedSrc]);

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
      loading={priority || disableLazyLoading ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "low"}
      decoding={disableAsyncDecoding ? "sync" : "async"}
      data-product-image
      suppressHydrationWarning
      style={style}
      onLoad={handleLoad}
      className={className}
    />
  );
}

export const ProductImage = memo(ProductImageImpl);
