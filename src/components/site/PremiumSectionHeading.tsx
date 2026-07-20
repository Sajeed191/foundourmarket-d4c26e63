import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * FoundOurMarket™ — Editorial Section Heading v7 (Magazine Chapter Opener).
 *
 * Composition
 *   [enormous ghost word — 90-140px, 900, uppercase, 3-5% opacity, cropped by edges]
 *   Title (30px, 800, pure white — no glow, no shadow)
 *   Subtitle (12px, neutral gray, one sentence)
 *   ── 80px × 1px divider, rgba(255,140,40,.4), grows left→right ──
 *
 * Motion (once on enter, 650ms cubic-bezier(.22,1,.36,1))
 *   Ghost word drifts up ~20px + fades in.
 *   Title fades + slides up.
 *   Subtitle fades in 120ms later.
 *   Divider expands from 0 → 80px.
 *
 * Background: one soft radial orange spotlight (~4%, large blur). Nothing else.
 *
 * Legacy props (align/eyebrow/badge/right/icon/live/liveLabel/href/hrefLabel)
 * are accepted for API back-compat but intentionally unused — the v7 design is
 * a single centered, minimal composition per spec.
 */

const REVEAL_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

export function PremiumSectionHeading({
  title,
  subtitle,
  ghost,
  // Back-compat — accepted but unused in v7.
  right: _right,
  align: _align,
  eyebrow: _eyebrow,
  badge: _badge,
  icon: _icon,
  live: _live,
  liveLabel: _liveLabel,
  href: _href,
  hrefLabel: _hrefLabel,
}: {
  title: string;
  subtitle?: string;
  ghost?: string;
  right?: ReactNode;
  align?: "center" | "left";
  eyebrow?: string;
  badge?: string;
  icon?: LucideIcon;
  live?: boolean;
  liveLabel?: string;
  href?: string;
  hrefLabel?: string;
}) {
  void _right;
  void _align;
  void _eyebrow;
  void _badge;
  void _icon;
  void _live;
  void _liveLabel;
  void _href;
  void _hrefLabel;

  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (prefersReduced) {
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
      { rootMargin: "0px 0px -8% 0px", threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const ghostWord = (ghost ?? title.split(/\s+/)[0] ?? title).toUpperCase();

  const ghostStyle: React.CSSProperties = {
    opacity: shown ? 0.04 : 0,
    transform: shown
      ? "translate3d(-50%, calc(-50% - 20px), 0)"
      : "translate3d(-50%, -50%, 0)",
    transition: `opacity 800ms ${REVEAL_EASE}, transform 800ms ${REVEAL_EASE}`,
    willChange: "opacity, transform",
    fontFamily: '"Inter Tight", Inter, ui-sans-serif, system-ui, sans-serif',
    fontWeight: 900,
    fontSize: "clamp(90px, 30vw, 140px)",
    letterSpacing: "-6px",
    lineHeight: 0.9,
    color: "white",
    top: "50%",
    left: "50%",
  };

  const titleStyle: React.CSSProperties = {
    opacity: shown ? 1 : 0,
    transform: shown ? "translate3d(0,0,0)" : "translate3d(0,12px,0)",
    transition: `opacity 650ms ${REVEAL_EASE}, transform 650ms ${REVEAL_EASE}`,
    willChange: shown ? undefined : "opacity, transform",
    fontFamily: '"Inter Tight", Inter, ui-sans-serif, system-ui, sans-serif',
    fontWeight: 800,
    fontSize: "30px",
    lineHeight: 1.1,
    letterSpacing: "-0.018em",
    color: "#ffffff",
  };

  const subStyle: React.CSSProperties = {
    opacity: shown ? 1 : 0,
    transform: shown ? "translate3d(0,0,0)" : "translate3d(0,8px,0)",
    transition: `opacity 650ms ${REVEAL_EASE} 120ms, transform 650ms ${REVEAL_EASE} 120ms`,
    willChange: shown ? undefined : "opacity, transform",
    fontSize: "12px",
    color: "rgba(255,255,255,0.55)",
  };

  const dividerStyle: React.CSSProperties = {
    width: shown ? "80px" : "0px",
    height: "1px",
    background: "rgba(255,140,40,0.4)",
    transition: `width 600ms ${REVEAL_EASE} 220ms`,
    willChange: shown ? undefined : "width",
  };

  return (
    <div
      ref={ref}
      className="relative isolate flex flex-col items-center overflow-hidden text-center"
      style={{
        marginTop: "72px",
        marginBottom: "28px",
      }}
    >
      {/* Soft radial orange spotlight (~4%) */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[280px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(255,140,40,0.04) 0%, rgba(255,140,40,0.02) 45%, transparent 72%)",
          filter: "blur(24px)",
        }}
      />

      {/* Enormous ghost word */}
      <span
        aria-hidden
        className="pointer-events-none absolute -z-10 select-none whitespace-nowrap uppercase"
        style={ghostStyle}
      >
        {ghostWord}
      </span>

      {/* Title */}
      <h2 className="relative" style={titleStyle}>
        {title}
      </h2>

      {/* Subtitle */}
      {subtitle && (
        <p className="relative mt-2" style={subStyle}>
          {subtitle}
        </p>
      )}

      {/* Divider */}
      <span aria-hidden className="relative mt-4 block" style={dividerStyle} />
    </div>
  );
}

/**
 * Premium gradient divider — kept as a no-op-friendly spacer between sections.
 */
export function PremiumSectionDivider() {
  return (
    <div aria-hidden className="mx-auto my-10 h-px max-w-7xl sm:my-14">
      <div
        className="mx-6 h-px sm:mx-12"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,140,40,0.18) 50%, transparent 100%)",
        }}
      />
    </div>
  );
}
