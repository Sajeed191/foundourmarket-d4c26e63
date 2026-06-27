import { useCallback, useEffect, useRef, useState } from "react";
import { getResponsiveImage } from "@/lib/product-images";
import { detectAndroid } from "@/lib/use-low-end-device";

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
  const [android, setAndroid] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [canShowPlaceholder, setCanShowPlaceholder] = useState(false);
  const nodeRef = useRef<HTMLImageElement | null>(null);

  // When the src changes on a recycled/reused element (e.g. a virtualized grid
  // row pointing at a new product), reset the loaded flag so the new image
  // fades in cleanly instead of briefly showing the previous product's photo.
  // Android skips the fade/placeholder path completely so no stale GPU texture
  // upload can overlap a fast fling scroll.
  useEffect(() => {
    const nextAndroid = detectAndroid();
    setAndroid(nextAndroid);
    if (nextAndroid) {
      setLoaded(true);
      setCanShowPlaceholder(false);
      return;
    }
    setCanShowPlaceholder(true);
    const node = nodeRef.current;
    setLoaded(Boolean(node?.complete && node.naturalWidth > 0));
  }, [src]);

  // Callback ref: cancel any decode tied to a stale node and, if the new image
  // is already complete by mount (cached / decoded before React attached
  // onLoad), reveal it immediately. Without this the onLoad event can be missed
  // on fast scroll, leaving the image at opacity-0 and the blurred LQIP visible
  // underneath — which reads as a duplicated/ghosted image on low-end devices.
  const imgRef = useCallback((node: HTMLImageElement | null) => {
    nodeRef.current = node;
    if (!node) return;
    if (detectAndroid()) {
      setLoaded(true);
      return;
    }
    if (node.complete && node.naturalWidth > 0) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    node.decode?.().then(
      () => {
        if (!cancelled) setLoaded(true);
      },
      () => {
        /* decode aborted (node replaced) or failed — onLoad/onError will handle */
      },
    );
    // Stash a canceller so a later ref call (node swap) invalidates this decode.
    (node as HTMLImageElement & { __cancelDecode?: () => void }).__cancelDecode = () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      {canShowPlaceholder && !loaded && (
        <div
          aria-hidden
          data-product-image-placeholder
          className="absolute inset-0 bg-cover bg-center"
          style={responsive ? { backgroundImage: `url(${responsive.placeholder})` } : undefined}
        />
      )}
      <img
        ref={imgRef}
        src={src}
        srcSet={responsive?.srcset}
        sizes={responsive ? sizes : undefined}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "low"}
        decoding={android ? "sync" : "async"}
        onLoad={() => setLoaded(true)}
        data-product-image
        className={`${className} ${android ? "!opacity-100 !transition-none" : !canShowPlaceholder || loaded ? "opacity-100" : "opacity-0"}`}
      />
    </>
  );
}
