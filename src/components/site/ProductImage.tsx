import { useState } from "react";
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
};

/**
 * Device-aware product image: serves WebP via srcset (320/640/960/1280),
 * downloads only the size the viewport needs, and blurs up from a tiny LQIP
 * placeholder. Below-the-fold instances lazy-load by default.
 */
export function ProductImage({
  src,
  alt,
  sizes = "(min-width: 1024px) 300px, (min-width: 640px) 45vw, 76vw",
  className = "",
  priority = false,
  width = 800,
  height = 600,
}: Props) {
  const responsive = getResponsiveImage(src);
  const [loaded, setLoaded] = useState(false);

  return (
    <>
      {!loaded && (
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center scale-110 blur-xl"
          style={responsive ? { backgroundImage: `url(${responsive.placeholder})` } : undefined}
        />
      )}
      <img
        src={src}
        srcSet={responsive?.srcset}
        sizes={responsive ? sizes : undefined}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={`${className} ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </>
  );
}
