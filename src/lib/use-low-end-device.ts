import { useEffect, useState } from "react";

/**
 * Detects constrained devices so expensive effects (per-element motion layers,
 * GPU compositing, continuous animations) can be skipped — preventing the
 * compositing artifacts (ghosted/duplicated images, stacked cards, flicker)
 * seen on 1–4GB-RAM Android phones and slow CPUs during fast scroll.
 *
 * "Low-end" = the OS reports ≤4GB RAM, ≤4 logical cores, or the user has
 * requested reduced motion. SSR-safe: assumes capable until mounted so the
 * server render and first paint stay rich.
 */
function domFlag(name: string): boolean | null {
  if (typeof document === "undefined") return null;
  const value = document.documentElement.dataset[name];
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function detectSaveData(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean };
    mozConnection?: { saveData?: boolean };
    webkitConnection?: { saveData?: boolean };
  }).connection ?? (navigator as Navigator & { mozConnection?: { saveData?: boolean } }).mozConnection ??
    (navigator as Navigator & { webkitConnection?: { saveData?: boolean } }).webkitConnection;
  return connection?.saveData === true;
}

function constrainedSignals(): { mem?: number; cores?: number; saveData: boolean; reduced: boolean; memKnown: boolean } {
  const mem = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const cores = typeof navigator === "undefined" ? undefined : navigator.hardwareConcurrency;
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return {
    mem,
    cores,
    saveData: detectSaveData(),
    reduced,
    memKnown: typeof mem === "number" && mem > 0,
  };
}

export function detectLowEndDevice(): boolean {
  return detect();
}

/**
 * Diagnostic "render=safe" mode.
 *
 * Activated by the `?render=safe` query parameter (or the `data-render-safe`
 * attribute the inline boot script sets from it). It renders the simplest
 * possible HTML + <img> page with NO compositor-triggering features at all:
 * no animations/transforms/filters/backdrop-filters/transitions, no
 * contain/content-visibility/will-change, no lazy loading, no virtualization,
 * no service worker, no image-decode/createImageBitmap/canvas/WebGL paths,
 * eager <img loading="eager" decoding="sync"> using only `src` (no srcset).
 *
 * If corruption still appears in this mode, the cause is outside the app
 * (Chrome's compositor or the device GPU driver).
 */
let renderSafeCached: boolean | null = null;
export function detectRenderSafe(): boolean {
  if (renderSafeCached !== null) return renderSafeCached;
  if (typeof window === "undefined") return false;
  let value = false;
  try {
    value = new URLSearchParams(window.location.search).get("render") === "safe";
  } catch {
    value = false;
  }
  if (!value && typeof document !== "undefined") {
    value = document.documentElement.getAttribute("data-render-safe") === "true";
  }
  renderSafeCached = value;
  return value;
}

function detect(): boolean {
  if (typeof navigator === "undefined") return false;
  const flagged = domFlag("lowEnd");
  if (flagged !== null) return flagged;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const cores = navigator.hardwareConcurrency;
  const android = detectAndroid();
  const { reduced, saveData } = constrainedSignals();
  if (reduced) return true;
  if (saveData) return true;
  if (typeof mem === "number" && mem > 0 && mem <= 4) return true;
  if (typeof cores === "number" && cores > 0 && cores <= 4) return true;
  // Some Android Chrome builds hide deviceMemory. On those devices, start in
  // safe mode instead of briefly mounting blur/3D layers before hooks update.
  if (android && typeof mem !== "number") return true;
  return false;
}

export function useLowEndDevice(): boolean {
  // SSR-consistent: the server has no navigator/DOM flag and renders the
  // "capable" baseline, so the first client render MUST match it. Detection is
  // applied in the effect below after mount. Reading detect() in the initializer
  // produces a hydration mismatch on flagged Android devices, which forces React
  // to regenerate the whole tree (the black-flash / reload corruption).
  const [low, setLow] = useState(false);
  useEffect(() => {
    setLow(detect());
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const onChange = () => setLow(detect());
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return low;
}

/**
 * Detects Android Chrome / WebView / Samsung Internet. These browsers share a
 * compositor bug where many promoted layers (transform + will-change + contain:
 * paint) fail to invalidate during fast scroll, producing ghosted/duplicated
 * cards and horizontal glitch lines. We use this to switch the product grid to
 * a transform-free incremental rendering strategy on Android. SSR-safe.
 */
export function detectAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

/**
 * Ultra Low-End Android = Android plus the constrained-device signal that is
 * known to trigger Chrome compositor / GPU texture corruption on 4GB devices.
 * This is intentionally narrower than `low-end`: desktop/iOS reduced-motion
 * users keep the normal visual design, while weak Android gets a fully flat DOM.
 */
export function detectUltraLowEndAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  const flagged = domFlag("ultraLowEnd");
  if (flagged !== null) return flagged;
  return detectAndroidGpuSafeMode();
}

/**
 * Android GPU Safe Mode is the strict compositor-avoidance profile for the
 * Mali/MediaTek + 4GB class of phones. It intentionally checks only Android and
 * the requested hardware/network constraints, then keeps the DOM/CSS in a
 * software-safe, static e-commerce layout.
 */
export function detectAndroidGpuSafeMode(): boolean {
  if (typeof navigator === "undefined") return false;
  const flagged = domFlag("androidGpuSafeMode");
  if (flagged !== null) return flagged;
  if (!detectAndroid()) return false;
  const { mem, cores, saveData, reduced, memKnown } = constrainedSignals();
  // Genuinely-weak signals only. We intentionally do NOT enable Safe Mode just
  // because `deviceMemory` is absent: Chrome on Android frequently omits/caps
  // this value (it buckets to powers of two, max 8), so a perfectly capable
  // 4–6GB phone reports `4` or nothing. Treating "unknown memory" as weak swept
  // capable mid-range phones into the most aggressive flat path, where the hero
  // image was deprioritized and never painted (blank-hero bug). Safe Mode now
  // requires a real constraint signal.
  void memKnown;
  return (
    saveData ||
    reduced ||
    (typeof mem === "number" && mem > 0 && mem <= 4 && typeof cores === "number" && cores > 0 && cores <= 4)
  );
}

/** Android WebView (in-app browsers: Instagram, FB, etc.) — the worst offender
 *  for compositor corruption. UA contains "; wv" or lacks a real browser token. */
export function detectAndroidWebView(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (!/Android/i.test(ua)) return false;
  return /; wv\)/i.test(ua) || /\bwv\b/i.test(ua);
}

