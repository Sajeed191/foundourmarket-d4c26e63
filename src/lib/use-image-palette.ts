import { useEffect, useState } from "react";
import {
  getImagePalette,
  getCachedPalette,
  FALLBACK_PALETTE,
  type ImagePalette,
} from "@/lib/image-palette";

/**
 * Returns the adaptive palette for a product image. Reads from the synchronous
 * cache first (no flash on revisits), then resolves the async extraction once.
 * `ready` flips true when a real (non-fallback) palette is available so callers
 * can animate the background/product in.
 *
 * Ultra Low-End Android short-circuit: palette extraction loads each product image
 * a SECOND time into a canvas (extra decode + canvas/GPU memory per card). On
 * constrained Android GPUs this contributes to texture-memory pressure and the
 * compositor corruption seen on 4GB devices, so we skip it and render the
 * neutral fallback background immediately.
 */
function isConstrainedDevice(): boolean {
  if (typeof document === "undefined") return false;
  const d = document.documentElement;
  return d.getAttribute("data-ultra-low-end") === "true";
}

export function useImagePalette(src: string | null | undefined) {
  const constrained = isConstrainedDevice();
  const initial = src && !constrained ? getCachedPalette(src) : null;
  const [palette, setPalette] = useState<ImagePalette>(initial ?? FALLBACK_PALETTE);
  const [ready, setReady] = useState<boolean>(constrained || initial != null);

  useEffect(() => {
    // Constrained devices never sample: skip the second decode + canvas memory.
    if (constrained) {
      setPalette(FALLBACK_PALETTE);
      setReady(true);
      return;
    }
    if (!src) {
      setPalette(FALLBACK_PALETTE);
      setReady(false);
      return;
    }
    const cached = getCachedPalette(src);
    if (cached) {
      setPalette(cached);
      setReady(true);
      return;
    }
    let active = true;
    setReady(false);
    void getImagePalette(src).then((p) => {
      if (!active) return;
      setPalette(p);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [src, constrained]);

  return { palette, ready };
}
