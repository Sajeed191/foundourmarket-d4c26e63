import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * FoundOurMarket™ — Luxury editorial section heading (final).
 *
 * Structure:
 *   EYEBROW LABEL            [right slot]
 *   Title (with soft orange brush-stroke accent behind)
 *   Subtitle
 *
 * Typography-first. No icons, no cards, no borders, no in-header "View All".
 * Fades + slides up once on scroll. GPU transforms only.
 */
export function PremiumSectionHeading({
  eyebrow,
  title,
  subtitle,
  right,
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

  const revealStyle: React.CSSProperties = {
    opacity: shown ? 1 : 0,
    transform: shown ? "translate3d(0,0,0)" : "translate3d(0,12px,0)",
    transition:
      "opacity 400ms cubic-bezier(0.22, 1, 0.36, 1), transform 400ms cubic-bezier(0.22, 1, 0.36, 1)",
    willChange: shown ? undefined : "opacity, transform",
  };

  return (
    <div
      ref={ref}
      className="relative mt-12 mb-6"
      style={revealStyle}
    >
      {/* Eyebrow row + optional right controls */}
      <div className="flex items-center justify-between gap-3">
        {eyebrow ? (
          <span
            className="text-[10px] font-medium uppercase leading-none text-white/45 sm:text-[11px]"
            style={{ letterSpacing: "0.42em" }}
          >
            {eyebrow}
          </span>
        ) : (
          <span />
        )}
        {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
      </div>

      {/* Title with brush-stroke accent behind */}
      <div className="relative mt-3 inline-block max-w-full">
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 top-1/2 h-[3px] w-[78px] -translate-y-1/2 rounded-full"
          style={{
            background:
              "linear-gradient(90deg, oklch(0.74 0.19 49 / 0.85) 0%, oklch(0.74 0.19 49 / 0) 100%)",
            opacity: 0.75,
          }}
        />
        <h2 className="relative text-[28px] font-display font-extrabold leading-[1.05] tracking-tight text-white sm:text-[32px] lg:text-[34px]">
          {title}
        </h2>
      </div>

      {/* Subtitle */}
      {subtitle && (
        <p className="mt-2 max-w-[70%] text-[13px] leading-snug text-white/55 sm:text-[14px]">
          {subtitle}
        </p>
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
