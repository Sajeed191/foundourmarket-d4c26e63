import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * FoundOurMarket™ — Editorial Section Heading v11 (Luxury Marketplace).
 *
 * Concept 1 — Editorial Minimal. Inspired by Apple, Aesop, B&O, Porsche, COS.
 *
 *   FEATURED COLLECTION
 *   Main Categories
 *   Discover curated collections for every lifestyle.
 *   ────────────
 *
 * - Small uppercase editorial eyebrow
 * - Large luxurious title
 * - Optional one-line subtitle (max 1 line)
 * - Hairline divider that grows left→right on reveal
 * - No "View All", no icons, no orange badges, no gradients, no glow
 * - Compact vertical rhythm: ~14px above, ~16px below
 *
 * Motion (on enter viewport, once):
 *   eyebrow  → opacity 0→1, translateY 8→0            (220ms)
 *   title    → opacity 0→1, translateY 8→0, +40ms
 *   subtitle → opacity 0→1, +120ms
 *   divider  → scaleX 0→1 from left, +180ms, 260ms
 * Respects prefers-reduced-motion.
 *
 * Back-compat: legacy props (href/hrefLabel/ghost/align/badge/icon/live/liveLabel/number/right)
 * are accepted but intentionally not rendered — the heading owns typography only.
 */

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

export function PremiumSectionHeading({
  title,
  subtitle,
  eyebrow,
  // Back-compat — accepted, not rendered.
  href: _href,
  hrefLabel: _hrefLabel,
  right: _right,
  ghost: _ghost,
  align: _align,
  badge: _badge,
  icon: _icon,
  live: _live,
  liveLabel: _liveLabel,
  number: _number,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  href?: string;
  hrefLabel?: string;
  right?: ReactNode;
  ghost?: string;
  align?: "center" | "left";
  badge?: string;
  icon?: LucideIcon;
  live?: boolean;
  liveLabel?: string;
  number?: number;
}) {
  void _href; void _hrefLabel; void _right; void _ghost; void _align;
  void _badge; void _icon; void _live; void _liveLabel; void _number;

  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduce) {
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
      { rootMargin: "0px 0px -8% 0px", threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const reveal = (delay: number): React.CSSProperties => ({
    opacity: shown ? 1 : 0,
    transform: shown ? "translate3d(0,0,0)" : "translate3d(0,8px,0)",
    transition: `opacity 220ms ${EASE} ${delay}ms, transform 220ms ${EASE} ${delay}ms`,
    willChange: shown ? undefined : "opacity, transform",
  });

  return (
    <div
      ref={ref}
      className="relative mt-3 mb-4 sm:mt-4 sm:mb-5"
    >
      {eyebrow && (
        <div
          style={{
            ...reveal(0),
            fontSize: "10.5px",
            fontWeight: 600,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.46)",
          }}
          className="mb-2"
        >
          {eyebrow}
        </div>
      )}

      <h2
        style={{
          ...reveal(40),
          fontFamily: '"Inter Tight", Inter, ui-sans-serif, system-ui, sans-serif',
          fontWeight: 700,
          letterSpacing: "-0.02em",
          lineHeight: 1.1,
          color: "#ffffff",
          fontSize: "clamp(24px, 5.6vw, 32px)",
        }}
        className="break-words"
      >
        {title}
      </h2>

      {subtitle && (
        <p
          style={{
            ...reveal(120),
            marginTop: "8px",
            fontSize: "13px",
            lineHeight: 1.5,
            color: "rgba(255,255,255,0.55)",
            maxWidth: "52ch",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {subtitle}
        </p>
      )}

      <div
        aria-hidden
        style={{
          marginTop: "12px",
          height: "1px",
          width: "56px",
          background: "rgba(255,255,255,0.22)",
          transformOrigin: "left center",
          transform: shown ? "scaleX(1)" : "scaleX(0)",
          transition: `transform 260ms ${EASE} 180ms`,
          willChange: shown ? undefined : "transform",
        }}
      />
    </div>
  );
}

/** Neutral, tight spacer between sections. */
export function PremiumSectionDivider() {
  return <div aria-hidden className="h-3 sm:h-4" />;
}
