import { Suspense, lazy, type ReactNode } from "react";
import { useIsAndroid, useLowEndDevice } from "@/lib/use-low-end-device";

/**
 * Reveal / AnimatedCounter — public API used across the homepage.
 *
 * These wrappers render plain, fully-visible content first (SSR + first paint,
 * great for SEO and zero layout shift), then lazily swap in the framer-motion
 * implementation after hydration. Because framer-motion is only reached through
 * the dynamic import below, it is split out of the homepage initial JS bundle
 * and fetched on demand — right before the below-the-fold sections animate.
 * The user-facing animation, timing and appearance are unchanged.
 */

const MotionReveal = lazy(() =>
  import("./motion-primitives").then((m) => ({ default: m.MotionReveal })),
);
const MotionCounter = lazy(() =>
  import("./motion-primitives").then((m) => ({ default: m.MotionCounter })),
);

export function Reveal({
  children,
  className,
  delay = 0,
  productCardFrame = false,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  productCardFrame?: boolean;
}) {
  const lowEnd = useLowEndDevice();
  const android = useIsAndroid();

  // Product cards must never sit inside a transformed/opacity reveal layer. On
  // Android Chromium/WebView/Samsung this can leave stale glyph tiles while the
  // card, image and buttons remain correctly positioned. Keep card typography in
  // normal document flow on every browser; non-card reveals still animate.
  if (productCardFrame) {
    return <div className={className} data-product-card-frame="">{children}</div>;
  }

  // On Android and constrained devices (≤4GB RAM / few cores / reduced-motion) skip
  // framer-motion entirely: per-element motion layers are the main source of
  // GPU compositing artifacts (ghosted images, stacked cards, flicker) during
  // fast scroll. Content still renders fully — only the entrance animation is
  // dropped on the devices that can't afford it.
  if (android || lowEnd) {
    return <div className={className}>{children}</div>;
  }
  return (
    <Suspense fallback={<div className={className}>{children}</div>}>
      <MotionReveal className={className} delay={delay}>
        {children}
      </MotionReveal>
    </Suspense>
  );
}

export function AnimatedCounter({
  to,
  suffix = "",
  duration = 2,
  decimals = 0,
}: {
  to: number;
  suffix?: string;
  duration?: number;
  decimals?: number;
}) {
  const lowEnd = useLowEndDevice();
  const android = useIsAndroid();
  // Fixed en-US grouping so SSR (worker) and client render identical text
  // (avoids a hydration mismatch from locale-dependent toLocaleString()).
  const formatted =
    (decimals > 0 ? to.toFixed(decimals) : Math.round(to).toLocaleString("en-US")) + suffix;
  if (android || lowEnd) return <span>{formatted}</span>;
  return (
    <Suspense fallback={<span>{formatted}</span>}>
      <MotionCounter to={to} suffix={suffix} duration={duration} decimals={decimals} />
    </Suspense>
  );
}
