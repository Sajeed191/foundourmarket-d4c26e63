/**
 * Capability-based device classification + live performance governor.
 *
 * Goal: give EVERY device the full premium experience whenever the hardware can
 * actually sustain it, and degrade ONLY when real, measured performance drops —
 * never because of a coarse RAM bucket. `navigator.deviceMemory` is bucketed to
 * powers of two (max 8) and is frequently undefined on Android Chrome, so a
 * perfectly capable 4–6GB phone reports `4` or nothing. Using it as a gate
 * wrongly demotes capable phones, so it is intentionally NOT used here.
 *
 * Two layers:
 *   1. A synchronous capability SCORE from multiple cheap signals (CPU cores,
 *      GPU/WebGL renderer, Save-Data, Reduced-Motion). Used only to pick a
 *      sensible starting point — it never hides images or hero animations.
 *   2. A live GOVERNOR that samples real FPS for the first few seconds and
 *      watches for long tasks (>50ms). If the device cannot sustain ~45fps,
 *      it sets <html data-degrade-effects="true"> which the CSS uses to drop
 *      only expensive effects (blur, backdrop-filter, multi-layer shadows,
 *      decorative particles, heavy 3D) while keeping images + animations.
 */

export type Capability = "full" | "reduced";

// ── Cheap signal readers ──────────────────────────────────────────────────

function readSaveData(): boolean {
  if (typeof navigator === "undefined") return false;
  const c =
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection ??
    (navigator as Navigator & { mozConnection?: { saveData?: boolean } }).mozConnection ??
    (navigator as Navigator & { webkitConnection?: { saveData?: boolean } }).webkitConnection;
  return c?.saveData === true;
}

function readReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

function readCores(): number | undefined {
  if (typeof navigator === "undefined") return undefined;
  const c = navigator.hardwareConcurrency;
  return typeof c === "number" && c > 0 ? c : undefined;
}

let webglRendererCached: string | null | undefined;
/** Reads the unmasked WebGL renderer string once (cached). null = unavailable. */
export function getWebGLRenderer(): string | null {
  if (webglRendererCached !== undefined) return webglRendererCached;
  webglRendererCached = null;
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = ext
      ? (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string)
      : (gl.getParameter(gl.RENDERER) as string);
    webglRendererCached = typeof renderer === "string" ? renderer : null;
  } catch {
    webglRendererCached = null;
  }
  return webglRendererCached;
}

/**
 * Heuristic for GPUs that genuinely struggle with compositing many blurred,
 * shadowed, 3D layers. Deliberately narrow: only the oldest entry-level mobile
 * GPUs. Mid-range Mali/Adreno on 4–6GB phones are NOT flagged here — they
 * render the premium UI fine and are governed at runtime instead.
 */
export function isWeakGpu(renderer: string | null): boolean {
  if (!renderer) return false;
  const r = renderer.toLowerCase();
  return (
    /mali-4\d\d/.test(r) || // Mali-4xx (very old)
    /mali-t7(2|6)\d/.test(r) || // Mali-T72x/T76x low tier
    /adreno \(tm\) 3\d\d/.test(r) || // Adreno 3xx
    /adreno \(tm\) 4[01]\d/.test(r) || // Adreno 40x/41x
    /powervr sgx/.test(r) ||
    /videocore/.test(r) ||
    /vivante/.test(r) ||
    /swiftshader|software|llvmpipe/.test(r) // software rasterizer
  );
}

/**
 * Synchronous capability score. Higher = more capable. RAM is intentionally
 * excluded. Returns a starting capability bucket; the runtime governor refines
 * it with measured FPS.
 */
export function computeCapabilityScore(): { score: number; capability: Capability } {
  // Explicit user/system intent — always honor these.
  if (readReducedMotion() || readSaveData()) return { score: 0, capability: "reduced" };

  let score = 100;
  const cores = readCores();
  if (typeof cores === "number") {
    if (cores <= 2) score -= 60;
    else if (cores <= 4) score -= 15; // 4 cores is fine for our effects
  }
  if (isWeakGpu(getWebGLRenderer())) score -= 60;

  return { score, capability: score >= 50 ? "full" : "reduced" };
}

// ── Live performance governor ─────────────────────────────────────────────

let governorStarted = false;
const listeners = new Set<(degraded: boolean) => void>();

// Live runtime metrics (updated once per second by the governor). Exposed for
// anonymous telemetry only — never anything user-identifying.
const liveMetrics = { fps: 0, longTaskMs: 0 };

function setDegraded(value: boolean) {
  if (typeof document === "undefined") return;
  const current = document.documentElement.dataset.degradeEffects === "true";
  if (current === value) return;
  document.documentElement.dataset.degradeEffects = value ? "true" : "false";
  listeners.forEach((fn) => fn(value));
}

