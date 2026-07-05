/**
 * Graphics Compatibility Mode
 * ---------------------------
 * A user-controllable rendering path that reduces compositor complexity for
 * devices where Chromium/WebView's GPU compositor produces scroll-time tile
 * corruption (horizontal bands, duplicated textures). It reuses the EXISTING
 * `data-render-safe` safe-mode CSS (the same path as the `?render=safe` URL
 * flag) rather than maintaining a fragile GPU-renderer blocklist.
 *
 * Design goals:
 *   - Default (`auto`) keeps the full premium rendering for everyone.
 *   - Desktop / iOS / Firefox / healthy Android are never forced into it.
 *   - The user can manually enable/disable it from Settings; the choice
 *     persists in localStorage.
 *   - On Android Chromium we may SUGGEST it (never force it) via a dismissible
 *     prompt when a rendering-compatibility issue is plausible.
 *
 * Attributes set on <html>:
 *   data-graphics-compat="true"  → set only by an explicit user "on" choice.
 *   data-render-safe="true"      → the existing CSS hook that swaps expensive
 *                                  GPU effects for CPU-friendly fallbacks.
 */
import { useSyncExternalStore } from "react";

export type GraphicsCompatPref = "auto" | "on" | "off";

const PREF_KEY = "fom-graphics-compat";

/** Read the persisted user preference. Absent / invalid → "auto". */
export function readGraphicsCompatPref(): GraphicsCompatPref {
  if (typeof localStorage === "undefined") return "auto";
  try {
    const v = localStorage.getItem(PREF_KEY);
    return v === "on" || v === "off" ? v : "auto";
  } catch {
    return "auto";
  }
}

/** True when the compatibility rendering path is currently active. */
export function isGraphicsCompatActive(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute("data-graphics-compat") === "true";
}

/** True when render-safe was forced via the ?render=safe URL flag (not the pref). */
function isUrlForcedRenderSafe(): boolean {
  if (typeof location === "undefined") return false;
  try {
    const q = new URLSearchParams(location.search);
    return q.get("render") === "safe" || q.has("render-safe");
  } catch {
    return false;
  }
}

/** Apply / remove the compat attributes on <html> at runtime. */
function applyAttributes(active: boolean) {
  if (typeof document === "undefined") return;
  const d = document.documentElement;
  if (active) {
    d.setAttribute("data-graphics-compat", "true");
    d.setAttribute("data-render-safe", "true");
  } else {
    d.removeAttribute("data-graphics-compat");
    // Never clobber a URL-forced safe mode (?render=safe diagnostics).
    if (!isUrlForcedRenderSafe()) d.removeAttribute("data-render-safe");
  }
}

/** Persist the preference and apply it live (no reload needed). */
export function setGraphicsCompatPref(pref: GraphicsCompatPref) {
  if (typeof localStorage !== "undefined") {
    try {
      if (pref === "auto") localStorage.removeItem(PREF_KEY);
      else localStorage.setItem(PREF_KEY, pref);
    } catch {
      /* storage disabled — attribute still applies for this session */
    }
  }
  applyAttributes(pref === "on");
  notify();
}

/**
 * Restore the default rendering behaviour: clears the stored preference and
 * returns to Premium Rendering. Applies immediately, no reload.
 */
export function resetGraphicsCompatPref() {
  setGraphicsCompatPref("auto");
}

// --- Live subscription (so multiple cards stay in sync without a reload) ---
const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** React hook: current persisted preference, updates live on any change. */
export function useGraphicsCompatPref(): GraphicsCompatPref {
  return useSyncExternalStore(
    subscribe,
    readGraphicsCompatPref,
    () => "auto" as GraphicsCompatPref,
  );
}

/** Chromium-family engine on Android (Chrome, Brave, Edge, etc.) — excludes Firefox. */
export function isAndroidChromium(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isAndroid = /Android/.test(ua);
  const isChromium = /Chrome\/|Chromium\//.test(ua);
  const isFirefox = /Firefox\/|FxiOS/.test(ua);
  return isAndroid && isChromium && !isFirefox;
}

/** Browser family name (no version), e.g. "Chrome". Diagnostics-only. */
export function detectBrowserName(ua?: string): string {
  const s = ua ?? (typeof navigator !== "undefined" ? navigator.userAgent || "" : "");
  if (!s) return "Unknown";
  if (/Edg(?:A|iOS)?\//.test(s)) return "Edge";
  if (/OPR\/|Opera\//.test(s)) return "Opera";
  if (/SamsungBrowser\//.test(s)) return "Samsung Internet";
  if (/Firefox\/|FxiOS\//.test(s)) return "Firefox";
  if (/CriOS\/|Chrome\//.test(s)) return "Chrome";
  if (/Version\/\d+.*Safari/.test(s)) return "Safari";
  return "Unknown";
}

/** Browser major version as a string, e.g. "138". Diagnostics-only. */
export function detectBrowserVersion(ua?: string): string {
  const s = ua ?? (typeof navigator !== "undefined" ? navigator.userAgent || "" : "");
  if (!s) return "—";
  let m: RegExpMatchArray | null;
  if ((m = s.match(/Edg(?:A|iOS)?\/(\d+)/))) return m[1];
  if ((m = s.match(/OPR\/(\d+)/)) || (m = s.match(/Opera\/(\d+)/))) return m[1];
  if ((m = s.match(/SamsungBrowser\/(\d+)/))) return m[1];
  if ((m = s.match(/(?:Firefox|FxiOS)\/(\d+)/))) return m[1];
  if ((m = s.match(/CriOS\/(\d+)/))) return m[1];
  if ((m = s.match(/Chrome\/(\d+)/))) return m[1];
  if (/Version\/(\d+).*Safari/.test(s) && (m = s.match(/Version\/(\d+)/))) return m[1];
  return "—";
}

/**
 * Human-readable browser name + major version, e.g. "Chrome 138".
 * Diagnostics-only; never used to auto-enable compatibility mode.
 */
export function detectBrowser(ua?: string): string {
  const name = detectBrowserName(ua);
  const version = detectBrowserVersion(ua);
  if (name === "Unknown") return "Unknown";
  return version === "—" ? name : `${name} ${version}`;
}

/** Android version, e.g. "Android 15", or "Not Android" when not applicable. */
export function detectAndroidVersion(ua?: string): string {
  const s = ua ?? (typeof navigator !== "undefined" ? navigator.userAgent || "" : "");
  const m = s.match(/Android\s+(\d+(?:\.\d+)?)/);
  return m ? `Android ${m[1]}` : "Not Android";
}

export type GraphicsDiagnostics = {
  renderingMode: "Premium Rendering" | "Compatibility Rendering";
  browser: string;
  browserName: string;
  browserVersion: string;
  androidVersion: string;
  compatibility: "Enabled" | "Disabled";
};

/**
 * Informational diagnostics for the Settings panel. Intentionally excludes GPU
 * renderer, WebGL renderer, driver strings and internal debug flags.
 */
export function getGraphicsDiagnostics(): GraphicsDiagnostics {
  const active = readGraphicsCompatPref() === "on" || isGraphicsCompatActive();
  return {
    renderingMode: active ? "Compatibility Rendering" : "Premium Rendering",
    browser: detectBrowser(),
    browserName: detectBrowserName(),
    browserVersion: detectBrowserVersion(),
    androidVersion: detectAndroidVersion(),
    compatibility: active ? "Enabled" : "Disabled",
  };
}


