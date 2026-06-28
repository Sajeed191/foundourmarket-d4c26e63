import { useEffect, useState } from "react";
import { getWebGLRenderer, isWeakGpu } from "@/lib/runtime-capability";

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

/**
 * Capability gate (RAM-free). A device is treated as "reduced" ONLY for genuine,
 * non-coarse signals: explicit Save-Data / Reduced-Motion intent, a very weak
 * CPU (≤2 cores), or a known weak GPU. RAM is deliberately NOT consulted — it is
 * bucketed/undefined on Android and wrongly demotes capable 4–6GB phones. Real
 * performance problems are handled at runtime by the capability governor
 * (data-degrade-effects), not by guessing from RAM.
 */
function reducedByCapability(): boolean {
  const { cores, saveData, reduced } = constrainedSignals();
  if (reduced || saveData) return true;
  if (typeof cores === "number" && cores > 0 && cores <= 2) return true;
  return false;
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
  // RAM-free capability gate. We no longer demote a device just because it
  // reports ≤4GB or hides deviceMemory — those are coarse/undefined on Android
  // and swept capable 4–6GB phones into the flat path. Only genuine constraints
  // (reduced-motion, save-data, ≤2 cores, known-weak GPU) qualify here.
  if (reducedByCapability()) return true;
  if (isWeakGpu(getWebGLRenderer())) return true;
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
 * Decides whether to render the LIGHTWEIGHT (old) homepage instead of the
 * premium animated one. SSR-safe (returns false until mounted).
 *
 * IMPORTANT: this no longer uses the coarse `deviceMemory`/`cores ≤ 4` gates.
 * `navigator.deviceMemory` is rounded to a power of two AND capped by the
 * browser, so many genuinely capable 8GB+ Android phones (e.g. iQOO Z10R)
 * report `deviceMemory === 4` and were wrongly demoted to the lightweight home.
 * Likewise, 4+ CPU cores is normal for mid-range/flagship phones and is NOT a
 * low-end signal. Real performance problems are handled at runtime by the
 * capability governor (data-degrade-effects), which trims effects WITHOUT
 * switching to the lightweight homepage after load.
 *
 * Triggers ONLY when ANY of these genuine constraints is true:
 *   - explicit DOM override (data-light-home)
 *   - low-end device / Android GPU Safe Mode / Ultra Low-End Android / render=safe
 *     (all RAM-free: reduced-motion, save-data, ≤2 cores, or known-weak GPU)
 *   - Save-Data enabled
 *   - prefers-reduced-motion
 */
export function detectLightweightHome(): boolean {
  if (typeof navigator === "undefined") return false;
  const flagged = domFlag("lightHome");
  if (flagged !== null) return flagged;
  if (
    detectLowEndDevice() ||
    detectAndroidGpuSafeMode() ||
    detectUltraLowEndAndroid() ||
    detectRenderSafe()
  ) {
    return true;
  }
  const { saveData, reduced } = constrainedSignals();
  if (saveData || reduced) return true;
  return false;
}

/**
 * Detailed one-shot diagnostic of the device-detection flow. Logs every signal
 * and the final homepage decision with the deciding reason. Runs once per page
 * load. Always logged so it can be inspected on real hardware without a flag.
 */
let deviceDetectionLogged = false;
export function logDeviceDetection(): void {
  if (deviceDetectionLogged || typeof navigator === "undefined") return;
  deviceDetectionLogged = true;

  const { mem, cores, saveData, reduced } = constrainedSignals();
  const renderer = getWebGLRenderer();
  const weakGpu = isWeakGpu(renderer);
  const lowEnd = detectLowEndDevice();
  const androidSafe = detectAndroidGpuSafeMode();
  const ultraLow = detectUltraLowEndAndroid();
  const renderSafe = detectRenderSafe();
  const lightweight = detectLightweightHome();
  const degraded =
    typeof document !== "undefined" &&
    document.documentElement.dataset.degradeEffects === "true";

  let reason = "Premium (no constraint signals)";
  if (domFlag("lightHome") === true) reason = "Lightweight: data-light-home override";
  else if (domFlag("lightHome") === false) reason = "Premium: data-light-home override";
  else if (reduced) reason = "Lightweight: prefers-reduced-motion";
  else if (saveData) reason = "Lightweight: Save-Data enabled";
  else if (typeof cores === "number" && cores > 0 && cores <= 2)
    reason = "Lightweight: ≤2 CPU cores";
  else if (weakGpu) reason = `Lightweight: weak GPU (${renderer ?? "unknown"})`;
  else if (renderSafe) reason = "Lightweight: ?render=safe diagnostic";

  /* eslint-disable no-console */
  console.log("%c[device-detection]", "color:#ff8a00;font-weight:bold", {
    "detectLightweightHome()": lightweight,
    "detectLowEndDevice()": lowEnd,
    "navigator.deviceMemory": mem,
    "navigator.hardwareConcurrency": cores,
    "connection.saveData": saveData,
    "prefers-reduced-motion": reduced,
    "GPU renderer": renderer,
    "weak GPU": weakGpu,
    "Android GPU Safe Mode": androidSafe,
    "Ultra Low-End Android": ultraLow,
    "render=safe": renderSafe,
    "runtime degraded (data-degrade-effects)": degraded,
    "FINAL homepage": lightweight ? "Lightweight" : "Premium",
    reason,
  });
  /* eslint-enable no-console */
}


export function useLightweightHome(): boolean {
  // SSR-consistent baseline; detection applied post-mount to avoid hydration
  // mismatch (see useLowEndDevice).
  const [light, setLight] = useState(false);
  useEffect(() => {
    logDeviceDetection();
    setLight(detectLightweightHome());
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const onChange = () => setLight(detectLightweightHome());
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return light;
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
  const { cores, saveData, reduced } = constrainedSignals();
  // RAM-free. Safe Mode is the most aggressive flat path, so it is reserved for
  // genuine signals only: explicit Save-Data / Reduced-Motion intent, a very
  // weak CPU (≤2 cores), or a known-weak GPU. Devices reporting ≤4GB (or hiding
  // deviceMemory) are NO LONGER forced here — capable 4–6GB Android phones keep
  // the full premium experience and are governed at runtime by measured FPS.
  return (
    saveData ||
    reduced ||
    (typeof cores === "number" && cores > 0 && cores <= 2) ||
    isWeakGpu(getWebGLRenderer())
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
 * RAM-free — based on CPU cores + GPU + explicit user intent only.
 *
 *   low  — genuine constraint: reduced-motion, save-data, ≤2 cores, weak GPU.
 *          Minimal blur, no heavy glow, simplest animations.
 *   high — ≥8 cores and no weak-GPU/constraint signal. Full effects.
 *   mid  — everything in between (incl. typical 4–6GB phones). Medium blur.
 *
 * SSR-safe: assumes "high" until mounted so SSR + first paint stay rich, then
 * downgrades on the client once real capabilities are known. The runtime
 * governor (data-degrade-effects) can further trim effects if measured FPS drops.
 */
function detectTier(): DeviceTier {
  if (typeof navigator === "undefined") return "high";
  if (detect()) return "low";
  const cores = navigator.hardwareConcurrency;
  const coresHigh = typeof cores !== "number" || cores === 0 || cores >= 8;
  if (coresHigh) return "high";
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
