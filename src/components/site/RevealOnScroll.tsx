import { useEffect, useRef, useState } from "react";

/**
 * Phase 4 polish primitive.
 * Fades + gently slides children upward (8px) the first time they cross the
 * viewport. Uses only opacity + transform (GPU-friendly), respects
 * `prefers-reduced-motion`, and unmounts the observer after firing so it never
 * costs anything for the rest of the page's lifetime.
 */
export function RevealOnScroll({
  children,
  as: Tag = "div",
  delay = 0,
  className = "",
  distance = 10,
  duration = 500,
}: {
  children: React.ReactNode;
  as?: React.ElementType;
  delay?: number;
  className?: string;
  distance?: number;
  duration?: number;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const style: React.CSSProperties = {
    opacity: shown ? 1 : 0,
    transform: shown ? "translate3d(0,0,0)" : `translate3d(0,${distance}px,0)`,
    transition: `opacity ${duration}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms, transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
    willChange: shown ? undefined : "opacity, transform",
  };

  return (
    <Tag ref={ref as never} style={style} className={className}>
      {children}
    </Tag>
  );
}
