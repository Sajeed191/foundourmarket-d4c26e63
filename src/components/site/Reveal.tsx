import { Suspense, lazy, type ReactNode } from "react";

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
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
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
  // Fixed en-US grouping so SSR (worker) and client render identical text
  // (avoids a hydration mismatch from locale-dependent toLocaleString()).
  const formatted =
    (decimals > 0 ? to.toFixed(decimals) : Math.round(to).toLocaleString("en-US")) + suffix;
  return (
    <Suspense fallback={<span>{formatted}</span>}>
      <MotionCounter to={to} suffix={suffix} duration={duration} decimals={decimals} />
    </Suspense>
  );
}
