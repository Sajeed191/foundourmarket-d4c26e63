import { useEffect, useRef, useState } from "react";
import { detectAndroidGpuSafeMode, detectRenderSafe } from "@/lib/use-low-end-device";

/**
 * Defers mounting of its children until the placeholder scrolls near the
 * viewport. Reserves vertical space via `minHeight` to avoid layout shift,
 * keeping CLS low while cutting initial DOM size, listeners and heap usage.
 *
 * Low-End Android Safe Mode: constrained devices benefit MOST from deferral
 * (less concurrent DOM/GPU memory = no compositor OOM corruption), so we no
 * longer force-mount everything on Android. Instead every device uses the
 * IntersectionObserver, plus a safety timeout that guarantees the section
 * mounts even if the observer never fires (some Android WebViews mis-report
 * intersection), so a section can never stay permanently blank.
 */
export function LazyMount({
  children,
  minHeight = 280,
  className,
  rootMargin = "600px 0px",
  id,
}: {
  children: React.ReactNode;
  minHeight?: number;
  className?: string;
  rootMargin?: string;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (show) return;
    if (detectRenderSafe() || detectAndroidGpuSafeMode()) {
      // GPU Safe Mode must avoid observer-driven reveal/animation paths. Mount
      // sections in normal document flow and let CSS/DOM stay completely static.
      setShow(true);
      return;
    }
    const el = ref.current;
    if (!el) {
      setShow(true);
      return;
    }

    let io: IntersectionObserver | null = null;
    // Safety net: never let a section stay blank if the observer mis-fires.
    const fallback = window.setTimeout(() => setShow(true), 4000);

    if (typeof IntersectionObserver === "undefined") {
      setShow(true);
    } else {
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            setShow(true);
            io?.disconnect();
          }
        },
        { rootMargin },
      );
      io.observe(el);
    }

    return () => {
      window.clearTimeout(fallback);
      io?.disconnect();
    };
  }, [show, rootMargin]);

  return (
    <div ref={ref} id={id} className={className} style={show ? undefined : { minHeight }}>
      {show ? children : null}
    </div>
  );
}

export default LazyMount;