export function isDegraded(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.degradeEffects === "true";
}

/** True when the boot-time GPU gate put the page in Compatibility Mode. */
export function isGpuUnsafe(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.gpuUnsafe === "true";
}

export function subscribeDegraded(fn: (degraded: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}



/**
 * Starts the live, bidirectional governor. It continuously samples real FPS and
 * long-task blocking time. On sustained poor performance it flips
 * data-degrade-effects="true" so CSS drops only expensive effects (blur,
 * backdrop-filter, multi-layer shadows, heavy 3D); on a sustained-smooth run it
 * restores premium mode. Asymmetric hysteresis prevents flapping. It never
 * reloads the page, recreates the React tree, or touches images/hero animations,
 * and it never overrides the boot-time GPU gate (data-gpu-unsafe).
 *
 * Safe to call multiple times; runs once. Honors reduced-motion/save-data up
 * front and never auto-recovers out of that explicit intent.
 */
export function startCapabilityGovernor(): void {
  if (governorStarted || typeof window === "undefined") return;
  governorStarted = true;

  // Honor explicit intent immediately, without waiting for measurement.
  if (computeCapabilityScore().capability === "reduced") {
    setDegraded(true);
    return;
  }

  // ── Long-task watchdog (rolling) ──────────────────────────────────────────
  // Accumulates blocking time inside the CURRENT 1s window; large totals mean
  // the main thread is choking and effects should be dropped. Reset each window.
  let longTaskBudget = 0;
  let longTaskObserver: PerformanceObserver | null = null;
  try {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 50) longTaskBudget += entry.duration;
      }
    });
    longTaskObserver.observe({ entryTypes: ["longtask"] });
  } catch {
    /* longtask unsupported (Safari/iOS) — rely on FPS sampling */
  }

  // ── Continuous bidirectional FPS governor ─────────────────────────────────
  // Degrade after sustained poor frames; RECOVER to premium after a longer
  // sustained-smooth run (asymmetric hysteresis avoids flapping). The loop runs
  // for the life of the page, never reloads, never recreates the React tree —
  // it only toggles a single attribute that CSS + the React hook react to.
  //
  // The boot-time GPU gate (data-gpu-unsafe) is INDEPENDENT and never touched
  // here, so a Mali/PowerVR device stays in compatibility mode regardless of
  // how smooth its FPS happens to look.
  const DEGRADE_FPS = 45; // below this = struggling
  const RECOVER_FPS = 55; // above this = comfortably smooth
  const SECONDS_TO_DEGRADE = 2; // sustained bad seconds before dropping effects
  const SECONDS_TO_RECOVER = 6; // sustained good seconds before restoring them
  const LONGTASK_DEGRADE_MS = 350; // blocking ms in one window = degrade now

  let frames = 0;
  let badSeconds = 0;
  let goodSeconds = 0;
  let windowStart = performance.now();
  let rafId = 0;

  const tick = (now: number) => {
    frames++;
    if (now - windowStart >= 1000) {
      const fps = (frames * 1000) / (now - windowStart);
      liveMetrics.fps = Math.round(fps);
      liveMetrics.longTaskMs = Math.round(longTaskBudget);
      const struggling = fps < DEGRADE_FPS || longTaskBudget > LONGTASK_DEGRADE_MS;
      const smooth = fps >= RECOVER_FPS && longTaskBudget < 50;

      if (struggling) {
        badSeconds++;
        goodSeconds = 0;
        if (badSeconds >= SECONDS_TO_DEGRADE) setDegraded(true);
      } else if (smooth) {
        goodSeconds++;
        badSeconds = 0;
        // Only auto-recover effects we ourselves dropped for perf; never when
        // explicit user/system intent asked for reduced motion / data saving.
        if (
          goodSeconds >= SECONDS_TO_RECOVER &&
          computeCapabilityScore().capability === "full"
        ) {
          setDegraded(false);
        }
      } else {
        // Neutral zone (45–55fps): hold current mode, decay counters slowly.
        badSeconds = Math.max(0, badSeconds - 1);
        goodSeconds = Math.max(0, goodSeconds - 1);
      }

      frames = 0;
      longTaskBudget = 0;
      windowStart = now;
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  // Pause sampling while the tab is hidden (avoids false "bad" seconds from
  // throttled rAF) and resume on return. Fully tear down on pagehide.
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
      longTaskObserver?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    },
    { once: true },
  );
}

// ── React hook ─────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";

/**
 * Live "should I drop expensive effects?" flag. SSR-safe: starts `false`
 * (full premium baseline) so SSR + first paint stay rich, then flips only if
 * the governor measures genuine performance problems.
 */
export function useDegradeEffects(): boolean {
  const [degraded, setDegraded] = useState(false);
  useEffect(() => {
    setDegraded(isDegraded());
    return subscribeDegraded(setDegraded);
  }, []);
  return degraded;
}

