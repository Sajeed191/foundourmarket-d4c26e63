/**
 * TEMPORARY DEBUG DIAGNOSTICS — collects the hardware/runtime signals needed
 * to attribute the Android rendering corruption to a specific subsystem.
 *
 * Captured:
 *   - GPU renderer / vendor (WebGL UNMASKED_RENDERER_WEBGL)
 *   - JS heap usage (performance.memory, Chrome only)
 *   - Approx. compositor layer count (elements with promoted-layer CSS)
 *   - Image decode failures (img error events + decode() rejections)
 *   - Canvas failures (getContext / readback errors)
 *   - requestAnimationFrame FPS (rolling)
 *   - Long Tasks (PerformanceObserver longtask)
 *   - WebGL context loss events (the smoking gun for texture corruption)
 *
 * React-side counters (remounts / unexpected rerenders / hydration mismatches)
 * are fed in via recordReactEvent().
 */

import { isDebugEnabled } from "@/lib/debug-flags";

export type Diagnostics = {
  gpuRenderer: string;
  gpuVendor: string;
  webglSupported: boolean;
  deviceMemoryGb: number | null;
  hardwareConcurrency: number | null;
  jsHeapUsedMb: number | null;
  jsHeapLimitMb: number | null;
  compositorLayers: number;
  imageDecodeFailures: number;
  canvasFailures: number;
  fps: number;
  longTasks: number;
  longTaskMaxMs: number;
  glContextLost: number;
  reactRemounts: number;
  unexpectedRerenders: number;
  hydrationMismatches: number;
  userAgent: string;
};

const d: Diagnostics = {
  gpuRenderer: "unknown",
  gpuVendor: "unknown",
  webglSupported: false,
  deviceMemoryGb: null,
  hardwareConcurrency: null,
  jsHeapUsedMb: null,
  jsHeapLimitMb: null,
  compositorLayers: 0,
  imageDecodeFailures: 0,
  canvasFailures: 0,
  fps: 0,
  longTasks: 0,
  longTaskMaxMs: 0,
  glContextLost: 0,
  reactRemounts: 0,
  unexpectedRerenders: 0,
  hydrationMismatches: 0,
  userAgent: "",
};

const listeners = new Set<() => void>();
let installed = false;

function notify() {
  listeners.forEach((l) => l());
}

export function getDiagnostics(): Diagnostics {
  return { ...d };
}

export function subscribeDiagnostics(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function recordReactEvent(
  kind: "remount" | "rerender" | "hydration-mismatch",
) {
  if (kind === "remount") d.reactRemounts += 1;
  else if (kind === "rerender") d.unexpectedRerenders += 1;
  else d.hydrationMismatches += 1;
}

function readGpu() {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      (canvas.getContext("webgl") as WebGLRenderingContext | null) ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) {
      d.canvasFailures += 1;
      return;
    }
    d.webglSupported = true;
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    if (dbg) {
      d.gpuRenderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
      d.gpuVendor = String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL));
    } else {
      d.gpuRenderer = String(gl.getParameter(gl.RENDERER));
      d.gpuVendor = String(gl.getParameter(gl.VENDOR));
    }
    canvas.addEventListener("webglcontextlost", () => {
      d.glContextLost += 1;
      notify();
    });
  } catch {
    d.canvasFailures += 1;
  }
}

const LAYER_PROPS = [
  "transform",
  "filter",
  "backdrop-filter",
  "perspective",
  "mix-blend-mode",
  "will-change",
];

/** Rough count of elements that would be promoted to their own compositor
 *  layer. Not exact (Chrome's heuristics are internal) but a strong proxy. */
function countCompositorLayers(): number {
  let count = 0;
  const els = document.querySelectorAll("*");
  // Cap traversal to avoid its own long task.
  const limit = Math.min(els.length, 4000);
  for (let i = 0; i < limit; i++) {
    const cs = getComputedStyle(els[i] as Element);
    for (const prop of LAYER_PROPS) {
      const v = cs.getPropertyValue(prop);
      if (v && v !== "none" && v !== "auto" && v !== "normal") {
        count += 1;
        break;
      }
    }
  }
  return count;
}

function readMemory() {
  const perf = performance as Performance & {
    memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
  };
  if (perf.memory) {
    d.jsHeapUsedMb = Math.round(perf.memory.usedJSHeapSize / 1048576);
    d.jsHeapLimitMb = Math.round(perf.memory.jsHeapSizeLimit / 1048576);
  }
}

export function installDebugDiagnostics() {
  if (installed || typeof window === "undefined") return;
  if (document.documentElement.dataset.androidGpuSafeMode === "true" && !isDebugEnabled()) return;
  installed = true;

  d.userAgent = navigator.userAgent;
  d.deviceMemoryGb =
    (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null;
  d.hardwareConcurrency = navigator.hardwareConcurrency ?? null;

  readGpu();

  // Global image decode failure capture.
  window.addEventListener(
    "error",
    (e) => {
      const t = e.target as HTMLElement | null;
      if (t && t.tagName === "IMG") {
        d.imageDecodeFailures += 1;
        notify();
      }
    },
    true,
  );

  // Long tasks.
  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        d.longTasks += 1;
        if (entry.duration > d.longTaskMaxMs) d.longTaskMaxMs = entry.duration;
      }
      notify();
    });
    po.observe({ entryTypes: ["longtask"] });
  } catch {
    /* longtask unsupported */
  }

  // FPS via rAF.
  let frames = 0;
  let last = performance.now();
  const tick = () => {
    frames += 1;
    const now = performance.now();
    if (now - last >= 1000) {
      d.fps = Math.round((frames * 1000) / (now - last));
      frames = 0;
      last = now;
      readMemory();
      notify();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // Periodic compositor layer + memory sampling (every 2s, idle-safe).
  const sample = () => {
    try {
      d.compositorLayers = countCompositorLayers();
      readMemory();
      notify();
    } catch {
      /* ignore */
    }
  };
  setInterval(sample, 2000);
  setTimeout(sample, 500);
}

/** Wrap original Image.prototype.decode to count rejections. */
export function patchImageDecode() {
  if (typeof window === "undefined") return;
  if (document.documentElement.dataset.androidGpuSafeMode === "true" && !isDebugEnabled()) return;
  const proto = HTMLImageElement.prototype as HTMLImageElement & {
    __decodePatched?: boolean;
  };
  if (proto.__decodePatched) return;
  proto.__decodePatched = true;
  const orig = proto.decode;
  proto.decode = function patched(this: HTMLImageElement) {
    return orig.call(this).catch((err: unknown) => {
      d.imageDecodeFailures += 1;
      notify();
      throw err;
    });
  };
}
