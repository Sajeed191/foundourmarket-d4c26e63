import { useEffect, useRef, useState } from "react";
import { detectAndroid } from "@/lib/use-low-end-device";

/**
 * Defers mounting of its children until the placeholder scrolls near the
 * viewport. Reserves vertical space via `minHeight` to avoid layout shift,
 * keeping CLS low while cutting initial DOM size, listeners and heap usage.
 */
export function LazyMount({
  children,
  minHeight = 280,
  className,
  rootMargin = "400px 0px",
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
    if (detectAndroid()) {
      setShow(true);
      return;
    }
    const el = ref.current;
    if (!el || show) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [show, rootMargin]);
  return (
    <div ref={ref} id={id} className={className} style={show ? undefined : { minHeight }}>
      {show ? children : null}
    </div>
  );
}

export default LazyMount;
