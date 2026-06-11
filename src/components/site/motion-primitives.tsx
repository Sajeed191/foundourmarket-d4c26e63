import { motion, useInView, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * framer-motion implementations of the homepage reveal + counter animations.
 * This module is ONLY imported lazily (see ./Reveal.tsx), so framer-motion is
 * code-split out of the homepage initial bundle and fetched after hydration,
 * right before the below-the-fold sections animate into view.
 */

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] as const },
  }),
};

export function MotionReveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      custom={delay}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function MotionCounter({
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
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { duration: duration * 1000, bounce: 0 });
  const display = useTransform(spring, (v) =>
    (decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString("en-US")) + suffix,
  );
  useEffect(() => {
    if (inView) mv.set(to);
  }, [inView, to, mv]);
  return <motion.span ref={ref}>{display}</motion.span>;
}
