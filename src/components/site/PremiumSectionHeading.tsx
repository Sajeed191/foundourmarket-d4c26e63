import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * FoundOurMarket™ — Signature Section Heading (Apple × Nike × Luxury).
 *
 * Layout (per section spec):
 *   [huge ghost word — 56–72px, 900, 0.03–0.05 opacity, letter-spacing 6–10px]
 *      Title (28–32px, 800, pure white, tight tracking)
 *      Subtitle (13–14px, medium gray, max ~220px, aligned)
 *      ● ━━━━━━━━━━ ●  ← glowing orange capsule w/ dot ends, 90px, soft glow
 *
 * Alignment: `align="center" | "left"` — alternating rhythm across the page.
 * Background: soft radial orange glow (2–4%) behind the heading.
 * Motion (once): ghost fade → title slide-up → subtitle fade → capsule expand
 * from center. 450–500ms, GPU transforms only, respects reduced-motion.
 */
export function PremiumSectionHeading({
  title,
  subtitle,
  right,
  ghost,
  align = "center",
  // Legacy props accepted for API back-compat; intentionally unused.
  eyebrow: _eyebrow,
  icon: _icon,
  live: _live,
  liveLabel: _liveLabel,
  href: _href,
  hrefLabel: _hrefLabel,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  /** Faded background word behind the title. Defaults to first word of title uppercased. */
  ghost?: string;
  align?: "center" | "left";
  eyebrow?: string;
  icon?: LucideIcon;
  live?: boolean;
  liveLabel?: string;
  href?: string;
  hrefLabel?: string;
}) {
  void _eyebrow;
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

  const ghostWord = (ghost ?? title.split(/\s+/)[0] ?? title).toUpperCase();
  const isCenter = align === "center";

  const ease = "cubic-bezier(0.22, 1, 0.36, 1)";
  const titleStyle: React.CSSProperties = {
    opacity: shown ? 1 : 0,
    transform: shown ? "translate3d(0,0,0)" : "translate3d(0,12px,0)",
    transition: `opacity 480ms ${ease}, transform 480ms ${ease}`,
    willChange: shown ? undefined : "opacity, transform",
  };
  const subStyle: React.CSSProperties = {
    opacity: shown ? 1 : 0,
    transform: shown ? "translate3d(0,0,0)" : "translate3d(0,8px,0)",
    transition: `opacity 460ms ${ease} 100ms, transform 460ms ${ease} 100ms`,
    willChange: shown ? undefined : "opacity, transform",
  };
  const capsuleStyle: React.CSSProperties = {
    transform: shown ? "scaleX(1)" : "scaleX(0)",
    opacity: shown ? 1 : 0,
    transformOrigin: "center",
    transition: `transform 500ms ${ease} 200ms, opacity 320ms ${ease} 200ms`,
    willChange: shown ? undefined : "opacity, transform",
  };
  const ghostTranslate = isCenter ? "-50%,-50%" : "0,-50%";
  const ghostStyle: React.CSSProperties = {
    opacity: shown ? 0.045 : 0,
    transform: shown
      ? `translate3d(${ghostTranslate},0)`
      : `translate3d(${isCenter ? "-50%,-46%" : "0,-46%"},0)`,
    transition: `opacity 700ms ${ease}, transform 700ms ${ease}`,
    willChange: shown ? undefined : "opacity, transform",
  };

  const alignClasses = isCenter ? "text-center items-center" : "text-left items-start";
  const subtitleAlign = isCenter ? "mx-auto" : "mx-0";
  const capsuleWrapAlign = isCenter ? "justify-center" : "justify-start";
  const glowPos = isCenter
    ? { left: "50%", transform: "translateX(-50%)" }
    : { left: "-6%" };

  return (
    <div
      ref={ref}
      className={`relative mt-10 mb-8 flex flex-col ${alignClasses} sm:mt-12 sm:mb-10`}
    >
      {/* Radial ambient glow */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 -z-10 h-[220px] w-[420px] -translate-y-1/2 rounded-full"
        style={{
          ...glowPos,
          background:
            "radial-gradient(ellipse at center, oklch(0.74 0.19 49 / 0.09) 0%, oklch(0.74 0.19 49 / 0.03) 40%, transparent 70%)",
          filter: "blur(6px)",
        }}
      />

      {/* Huge ghost editorial word */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 select-none whitespace-nowrap font-display font-black uppercase text-white leading-none"
        style={{
          ...ghostStyle,
          ...(isCenter ? { left: "50%" } : { left: "-0.04em" }),
          fontSize: "clamp(52px, 13vw, 76px)",
          letterSpacing: "0.08em",
        }}
      >
        {ghostWord}
      </span>

      {/* Title */}
      <h2
        className="relative font-display font-extrabold tracking-tight text-white"
        style={{
          ...titleStyle,
          fontSize: "clamp(26px, 5.2vw, 32px)",
          lineHeight: 1.05,
          letterSpacing: "-0.015em",
          fontWeight: 800,
        }}
      >
        {title}
      </h2>

      {/* Subtitle */}
      {subtitle && (
        <p
          className={`relative mt-2.5 max-w-[220px] text-[13px] leading-snug text-white/55 sm:text-[14px] ${subtitleAlign}`}
          style={subStyle}
        >
          {subtitle}
        </p>
      )}

      {/* Signature glowing capsule ● ━━━ ● */}
      <div className={`relative mt-4 flex items-center gap-1.5 sm:mt-5 ${capsuleWrapAlign}`}>
        <span
          aria-hidden
          className="flex items-center gap-1.5"
          style={capsuleStyle}
        >
          <span
            className="block size-[6px] rounded-full"
            style={{
              background: "oklch(0.78 0.19 55)",
              boxShadow:
                "0 0 8px oklch(0.78 0.19 55 / 0.9), 0 0 16px oklch(0.78 0.19 55 / 0.5)",
            }}
          />
          <span
            className="block h-[2px] w-[90px] rounded-full"
            style={{
              background:
                "linear-gradient(90deg, oklch(0.78 0.19 55 / 0.9) 0%, oklch(0.74 0.19 49 / 1) 50%, oklch(0.78 0.19 55 / 0.9) 100%)",
              boxShadow:
                "0 0 10px oklch(0.74 0.19 49 / 0.55), 0 0 22px oklch(0.74 0.19 49 / 0.28)",
            }}
          />
          <span
            className="block size-[6px] rounded-full"
            style={{
              background: "oklch(0.78 0.19 55)",
              boxShadow:
                "0 0 8px oklch(0.78 0.19 55 / 0.9), 0 0 16px oklch(0.78 0.19 55 / 0.5)",
            }}
          />
        </span>
      </div>

      {/* Optional right slot (admin toggles, countdowns) */}
      {right && (
        <div className={`relative mt-4 flex ${capsuleWrapAlign}`}>
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
