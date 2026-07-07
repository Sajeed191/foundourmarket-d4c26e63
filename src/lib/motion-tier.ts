/**
 * ⚡ Low-End Android Motion Constraint System
 * -------------------------------------------
 * Implements a *controlled* (not merely reduced) motion architecture. The core
 * principle is "reduce concurrent motion, not motion quality": animations stay
 * smooth, but on constrained devices we limit how many run at once and forbid
 * continuous GPU pressure during scroll.
 *
 * Two independent, complementary layers — this file does NOT duplicate the
 * capability governor in runtime-capability.ts (that toggles data-degrade-effects
 * based on measured FPS). Instead it adds:
 *
 *   1. A stable device TIER (high | mid | low) exposed via <html data-motion-tier>
 *      and the useMotionTier() hook, so components can branch how much motion
 *      they schedule (e.g. skip stagger chains, use a static active-tab highlight).
 *
 *   2. A SCROLL-ACTIVITY flag exposed via <html data-scrolling="true"> while the
 *      user is actively scrolling. CSS uses it to freeze secondary/continuous
 *      animations (the active-tab pulse, decorative floats) so the only motion
 *      during a scroll is the navbar transform — a deterministic frame pipeline.
 *      The flag clears a short, tier-aware delay after scrolling stops.
 */

import { isGpuUnsafe } from "@/lib/gpu-compat";

export type MotionTier = "high" | "mid" | "low";

// ── Cheap tier signals ──────────────────────────────────────────────────────

function readReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

function readSaveData(): boolean {
  if (typeof navigator === "undefined") return false;
  const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return c?.saveData === true;
}

function readCores(): number | undefined {
  if (typeof navigator === "undefined") return undefined;
  const c = navigator.hardwareConcurrency;
  return typeof c === "number" && c > 0 ? c : undefined;
}

function readDeviceMemory(): number | undefined {
  if (typeof navigator === "undefined") return undefined;
  const m = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof m === "number" && m > 0 ? m : undefined;
}

/**
 * Synchronous device tier classification.
 *   low  → strict constraints (reduced-motion/save-data, ≤2 cores, or ≤2GB RAM,
 *          or already in Safe Mode / GPU-unsafe).
 *   mid  → reduced overlaps (≤4 cores or ≤4GB RAM).
 *   high → full system.
 *
 * The live FPS governor can DEMOTE the tier at runtime (see startMotionTier):
 * sustained sub-45fps pushes a mid/high device down a step so motion scheduling
 * tightens exactly when the hardware proves it needs it.
 */
export function computeMotionTier(): MotionTier {
  if (typeof window === "undefined") return "high";

  // Explicit intent or an already-active safe/compat mode → strictest tier.
  if (readReducedMotion() || readSaveData()) return "low";
  if (
    isGpuUnsafe() ||
    (typeof document !== "undefined" &&
      document.documentElement.dataset.lowEnd === "true")
  ) {
    return "low";
  }

  const cores = readCores();
  const mem = readDeviceMemory();

  if ((cores !== undefined && cores <= 2) || (mem !== undefined && mem <= 2)) {
    return "low";
  }
  if ((cores !== undefined && cores <= 4) || (mem !== undefined && mem <= 4)) {
    return "mid";
  }
  return "high";
}

// ── State + subscriptions ────────────────────────────────────────────────────

let started = false;
const tierListeners = new Set<(tier: MotionTier) => void>();
let currentTier: MotionTier = "high";

function applyTier(tier: MotionTier) {
  if (typeof document === "undefined") return;
  if (tier === currentTier && document.documentElement.dataset.motionTier === tier) return;
  currentTier = tier;
  document.documentElement.dataset.motionTier = tier;
  tierListeners.forEach((fn) => fn(tier));
}

export function getMotionTier(): MotionTier {
  if (typeof document === "undefined") return "high";
  return (document.documentElement.dataset.motionTier as MotionTier) || currentTier;
}

export function subscribeMotionTier(fn: (tier: MotionTier) => void): () => void {
  tierListeners.add(fn);
  return () => tierListeners.delete(fn);
}

/** Effective scroll-settle dampening in ms for the current tier. */
export function scrollDampeningMs(tier: MotionTier = getMotionTier()): number {
  // Low-end: stacked latency + slow GPU makes long dampening feel like lag.
  return tier === "low" ? 90 : tier === "mid" ? 120 : 150;
}

/**
 * Boots the motion-tier system. Idempotent. Sets the initial tier attribute,
 * wires a scroll-activity flag (data-scrolling), and demotes the tier if the
 * device sustains poor frame rates. Never reloads or recreates the React tree.
 */
export function startMotionTier(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  applyTier(computeMotionTier());

  // ── Scroll-activity flag ────────────────────────────────────────────────
  // While scrolling, CSS freezes secondary/continuous animation so the only
  // motion is the navbar transform. Clears a tier-aware delay after scroll stops
  // (spec: resume secondary animation ~200ms after scroll ends).
  const root = document.documentElement;
  let settleTimer = 0;
  let scrolling = false;

  const onScroll = () => {
    if (!scrolling) {
      scrolling = true;
      root.dataset.scrolling = "true";
    }
    if (settleTimer) window.clearTimeout(settleTimer);
    const resumeDelay = getMotionTier() === "high" ? 160 : 200;
    settleTimer = window.setTimeout(() => {
      scrolling = false;
      root.dataset.scrolling = "false";
    }, resumeDelay);
  };
  window.addEventListener("scroll", onScroll, { passive: true });

  // React to a late-arriving low-end / GPU-unsafe attribute (boot script may set
  // it after this runs) and to reduced-motion changes.
  try {
    window
      .matchMedia("(prefers-reduced-motion: reduce)")
      .addEventListener("change", () => applyTier(computeMotionTier()));
  } catch {
    /* older browsers: ignore */
  }

  // ── Lightweight FPS demotion ─────────────────────────────────────────────
  // Only ever demotes (never promotes) so it never fights the boot-time tier.
  // A device that proves it drops frames gets tighter motion scheduling.
  let frames = 0;
  let windowStart = performance.now();
  let badSeconds = 0;
  let rafId = 0;
  const tick = (now: number) => {
    frames++;
    if (now - windowStart >= 1000) {
      const fps = (frames * 1000) / (now - windowStart);
      if (fps < 45) {
        badSeconds++;
        if (badSeconds >= 3) {
          if (currentTier === "high") applyTier("mid");
          else if (currentTier === "mid") applyTier("low");
          badSeconds = 0;
        }
      } else {
        badSeconds = 0;
      }
      frames = 0;
      windowStart = now;
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  const onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(rafId);
    } else {
      frames = 0;
      windowStart = performance.now();
      rafId = requestAnimationFrame(tick);
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  window.addEventListener(
    "pagehide",
    () => {
      cancelAnimationFrame(rafId);
      if (settleTimer) window.clearTimeout(settleTimer);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
    },
    { once: true },
  );
}

// ── React hooks ──────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";

/** Live device motion tier. SSR-safe (starts "high", refines after mount). */
export function useMotionTier(): MotionTier {
  const [tier, setTier] = useState<MotionTier>("high");
  useEffect(() => {
    setTier(getMotionTier());
    return subscribeMotionTier(setTier);
  }, []);
  return tier;
}

/** Convenience: true on the strict (low) tier. */
export function useIsLowMotion(): boolean {
  return useMotionTier() === "low";
}
