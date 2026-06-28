import { memo, useCallback, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { getResponsiveImage } from "@/lib/product-images";
import { getStorageResponsive } from "@/lib/storage-image";
import { detectAndroidGpuSafeMode, detectRenderSafe, detectUltraLowEndAndroid } from "@/lib/use-low-end-device";
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
  /** When set, logs the full image-loading lifecycle for diagnostics. */
  debugId?: string;
};

// Diagnostic A/B: `?imgtest=static` makes ProductImage behave exactly like the
// plain <img> tags on /gpu-test — final src assigned once, no placeholder, no
// IntersectionObserver, no decode queue, no img.decode(), no post-mount src
// mutation. Pure test to isolate runtime image-source mutation as a corruption
// cause. Does not touch layout, styling, radius, overflow, grid, or nav.
let imgTestStaticCached: boolean | null = null;
function detectImgTestStatic(): boolean {
  if (imgTestStaticCached !== null) return imgTestStaticCached;
  if (typeof window === "undefined") return false;
  let value = false;
  try {
    value = new URLSearchParams(window.location.search).get("imgtest") === "static";
  } catch {
    value = false;
  }
  imgTestStaticCached = value;
  if (value && typeof console !== "undefined") {
    // eslint-disable-next-line no-console
    console.log("[imgtest] Static image mode enabled — no decode queue used.");
  }
  return value;
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
  debugId,
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
  const renderSafe = detectRenderSafe();
  const ultraLowEndAndroid = detectUltraLowEndAndroid();
  const androidGpuSafeMode = detectAndroidGpuSafeMode() && !renderSafe;
  // Diagnostic render=safe: eager load, sync decode, no srcset/sizes, only `src`.
  const loadingMode = renderSafe ? "eager" : bisectLazyLoading ? (bisectOverrideEnabled ? "eager" : "lazy") : androidGpuSafeMode ? "lazy" : (!ffLazyLoading || priority ? "eager" : "lazy");
  const decodingMode = renderSafe ? "sync" : bisectAsyncDecoding ? (bisectOverrideEnabled ? "sync" : "async") : androidGpuSafeMode ? "async" : ffImageDecoding ? "async" : "sync";
  const storage = bundled || renderSafe
    ? null
    : androidGpuSafeMode
      ? getStorageResponsive(src, { widths: [160, 240, 288], fallbackWidth: 288, quality: 52 })
      : ultraLowEndAndroid
        ? getStorageResponsive(src, { widths: [160, 240, 320, 480], fallbackWidth: 320, quality: 54 })
      : getStorageResponsive(src);
  const srcset = renderSafe ? undefined : forceSrcsetOff || (androidGpuSafeMode && !forceSrcsetOn) ? undefined : bundled?.srcset ?? storage?.srcset;
  const resolvedSrc = renderSafe ? src : androidGpuSafeMode ? (storage?.src ?? bundled?.safeSrc ?? src) : (storage?.src ?? src);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const activeSrcRef = useRef(resolvedSrc);

  const handleLoad = useCallback(() => {
    if (activeSrcRef.current !== resolvedSrc) return;
    onLoad?.();
  }, [onLoad, resolvedSrc]);

  // ── Hero image pipeline diagnostics (opt-in via debugId) ──
  useEffect(() => {
    if (!debugId || typeof window === "undefined") return;
    const tag = `[hero-img:${debugId}]`;
    const log = (...a: unknown[]) => console.log(tag, ...a);
    log("(1) received src prop:", src);
    log("    resolvedSrc:", resolvedSrc);
    log("    srcset:", srcset ?? "(none)");
    log("    flags:", { renderSafe, androidGpuSafeMode, ultraLowEndAndroid, loadingMode, decodingMode, ffProductImages, ffLazyLoading, priority });

    const img = imgRef.current;
    log("(2) <img> mounted:", !!img, "connected:", img?.isConnected);
    if (!img) {
      log("    NOTE: ProductImage rendered a placeholder div (ffProductImages off) — no <img> element exists.");
      return;
    }

    log("(3) final assigned src attr:", img.getAttribute("src"));
    log("    final assigned srcset attr:", img.getAttribute("srcset") ?? "(none)");

    // (6) CSS visibility audit
    const cs = window.getComputedStyle(img);
    const rect = img.getBoundingClientRect();
    log("    CSS audit:", {
      display: cs.display,
      visibility: cs.visibility,
      opacity: cs.opacity,
      width: rect.width,
      height: rect.height,
      objectFit: cs.objectFit,
      position: cs.position,
      zIndex: cs.zIndex,
    });
    if (cs.display === "none") log("    ⚠ HIDDEN via display:none");
    if (cs.visibility === "hidden") log("    ⚠ HIDDEN via visibility:hidden");
    if (cs.opacity === "0") log("    ⚠ HIDDEN via opacity:0");
    if (rect.width === 0 || rect.height === 0) log("    ⚠ ZERO box size");

    const report = () =>
      log("(5) state:", { complete: img.complete, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, currentSrc: img.currentSrc });

    // (5) immediate state (in case it already loaded from cache)
    report();

    // (4) load / error events
    const onLoadEvt = () => { log("(4) LOAD event fired"); report(); };
    const onErrorEvt = (e: Event) => { log("(4) ERROR event fired", e); report(); };
    img.addEventListener("load", onLoadEvt);
    img.addEventListener("error", onErrorEvt);

    // Late check after 5s — if still blank, dump network status via Resource Timing
    const t = window.setTimeout(() => {
      log("(5) state @5s:", { complete: img.complete, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
      try {
        const url = img.currentSrc || img.src;
        const entries = performance.getEntriesByType("resource").filter((r) => r.name === url) as PerformanceResourceTiming[];
        if (entries.length === 0) {
          log("(6) Network: NO resource-timing entry for", url, "→ request likely never started or was blocked/cancelled");
        } else {
          entries.forEach((r) =>
            log("(6) Network:", { name: r.name, duration: Math.round(r.duration), transferSize: r.transferSize, encodedBodySize: r.encodedBodySize, responseStatus: (r as PerformanceResourceTiming & { responseStatus?: number }).responseStatus }),
          );
        }
      } catch (err) {
        log("(6) Network probe failed:", err);
      }
    }, 5000);

    return () => {
      img.removeEventListener("load", onLoadEvt);
      img.removeEventListener("error", onErrorEvt);
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debugId, resolvedSrc]);



  const imgTestStatic = detectImgTestStatic();

  const staticLoggedRef = useRef(false);
  if (imgTestStatic && !staticLoggedRef.current && typeof console !== "undefined") {
    staticLoggedRef.current = true;
    // eslint-disable-next-line no-console
    console.log(`[imgtest] Image src assigned once: ${resolvedSrc}`);
  }

  // Static diagnostic mode: never run the IntersectionObserver / decode-queue
  // effect, and never run the post-mount src/srcset removal cleanup. The src is
  // set once at render and never mutated afterward.
  useEffect(() => {
    if (!imgTestStatic) return;
    // eslint-disable-next-line no-console
    console.log("[imgtest] No src mutations occurred after mount.");
    return undefined;
  }, [imgTestStatic]);



  useEffect(() => {
    if (imgTestStatic) return; // static diagnostic: never mutate src after mount
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
  }, [imgTestStatic, resolvedSrc]);

  // NOTE: Android GPU Safe Mode previously rendered a transparent 1×1 GIF and
  // relied on an IntersectionObserver to swap in the real src. That created a
  // deadlock on Android: the transparent GIF collapses the box to 0×0, a
  // zero-area element never reports `isIntersecting`, so the real src was never
  // restored and the image stayed blank forever. The real `resolvedSrc` is now
  // assigned directly in render with native `loading="lazy"`, which preserves
  // lazy loading + decoding without the broken swap. No effect needed here.

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

  if (imgTestStatic) {
    // Behaves exactly like the plain <img> tags on /gpu-test: final src once,
    // eager + sync, no srcset/sizes, no placeholder, no decode queue.
    return (
      <img
        key={`${resolvedSrc}|${width}x${height}`}
        ref={imgRef}
        src={resolvedSrc}
        alt={alt}
        width={width}
        height={height}
        loading="eager"
        decoding="sync"
        data-product-image
        data-imgtest-static="true"
        style={style}
        onLoad={handleLoad}
        className={className}
      />
    );
  }

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