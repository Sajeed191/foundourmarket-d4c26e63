import { memo, useState } from "react";
import { ProductImage } from "@/components/site/ProductImage";
import { useImagePalette } from "@/lib/use-image-palette";

type Props = {
  src: string;
  alt: string;
  priority?: boolean;
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
function AdaptiveProductMediaImpl({ src, alt, priority = false, children }: Props) {
  const { palette, ready } = useImagePalette(src);
  const [imgLoaded, setImgLoaded] = useState(false);
  const revealed = ready && imgLoaded;

  return (
    <div
      data-product-media
      className="relative aspect-square w-full overflow-hidden rounded-t-[22px] p-4 sm:p-5"
      style={{
        background: palette.background,
        transition: "background 300ms ease",
      }}
    >
      {/* Skeleton shimmer until palette + bitmap are ready. */}
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
        onLoad={() => setImgLoaded(true)}
        className="relative z-[1] block h-full w-full rounded-[14px] object-contain object-center transition-[transform,opacity] duration-300 ease-out group-hover:scale-[1.03]"
        style={{ opacity: revealed ? 1 : 0 }}
      />

      {children}
    </div>
  );
}

export const AdaptiveProductMedia = memo(AdaptiveProductMediaImpl);
