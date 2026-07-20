import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * FoundOurMarket™ — Luxury Section Banner (final).
 *
 * Centered editorial banner:
 *   [ghost word: huge, uppercase, 5% opacity, behind]
 *      Title (32px, bold, white)
 *      Subtitle (14px, gray)
 *      ── glowing orange divider (80×2px) ──
 *
 * Entrance (once): title fade-up → subtitle fade-up → divider expands from
 * center. 400ms total, GPU transforms only, respects reduced-motion.
 */
export function PremiumSectionHeading({
  eyebrow,
  title,
  subtitle,
  right,
  ghost,
  // Legacy props accepted for API back-compat; intentionally unused.
  icon: _icon,
  live: _live,
  liveLabel: _liveLabel,
  href: _href,
  hrefLabel: _hrefLabel,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  /** Faded background word behind the title. Defaults to uppercase title. */
  ghost?: string;
  icon?: LucideIcon;
  live?: boolean;
  liveLabel?: string;
  href?: string;
  hrefLabel?: string;
}) {
  void _icon;
  void _live;
  void _liveLabel;
  void _href;
  void _hrefLabel;
  void eyebrow; // Eyebrow removed from luxury banner style; kept for back-compat.

  const ref = useRef<HTMLDivElement | null>(null);
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
      { rootMargin: "0px 0px -6% 0px", threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const ghostWord = (ghost ?? title).toUpperCase();

  const baseTransition = "cubic-bezier(0.22, 1, 0.36, 1)";
  const titleStyle: React.CSSProperties = {
    opacity: shown ? 1 : 0,
    transform: shown ? "translate3d(0,0,0)" : "translate3d(0,14px,0)",
    transition: `opacity 420ms ${baseTransition}, transform 420ms ${baseTransition}`,
    willChange: shown ? undefined : "opacity, transform",
  };
  const subStyle: React.CSSProperties = {
    opacity: shown ? 1 : 0,
    transform: shown ? "translate3d(0,0,0)" : "translate3d(0,10px,0)",
    transition: `opacity 420ms ${baseTransition} 120ms, transform 420ms ${baseTransition} 120ms`,
    willChange: shown ? undefined : "opacity, transform",
  };
  const dividerStyle: React.CSSProperties = {
    transform: shown ? "scaleX(1)" : "scaleX(0)",
    opacity: shown ? 1 : 0,
    transformOrigin: "center",
    transition: `transform 460ms ${baseTransition} 220ms, opacity 300ms ${baseTransition} 220ms`,
    willChange: shown ? undefined : "opacity, transform",
  };
  const ghostStyle: React.CSSProperties = {
    opacity: shown ? 0.05 : 0,
    transform: shown ? "translate3d(-50%,-50%,0)" : "translate3d(-50%,-46%,0)",
    transition: `opacity 600ms ${baseTransition}, transform 600ms ${baseTransition}`,
    willChange: shown ? undefined : "opacity, transform",
  };

  return (
    <div ref={ref} className="relative mt-10 mb-8 text-center sm:mt-12 sm:mb-10">
      {/* Ghost editorial word */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 select-none whitespace-nowrap font-display font-black uppercase text-white leading-none"
        style={{
          ...ghostStyle,
          fontSize: "clamp(56px, 14vw, 132px)",
          letterSpacing: "-0.02em",
        }}
      >
        {ghostWord}
      </span>

      {/* Title */}
      <h2
        className="relative font-display font-extrabold tracking-tight text-white"
        style={{
          ...titleStyle,
          fontSize: "clamp(26px, 5.4vw, 34px)",
          lineHeight: 1.05,
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h2>

      {/* Subtitle */}
      {subtitle && (
        <p
          className="relative mx-auto mt-2.5 max-w-[36ch] text-[13px] leading-snug text-white/55 sm:text-[14px]"
          style={subStyle}
        >
          {subtitle}
        </p>
      )}

      {/* Glowing divider */}
      <div className="relative mt-4 flex justify-center sm:mt-5">
        <span
          aria-hidden
          className="block h-[2px] w-[80px] rounded-full"
          style={{
            ...dividerStyle,
            background:
              "linear-gradient(90deg, transparent 0%, oklch(0.74 0.19 49 / 0.95) 50%, transparent 100%)",
            boxShadow:
              "0 0 12px oklch(0.74 0.19 49 / 0.55), 0 0 24px oklch(0.74 0.19 49 / 0.28)",
          }}
        />
      </div>

      {/* Optional right slot (admin toggles, countdowns) — rendered centered below */}
      {right && (
        <div className="relative mt-4 flex justify-center">
          <div className="flex items-center gap-2">{right}</div>
        </div>
      )}
    </div>
  );
}

/**
 * Premium gradient divider — transparent → orange → transparent.
 * Static (no animation). Use between homepage sections.
 */
export function PremiumSectionDivider() {
  return (
    <div aria-hidden className="mx-auto my-8 h-px max-w-7xl sm:my-10">
      <div
        className="mx-6 h-px sm:mx-12"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, oklch(0.74 0.19 49 / 0.22) 50%, transparent 100%)",
        }}
      />
    </div>
  );
}
