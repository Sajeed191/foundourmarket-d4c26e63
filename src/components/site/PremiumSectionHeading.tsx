import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * FoundOurMarket™ — Editorial Section Heading v9 (Luxury Collection Opener).
 *
 * Every homepage section reads like a chapter in a curated collection:
 *
 *   01                       ← huge cropped collection number (top-left, 8% orange)
 *      Main Categories        ← 28px / 900 white title
 *      Editorial description  ← calm one-sentence copy
 *   ───●                     ← 60px orange signature stroke that draws itself
 *
 * Behind the composition sits an oversized faint mirror of the same number.
 * No cards, no borders, no icons, no glass, no ghost words, no glow.
 *
 * Motion (once on enter, 700ms cubic-bezier(.22,1,.36,1))
 *   Number fades → Title slides up → Description fades → Signature draws.
 *
 * Section rhythm: 100px top / 40px bottom.
 * Back-compat: legacy props are accepted but intentionally unused in v9.
 */

const REVEAL_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

// Stable auto-numbering by title (order of first mount = collection order).
const collectionRegistry = new Map<string, number>();
function collectionNumberFor(title: string): number {
  const existing = collectionRegistry.get(title);
  if (existing !== undefined) return existing;
  const next = collectionRegistry.size + 1;
  collectionRegistry.set(title, next);
  return next;
}

export function PremiumSectionHeading({
  title,
  subtitle,
  number,
  // Back-compat — accepted but unused in v9.
  ghost: _ghost,
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
  /** Optional explicit collection number override (1–99). Otherwise auto-assigned. */
  number?: number;
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
  void _ghost;
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

  const collectionNumber = useMemo(() => {
    const n = number ?? collectionNumberFor(title);
    return String(n).padStart(2, "0");
  }, [number, title]);

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

  // ── Styles ────────────────────────────────────────────────────────────────
  const numberStyle: React.CSSProperties = {
    opacity: shown ? 0.08 : 0,
    transform: shown ? "translate3d(0,0,0)" : "translate3d(0,8px,0)",
    transition: `opacity 700ms ${REVEAL_EASE}, transform 700ms ${REVEAL_EASE}`,
    willChange: shown ? undefined : "opacity, transform",
    fontFamily: '"Inter Tight", Inter, ui-sans-serif, system-ui, sans-serif',
    fontWeight: 900,
    fontSize: "clamp(64px, 18vw, 80px)",
    lineHeight: 0.85,
    letterSpacing: "-0.04em",
    color: "rgb(255,140,40)",
  };

  // Oversized faint mirror of the same number as the section's background.
  const bgNumberStyle: React.CSSProperties = {
    opacity: shown ? 0.025 : 0,
    transform: shown ? "translate3d(0,0,0)" : "translate3d(0,12px,0)",
    transition: `opacity 900ms ${REVEAL_EASE}, transform 900ms ${REVEAL_EASE}`,
    willChange: "opacity, transform",
    fontFamily: '"Inter Tight", Inter, ui-sans-serif, system-ui, sans-serif',
    fontWeight: 900,
    fontSize: "clamp(220px, 60vw, 380px)",
    lineHeight: 0.8,
    letterSpacing: "-0.06em",
    color: "rgb(255,140,40)",
    top: "-8%",
    right: "-6%",
  };

  const titleStyle: React.CSSProperties = {
    opacity: shown ? 1 : 0,
    transform: shown ? "translate3d(0,0,0)" : "translate3d(0,16px,0)",
    transition: `opacity 700ms ${REVEAL_EASE} 100ms, transform 700ms ${REVEAL_EASE} 100ms`,
    willChange: shown ? undefined : "opacity, transform",
    fontFamily: '"Inter Tight", Inter, ui-sans-serif, system-ui, sans-serif',
    fontWeight: 900,
    fontSize: "28px",
    lineHeight: 1.2,
    letterSpacing: "-0.02em",
    color: "#ffffff",
  };

  const descStyle: React.CSSProperties = {
    opacity: shown ? 1 : 0,
    transform: shown ? "translate3d(0,0,0)" : "translate3d(0,10px,0)",
    transition: `opacity 700ms ${REVEAL_EASE} 220ms, transform 700ms ${REVEAL_EASE} 220ms`,
    willChange: shown ? undefined : "opacity, transform",
    fontSize: "13px",
    lineHeight: 1.55,
    color: "rgba(255,255,255,0.58)",
    marginTop: "14px",
    maxWidth: "34ch",
  };

  // Signature: 60px stroke that "draws" (SVG stroke-dashoffset) + tiny glowing dot.
  const STROKE_LEN = 60;
  const sigPathStyle: React.CSSProperties = {
    strokeDasharray: STROKE_LEN,
    strokeDashoffset: shown ? 0 : STROKE_LEN,
    transition: `stroke-dashoffset 700ms ${REVEAL_EASE} 340ms`,
    willChange: shown ? undefined : "stroke-dashoffset",
  };
  const sigDotStyle: React.CSSProperties = {
    opacity: shown ? 1 : 0,
    transform: shown ? "scale(1)" : "scale(0.4)",
    transformOrigin: "center",
    transformBox: "fill-box",
    transition: `opacity 400ms ${REVEAL_EASE} 980ms, transform 400ms ${REVEAL_EASE} 980ms`,
  };

  return (
    <div
      ref={ref}
      className="relative isolate overflow-hidden"
      style={{ marginTop: "100px", marginBottom: "40px" }}
    >
      {/* Oversized faint background number */}
      <span
        aria-hidden
        className="pointer-events-none absolute -z-10 select-none whitespace-nowrap"
        style={bgNumberStyle}
      >
        {collectionNumber}
      </span>

      <div className="relative flex flex-col items-start text-left">
        {/* Collection number (top-left, huge, 8%) */}
        <span aria-hidden className="block select-none" style={numberStyle}>
          {collectionNumber}
        </span>

        {/* Title */}
        <h2 className="mt-3" style={titleStyle}>
          {title}
        </h2>

        {/* Editorial description */}
        {subtitle && <p style={descStyle}>{subtitle}</p>}

        {/* Signature: drawn stroke + glowing dot */}
        <div className="mt-6" aria-hidden>
          <svg
            width={STROKE_LEN + 10}
            height="8"
            viewBox={`0 0 ${STROKE_LEN + 10} 8`}
            fill="none"
            className="block"
          >
            <path
              d={`M 0 4 L ${STROKE_LEN} 4`}
              stroke="rgb(255,140,40)"
              strokeWidth="1.5"
              strokeLinecap="round"
              style={sigPathStyle}
            />
            <circle
              cx={STROKE_LEN + 3}
              cy="4"
              r="1.8"
              fill="rgb(255,140,40)"
              style={{
                ...sigDotStyle,
                filter: "drop-shadow(0 0 3px rgba(255,140,40,0.75))",
              }}
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

/** Kept as a neutral spacer between sections. */
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
