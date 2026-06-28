import { memo, useCallback, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { getResponsiveImage } from "@/lib/product-images";
import { getStorageResponsive } from "@/lib/storage-image";
import { detectAndroidGpuSafeMode, detectUltraLowEndAndroid } from "@/lib/use-low-end-device";
import { useActiveBisectTest, useBisectOverrideEnabled, useFlag } from "@/lib/use-debug-flag";

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

const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

let safeDecodeChain: Promise<void> = Promise.resolve();

function enqueueSafeImageDecode(
  img: HTMLImageElement,
  src: string,
  onDone?: () => void,
  options?: { loading?: "eager" | "lazy"; decoding?: "async" | "sync" },
) {
  let cancelled = false;
  let started = false;

  safeDecodeChain = safeDecodeChain
    .catch(() => undefined)
    .then(async () => {
      if (cancelled || !img.isConnected) return;
      started = true;
      img.loading = options?.loading ?? "lazy";
      img.decoding = options?.decoding ?? "async";
      img.fetchPriority = "low";
      img.src = src;
      try {
        if (typeof img.decode === "function") await img.decode();
      } catch {
        // Decoding may reject when Chrome evicts/cancels the request. The image
        // element remains valid and the browser can still paint it after load.
      }
      if (!cancelled && img.isConnected) onDone?.();
    });

  return () => {
    cancelled = true;
    // A queued-but-not-started image has no network/texture work yet. Once an
    // image has begun decoding, avoid src churn because Mali/MediaTek Chrome is
    // exactly where rapid texture teardown causes black/colored rectangles.
    if (!started && img.isConnected) img.src = TRANSPARENT_PIXEL;
  };
}

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
  // Debug harness flags for image-subsystem isolation.
  const ffProductImages = useFlag("productImages");
  const ffLazyLoading = useFlag("lazyLoading");
  const ffImageDecoding = useFlag("imageDecoding");
  const activeBisectTest = useActiveBisectTest();
  const bisectOverrideEnabled = useBisectOverrideEnabled();
  const bisectSrcset = activeBisectTest === "product-image-srcset";
  const bisectLazyLoading = activeBisectTest === "product-image-lazy-loading";
  const bisectAsyncDecoding = activeBisectTest === "product-image-decoding-async";
  const forceSrcsetOn = bisectSrcset && !bisectOverrideEnabled;
  const forceSrcsetOff = bisectSrcset && bisectOverrideEnabled;
  // Bundled demo assets ship a build-time srcset; real (storage-hosted) product
  // images get an on-the-fly resized srcset so we never download the original.
  const bundled = getResponsiveImage(src);
  const ultraLowEndAndroid = detectUltraLowEndAndroid();
  const androidGpuSafeMode = detectAndroidGpuSafeMode();
  const loadingMode = bisectLazyLoading ? (bisectOverrideEnabled ? "eager" : "lazy") : androidGpuSafeMode ? "lazy" : (!ffLazyLoading || priority ? "eager" : "lazy");
  const decodingMode = bisectAsyncDecoding ? (bisectOverrideEnabled ? "sync" : "async") : androidGpuSafeMode ? "async" : ffImageDecoding ? "async" : "sync";
  const storage = bundled
    ? null
    : androidGpuSafeMode
      ? getStorageResponsive(src, { widths: [160, 240, 288], fallbackWidth: 288, quality: 52 })
      : ultraLowEndAndroid
        ? getStorageResponsive(src, { widths: [160, 240, 320, 480], fallbackWidth: 320, quality: 54 })
      : getStorageResponsive(src);
  const srcset = forceSrcsetOff || (androidGpuSafeMode && !forceSrcsetOn) ? undefined : bundled?.srcset ?? storage?.srcset;
  const resolvedSrc = androidGpuSafeMode ? (storage?.src ?? bundled?.safeSrc ?? src) : (storage?.src ?? src);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const activeSrcRef = useRef(resolvedSrc);

  const handleLoad = useCallback(() => {
    if (activeSrcRef.current !== resolvedSrc) return;
    onLoad?.();
  }, [onLoad, resolvedSrc]);

  useEffect(() => {
    activeSrcRef.current = resolvedSrc;
    return () => {
      activeSrcRef.current = "";
      // On ultra low-end Android, aggressively removing src/srcset during card
      // recycling can force Chrome to tear down and recreate image textures while
      // the user is scrolling. That pattern matches the real-device symptoms
      // (colored blocks / black flashes / smeared stale text), so keep the DOM
      // node inert and let the browser release the resource naturally.
      if (detectAndroidGpuSafeMode() || detectUltraLowEndAndroid()) return;
      const img = imgRef.current;
      if (!img || img.getAttribute("src") !== resolvedSrc) return;
      img.onload = null;
      img.onerror = null;
      img.removeAttribute("srcset");
      img.removeAttribute("src");
    };
  }, [resolvedSrc]);

  useEffect(() => {
    if (!androidGpuSafeMode) return;
    const img = imgRef.current;
    if (!img) return;
    let cancelDecode: (() => void) | null = null;
    let queued = false;

    const queue = () => {
      if (queued || activeSrcRef.current !== resolvedSrc) return;
      queued = true;
      cancelDecode = enqueueSafeImageDecode(img, resolvedSrc, handleLoad, {
        loading: loadingMode,
        decoding: decodingMode,
      });
    };

    if (typeof IntersectionObserver === "undefined") {
      queue();
      return () => cancelDecode?.();
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          queue();
          observer.disconnect();
        } else if (!queued) {
          cancelDecode?.();
          cancelDecode = null;
        }
      },
      { rootMargin: "160px 0px", threshold: 0.01 },
    );
    observer.observe(img);
    return () => {
      observer.disconnect();
      cancelDecode?.();
    };
  }, [androidGpuSafeMode, decodingMode, handleLoad, loadingMode, resolvedSrc]);

  // Debug harness: render a flat placeholder instead of an <img> to rule the
  // product image element out as the corruption source.
  if (!ffProductImages) {
    return (
      <div
        data-product-image
        aria-label={alt}
        style={{ ...style, background: "#e5e7eb" }}
        className={className}
      />
    );
  }

  return (
    <img
      key={`${resolvedSrc}|${width}x${height}`}
      ref={imgRef}
      src={androidGpuSafeMode ? TRANSPARENT_PIXEL : resolvedSrc}
      srcSet={srcset}
      sizes={srcset ? sizes : undefined}
      alt={alt}
      width={width}
      height={height}
      loading={loadingMode}
      fetchPriority={androidGpuSafeMode ? "low" : priority ? "high" : "low"}
      decoding={decodingMode}
      data-product-image
      data-android-static-image={androidGpuSafeMode ? "true" : undefined}
      suppressHydrationWarning
      style={style}
      onLoad={handleLoad}
      className={className}
    />
  );
}

export const ProductImage = memo(ProductImageImpl);