/**
 * GPU compatibility — single source of truth.
 * ------------------------------------------
 * The boot probe in `src/routes/__root.tsx` runs a pre-paint WebGL renderer
 * check and sets `html[data-gpu-unsafe="true"]` on known GPU-unsafe Android
 * devices (Mali / PowerVR / VideoCore / Vivante / old Adreno / software
 * rasterizers, or very old Chromium/Samsung engines).
 *
 * On those devices Chromium's GPU rasterization path corrupts compositor tiles
 * (black flashes, striping, ghost textures). Firefox is unaffected and newer
 * Chromium versions have already fixed similar issues, so this is a
 * driver/browser-compatibility issue, not an app bug. The remedy is to REDUCE
 * GPU workload — smaller single-URL WebP images, no canvas readback, no reveal
 * animations, no decorative blur/glow/particle layers — never to change the
 * design on healthy devices.
 *
 * "Compatibility Mode" is a single production feature driven from this one
 * helper. All visual reductions live behind the `data-gpu-unsafe` (and the
 * user-toggled `data-graphics-compat`) selectors in `src/styles.css`; every
 * runtime decision reads from `isGpuUnsafe()` so the logic is centralized and
 * never scattered as inline dataset checks. No browser sniffing beyond the
 * existing boot probe; no feature flags; no URL params.
 */
import { useSyncExternalStore } from "react";

/** True on devices flagged by the boot GPU gate (Compatibility Mode active). */
export function isGpuUnsafe(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.gpuUnsafe === "true";
}

/** Why compatibility mode turned on: "gpu" (renderer) or "engine" (old browser). */
export function getCompatReason(): "gpu" | "engine" | null {
  if (typeof document === "undefined") return null;
  const r = document.documentElement.dataset.compatReason;
  return r === "gpu" || r === "engine" ? r : null;
}

// The gpu-unsafe attribute is set once before first paint and never changes, so
// a static subscribe is sufficient for React consumers (e.g. the banner).
function subscribe() {
  return () => {};
}

/** React hook mirroring isGpuUnsafe(), SSR-safe (false on the server). */
export function useGpuUnsafe(): boolean {
  return useSyncExternalStore(subscribe, isGpuUnsafe, () => false);
}