/** Samsung Internet — its own compositor quirks under fast fling scroll. */
export function detectSamsungInternet(): boolean {
  if (typeof navigator === "undefined") return false;
  return /SamsungBrowser/i.test(navigator.userAgent);
}

/**
 * Decide whether to use the transform-free Incremental Rendering Grid instead
 * of the window virtualizer. This is NOT a RAM-only decision — it combines:
 *   1. Browser compatibility: any Android browser (Chrome / WebView / Samsung)
 *      shares the layer-invalidation bug, so all Android falls back.
 *   2. Device capability: very constrained devices (≤4GB RAM / ≤4 cores) or
 *      reduced-motion users, regardless of platform, where recycled virtual
 *      rows are more likely to thrash the compositor.
 * Desktop / iOS / capable browsers keep the virtualizer untouched. SSR-safe
 * (returns false until mounted so SSR + first paint use the plain grid).
 */
export function shouldUseIncrementalRendering(): boolean {
  if (typeof navigator === "undefined") return false;
  return detectAndroid() || detect();
}

export function useIsAndroid(): boolean {
  const [android, setAndroid] = useState(false);
  useEffect(() => {
    setAndroid(detectAndroid());
  }, []);
  return android;
}

export function useUltraLowEndAndroid(): boolean {
  // SSR-consistent baseline; see useLowEndDevice for why the initializer must
  // not read detection (hydration mismatch -> full client regeneration).
  const [ultra, setUltra] = useState(false);
  useEffect(() => {
    setUltra(detectUltraLowEndAndroid());
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const onChange = () => setUltra(detectUltraLowEndAndroid());
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return ultra;
}

export function useAndroidGpuSafeMode(): boolean {
  // SSR-consistent baseline; detection applied post-mount to avoid the
  // hydration mismatch that regenerated the whole tree on Android.
  const [safe, setSafe] = useState(false);
  useEffect(() => {
    setSafe(detectAndroidGpuSafeMode());
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const onChange = () => setSafe(detectAndroidGpuSafeMode());
    mq?.addEventListener?.("change", onChange);
    return () => mq?.removeEventListener?.("change", onChange);
  }, []);
  return safe;
}

/** Live flag: should the product grid use incremental (non-virtualized) rendering? */
export function useIncrementalRendering(): boolean {
  const [incremental, setIncremental] = useState(false);
  useEffect(() => {
    setIncremental(shouldUseIncrementalRendering());
  }, []);
  return incremental;
}


export type DeviceTier = "high" | "mid" | "low";

/**
 * Three-tier device-capability classifier for adaptively scaling expensive
 * visual effects (visible card count, blur strength, glow, shadows, animation).
 *
 *   low  — ≤4GB RAM, ≤4 cores, OR prefers-reduced-motion. Minimal blur, no
 *          heavy glow, simplest animations.
 *   high — ≥8GB RAM AND ≥8 cores (and no reduced-motion). Full effects.
 *   mid  — everything in between. Medium blur, reduced shadows.
 *
 * SSR-safe: assumes "high" until mounted so SSR + first paint stay rich, then
 * downgrades on the client once real capabilities are known.
 */
function detectTier(): DeviceTier {
  if (typeof navigator === "undefined") return "high";
  if (detect()) return "low";
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return "low";
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const cores = navigator.hardwareConcurrency;
  if ((typeof mem === "number" && mem > 0 && mem <= 4) ||
      (typeof cores === "number" && cores > 0 && cores <= 4)) {
    return "low";
  }
  const memHigh = typeof mem !== "number" || mem === 0 || mem >= 8;
  const coresHigh = typeof cores !== "number" || cores === 0 || cores >= 8;
  if (memHigh && coresHigh) return "high";
  return "mid";
}

export function useDeviceTier(): DeviceTier {
  // SSR-consistent baseline ("high" matches the server render); real tier is
  // applied post-mount to keep hydration stable.
  const [tier, setTier] = useState<DeviceTier>("high");
  useEffect(() => {
    setTier(detectTier());
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const onChange = () => setTier(detectTier());
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return tier;
}
