import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { getResponsiveImage } from "@/lib/product-images";
import { getStorageResponsive, getStorageSafeSrc } from "@/lib/storage-image";
import { isGpuUnsafe } from "@/lib/gpu-compat";

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
  // Mali GPU compatibility (centralized via isGpuUnsafe()): on flagged devices,
  // drop srcset entirely (no high-DPR selection → Chrome never pulls the 960w
  // candidate) and serve ONE small WebP source — the bundled 288px safeSrc for
  // demo assets, or a capped 480px WebP for storage images. This minimizes the
  // number and size of GPU textures uploaded. Every other device is unchanged.
  const gpuUnsafe = isGpuUnsafe();
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

  // Reliability layer: automatic retry with backoff + cache-busting, a stall
  // timeout, and a graceful "image unavailable" fallback. `attempt` 0 uses the
  // pristine URL (best cache hit); retries 1..MAX append a version param to
  // dodge a poisoned/aborted cache entry. `failed` renders the fallback tile so
  // a blank white/gray rectangle can never remain after loading attempts.
  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [300, 800, 1500];
  const STALL_TIMEOUT = 10000;
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  // Reset the reliability state machine whenever the underlying source changes.
  useEffect(() => {
    setAttempt(0);
    setFailed(false);
  }, [resolvedSrc]);

  const withCacheBust = useCallback((url: string, n: number) => {
    if (n <= 0) return url;
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}v=retry${n}`;
  }, []);

  const displaySrc = withCacheBust(resolvedSrc, attempt);

  // Stall protection: if a load neither completes nor errors within the timeout,
  // treat it as a failure so the retry/fallback path runs. Cleared on load/error
  // and on src change.
  const stallRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearStall = useCallback(() => {
    if (stallRef.current) {
      clearTimeout(stallRef.current);
      stallRef.current = null;
    }
  }, []);

  const scheduleRetry = useCallback(() => {
    clearStall();
    setAttempt((prev) => {
      if (prev >= MAX_RETRIES) {
        setFailed(true);
        return prev;
      }
      const delay = RETRY_DELAYS[prev] ?? 1500;
      window.setTimeout(() => {
        setFailed(false);
        setAttempt(prev + 1);
      }, delay);
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearStall]);

  useEffect(() => {
    if (failed) return;
    // Arm the stall timer for the current attempt. An already-complete cached
    // image (img.complete) needs no timer.
    if (typeof window === "undefined") return;
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) return;
    stallRef.current = setTimeout(() => {
      const el = imgRef.current;
      if (el && el.complete && el.naturalWidth > 0) return;
      scheduleRetry();
    }, STALL_TIMEOUT);
    return clearStall;
  }, [displaySrc, failed, scheduleRetry, clearStall]);

  const handleLoad = useCallback(() => {
    clearStall();
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
  }, [disableImageDecode, onLoad, resolvedSrc, clearStall]);

  const handleError = useCallback(() => {
    scheduleRetry();
  }, [scheduleRetry]);

  useEffect(() => {
    activeSrcRef.current = resolvedSrc;
    return () => {
      activeSrcRef.current = "";
    };
  }, [resolvedSrc]);

  useEffect(() => clearStall, [clearStall]);

  if (failed) {
    // Graceful fallback tile — never a bare white/gray rectangle. Keeps the
    // reserved box dimensions so layout stays stable.
    return (
      <div
        role="img"
        aria-label={`${alt} — image unavailable`}
        data-product-image-fallback
        className={`flex flex-col items-center justify-center gap-1 bg-white/[0.04] text-white/40 ${className}`}
        style={style}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
        <span className="text-[10px] font-medium leading-none">Image unavailable</span>
      </div>
    );
  }

  return (
    <img
      key={`${resolvedSrc}|${width}x${height}`}
      ref={imgRef}
      src={displaySrc}
      srcSet={attempt > 0 ? undefined : srcset}
      sizes={attempt === 0 && srcset ? sizes : undefined}
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
      onError={handleError}
      className={className}
    />
  );
}


export const ProductImage = memo(ProductImageImpl);
