import { memo, useEffect, useState } from "react";
import { ProductImage } from "@/components/site/ProductImage";
import { useImagePalette } from "@/lib/use-image-palette";
import { useAndroidGpuSafeMode, useUltraLowEndAndroid } from "@/lib/use-low-end-device";

type Props = {
  src: string;
  alt: string;
  priority?: boolean;
  /** layouttest=simple: plain rectangle, no overflow/radius/isolation. */
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
  const ultraLowEndAndroid = useUltraLowEndAndroid();
  const androidGpuSafeMode = useAndroidGpuSafeMode();
  const { palette, ready } = useImagePalette(src);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  useEffect(() => setLoadedSrc(null), [src]);
  const imgLoaded = loadedSrc === src;
  const safeStatic = ultraLowEndAndroid || androidGpuSafeMode;
  const revealed = plain || safeStatic || (ready && imgLoaded);

  if (plain) {
    // layouttest=simple: plain rectangle — no overflow clip, radius, mask, or
    // isolation. Same image, same data, no overlays.
    return (
      <div
        data-product-media
        data-layouttest="simple"
        className="relative aspect-square w-full p-[1.5%]"
        style={{
          background: "#ffffff",
          overflow: "visible",
          borderRadius: 0,
          clipPath: "none",
          WebkitMask: "none",
          mask: "none",
          isolation: "auto",
          contain: "none",
          position: "static",
          zIndex: "auto",
        }}
      >
        <ProductImage
          src={src}
          alt={alt}
          width={800}
          height={800}
          priority={priority}
          className="block h-full w-full object-contain object-center"
        />
      </div>
    );
  }

  return (
    <div
      data-product-media
      className="relative aspect-square w-full overflow-hidden rounded-t-[22px] p-[1.5%]"
      style={{
        background: safeStatic ? "#ffffff" : palette.background,
        transition: safeStatic ? "none" : "background 300ms ease",
      }}
    >
      {/* Skeleton shimmer until palette + bitmap are ready. */}
      {!safeStatic && !revealed && (
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
        onLoad={safeStatic ? undefined : () => setLoadedSrc(src)}
        className={
          safeStatic
            ? "relative z-[1] block h-full w-full rounded-[14px] object-contain object-center"
            : "relative z-[1] block h-full w-full rounded-[14px] object-contain object-center transition-[transform,opacity] duration-300 ease-out group-hover:scale-[1.03]"
        }
        style={{ opacity: revealed ? 1 : 0 }}
      />

      {children}
    </div>
  );
}

export const AdaptiveProductMedia = memo(AdaptiveProductMediaImpl);
