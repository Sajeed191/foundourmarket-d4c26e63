import { useEffect, useState } from "react";

/**
 * Device-capability classification has been removed.
 *
 * The site no longer renders different homepages or effect profiles based on
 * RAM, CPU cores, GPU renderer, Save-Data, or prefers-reduced-motion. Every
 * device — phones, tablets, laptops, desktops — gets ONE responsive homepage
 * and ONE component architecture. Responsiveness is handled purely with CSS
 * breakpoints, and the hero/product UI is lightweight enough to stay smooth on
 * entry-level Android without a separate code path.
 *
 * The hooks/functions below are thin compatibility shims kept so existing call
 * sites keep compiling. The capability ones now always report "capable / not
 * low-end". Only genuine PLATFORM detection (Android user-agent, used for a
 * known browser compositor quirk in the product grid) remains real.
 */

// ── Capability shims: always "capable" (no low/high-end classification) ──
export function detectLowEndDevice(): boolean {
  return false;
}

export function detectRenderSafe(): boolean {
  return false;
}

export function detectLightweightHome(): boolean {
  return false;
}

export function detectUltraLowEndAndroid(): boolean {
  return false;
}

export function detectAndroidGpuSafeMode(): boolean {
  return false;
}

export function logDeviceDetection(): void {
  /* no-op: device-detection diagnostics removed */
}

export function useLowEndDevice(): boolean {
  return false;
}

export function useLightweightHome(): boolean {
  return false;
}

export function useUltraLowEndAndroid(): boolean {
  return false;
}

export function useAndroidGpuSafeMode(): boolean {
  return false;
}

// ── Platform detection (NOT capability) — kept real ──

/**
 * Detects Android browsers, which share a compositor quirk where some promoted
 * layers fail to invalidate during fast scroll. Used only to pick a
 * transform-free incremental rendering strategy for the product grid. This is
 * platform/browser detection, not low/high-end device classification.
 */
export function detectAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

export function detectAndroidWebView(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (!/Android/i.test(ua)) return false;
  return /; wv\)/i.test(ua) || /\bwv\b/i.test(ua);
}

export function detectSamsungInternet(): boolean {
  if (typeof navigator === "undefined") return false;
  return /SamsungBrowser/i.test(navigator.userAgent);
}

export function shouldUseIncrementalRendering(): boolean {
  return detectAndroid();
}

export function useIsAndroid(): boolean {
  const [android, setAndroid] = useState(false);
  useEffect(() => {
    setAndroid(detectAndroid());
  }, []);
  return android;
}

export function useIncrementalRendering(): boolean {
  const [incremental, setIncremental] = useState(false);
  useEffect(() => {
    setIncremental(shouldUseIncrementalRendering());
  }, []);
  return incremental;
}

// ── Device tier: collapsed to a single tier (no classification) ──
export type DeviceTier = "high" | "mid" | "low";

export function useDeviceTier(): DeviceTier {
  return "high";
}
