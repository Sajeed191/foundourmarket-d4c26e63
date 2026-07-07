import { memo, useCallback, useEffect, useState } from "react";
import { ProductImage } from "@/components/site/ProductImage";
import { isConstrainedDevice } from "@/lib/use-image-palette";
import { isGpuUnsafe } from "@/lib/gpu-compat";
import {
  getImagePalette,
  getImagePaletteFromElement,
  getCachedPalette,
  FALLBACK_PALETTE,
  type ImagePalette,
} from "@/lib/image-palette";

type Props = {
  src: string;
  alt: string;
  priority?: boolean;
  /** Plain rectangle (no overflow clip / radius / palette background). */
  plain?: boolean;
  children?: React.ReactNode;
};

/**
 * Product media container with seamless background matching.
 *
 * Detects the product image's own background color (sampled from its outer
 * edges/corners, cached per-src) and sets the container background to exactly
 * that solid color, so the image blends seamlessly into the card with no
 * visible edge. White → white, black → black, cream → cream, etc. The original
 * photo is never modified; it's centered with object-contain and even padding.
 * Falls back to white when extraction is unavailable (SSR / CORS / failure).
 */
function AdaptiveProductMediaImpl({ src, alt, priority = false, plain = false, children }: Props) {
  const rootDataset = typeof document === "undefined" ? null : document.documentElement.dataset;
  const disablePaletteExtraction = rootDataset?.ffPaletteExtraction === "off";
  const disableObjectFit = rootDataset?.ffObjectFit === "off";
  const [palette, setPalette] = useState<ImagePalette>(
    () => (disablePaletteExtraction ? null : src ? getCachedPalette(src) : null) ?? FALLBACK_PALETTE,
  );
  const [ready, setReady] = useState<boolean>(() => disablePaletteExtraction || (src ? getCachedPalette(src) != null : false));
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);

  useEffect(() => {
    setLoadedSrc(null);
    const cached = disablePaletteExtraction ? null : src ? getCachedPalette(src) : null;
    setPalette(cached ?? FALLBACK_PALETTE);
    setReady(disablePaletteExtraction || cached != null);
  }, [disablePaletteExtraction, src]);

  // Reuse the already-decoded, on-screen bitmap for palette extraction — no
  // second decode for same-origin (bundled) images. Only cross-origin storage
  // images (which taint the canvas) fall back to a tiny async CORS decode.
  const handleImageLoad = useCallback(
    (img: HTMLImageElement) => {
      setLoadedSrc(src);
      if (disablePaletteExtraction) {
        setPalette(FALLBACK_PALETTE);
        setReady(true);
        return;
      }
      // Compatibility / render-safe path (opt-in): skip ALL per-image canvas
      // work — `getImagePaletteFromElement` draws each on-screen product image
      // onto a 2D canvas for readback, which forces a GPU→CPU texture readback
      // per image. This early return (above that call) means the safe path
      // never touches the canvas. Default rendering is unchanged.
      if (isConstrainedDevice()) {
        setPalette(FALLBACK_PALETTE);
        setReady(true);
        return;
      }
      if (getCachedPalette(src)) {
        setPalette(getCachedPalette(src)!);
        setReady(true);
        return;
      }
      const sampled = getImagePaletteFromElement(src, img);
      if (sampled) {
        setPalette(sampled);
        setReady(true);
        return;
      }
      // Tainted canvas (CORS). Constrained devices skip the extra decode.
      if (isConstrainedDevice()) {
        setReady(true);
        return;
      }
      let active = true;
      void getImagePalette(src).then((p) => {
        if (!active) return;
        setPalette(p);
        setReady(true);
      });
      return () => {
        active = false;
      };
    },
    [disablePaletteExtraction, src],
  );

  const imgLoaded = loadedSrc === src;
  // GPU compatibility (centralized via isGpuUnsafe()): show the image with no
  // animated reveal — no opacity fade, no skeleton shimmer, no background
  // transition. These are compositor/paint animations that add GPU work per
  // card; skipping them removes texture churn while the layout stays identical.
  const gpuUnsafe = isGpuUnsafe();
  const revealed = plain || gpuUnsafe || (ready && imgLoaded);

  if (plain) {
    return (
      <div
        data-product-media
        className="relative aspect-square w-full p-[1.5%]"
        style={{ background: "#ffffff" }}
      >
        <ProductImage
          src={src}
          alt={alt}
          width={800}
          height={800}
          priority={priority}
          className={`block h-full w-full object-center ${disableObjectFit ? "" : "object-contain"}`}
        />
      </div>
    );
  }

  return (
    <div
      data-product-media
      className="relative aspect-square w-full overflow-hidden rounded-t-[22px] p-[1.5%]"
      style={{
        background: palette.background,
        transition: gpuUnsafe ? undefined : "background 300ms ease",
      }}
    >
      {/* Skeleton shimmer until palette + bitmap are ready (skipped on GPU-unsafe). */}
      {!revealed && (
        <div
          aria-hidden
          className="absolute inset-0 animate-pulse"
          style={{ background: "rgba(127,127,127,0.08)" }}
        />
      )}

      <ProductImage
        src={src}
        alt={alt}
        width={800}
        height={800}
        priority={priority}
        onLoad={handleImageLoad}
        className={`relative z-[1] block h-full w-full rounded-[14px] object-center ${gpuUnsafe ? "" : "transition-opacity duration-300 ease-out"} ${disableObjectFit ? "" : "object-contain"}`}
        style={gpuUnsafe ? undefined : { opacity: revealed ? 1 : 0 }}
      />

      {children}
    </div>
  );
}

export const AdaptiveProductMedia = memo(AdaptiveProductMediaImpl);