// ── Centralized render-mode API (single source of truth) ────────────────────
// Components ask ONLY these three questions and nothing else. Compatibility
// Mode = boot GPU gate (permanent for the session). Degraded = runtime governor
// (transient, recoverable). Premium = neither active.
export interface RenderMode {
  /** Full premium rendering — all effects on. */
  premium: boolean;
  /** Boot-time GPU gate active (Mali/PowerVR/etc.) — effects swapped for fallbacks. */
  compatibility: boolean;
  /** Runtime governor temporarily dropped expensive effects due to low FPS. */
  degraded: boolean;
}

export function getRenderMode(): RenderMode {
  const compatibility = isGpuUnsafe();
  const degraded = isDegraded();
  return { premium: !compatibility && !degraded, compatibility, degraded };
}

/** Single hook every component uses to branch rendering. Live-updates on changes. */
export function useRenderMode(): RenderMode {
  const [mode, setMode] = useState<RenderMode>({
    premium: true,
    compatibility: false,
    degraded: false,
  });
  useEffect(() => {
    setMode(getRenderMode());
    return subscribeDegraded(() => setMode(getRenderMode()));
  }, []);
  return mode;
}

// ── Anonymous telemetry ─────────────────────────────────────────────────────
// Captures ONLY device-rendering signals to help spot newly problematic GPUs.
// No cookies, no IDs, no personal data, no precise UA string storage server-side.
export interface RenderDiagnostics {
  gpuRenderer: string;
  browser: string;
  browserVersion: string | null;
  androidVersion: string | null;
  cores: number | null;
  fps: number;
  longTaskMs: number;
  compatibilityMode: boolean;
  compatibilityReason: string | null;
  degraded: boolean;
  saveData: boolean;
  reducedMotion: boolean;
}

function detectBrowser(ua: string): string {
  if (/SamsungBrowser/i.test(ua)) return "Samsung Internet";
  if (/Edg\//i.test(ua)) return "Edge";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/OPR\//i.test(ua)) return "Opera";
  if (/CriOS/i.test(ua)) return "Chrome iOS";
  if (/Chrome\//i.test(ua)) return /wv/i.test(ua) ? "Android WebView" : "Chrome";
  if (/Safari\//i.test(ua)) return "Safari";
  return "Unknown";
}

/** Major.minor browser version, engine-agnostic. Anonymous. */
function detectBrowserVersion(ua: string): string | null {
  const m =
    ua.match(/SamsungBrowser\/([\d.]+)/i) ||
    ua.match(/Edg\/([\d.]+)/i) ||
    ua.match(/Firefox\/([\d.]+)/i) ||
    ua.match(/OPR\/([\d.]+)/i) ||
    ua.match(/CriOS\/([\d.]+)/i) ||
    ua.match(/Chrome\/([\d.]+)/i) ||
    ua.match(/Version\/([\d.]+)/i);
  return m ? m[1] : null;
}

function detectAndroidVersion(ua: string): string | null {
  const m = ua.match(/Android\s+([\d.]+)/i);
  return m ? m[1] : null;
}

/** Why Compatibility Mode is active (boot GPU gate / old engine), or null. */
function readCompatReason(): string | null {
  if (typeof document === "undefined") return null;
  if (document.documentElement.dataset.gpuUnsafe !== "true") return null;
  return document.documentElement.dataset.compatReason ?? "gpu";
}

/** Snapshot of current rendering capability + live performance. Anonymous. */
export function getRenderDiagnostics(): RenderDiagnostics {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  return {
    gpuRenderer: getWebGLRenderer() ?? "unknown",
    browser: detectBrowser(ua),
    browserVersion: detectBrowserVersion(ua),
    androidVersion: detectAndroidVersion(ua),
    cores: readCores() ?? null,
    fps: liveMetrics.fps,
    longTaskMs: liveMetrics.longTaskMs,
    compatibilityMode: isGpuUnsafe(),
    compatibilityReason: readCompatReason(),
    degraded: isDegraded(),
    saveData: readSaveData(),
    reducedMotion: readReducedMotion(),
  };
}

/**
 * Exposes a one-shot anonymous diagnostics snapshot on `window.__fomRender`
 * (after the governor has had a few seconds to measure FPS). Purely local — it
 * does not transmit anywhere unless a host app chooses to read and forward it.
 */
export function publishRenderDiagnostics(): void {
  if (typeof window === "undefined") return;
  const publish = () => {
    try {
      (window as unknown as { __fomRender?: RenderDiagnostics }).__fomRender =
        getRenderDiagnostics();
    } catch {
      /* ignore */
    }
  };
  // Wait for the governor to gather a few FPS samples before snapshotting.
  window.setTimeout(publish, 5000);
}

