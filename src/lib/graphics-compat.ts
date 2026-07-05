/**
 * Graphics Compatibility Mode — single source of truth
 * ----------------------------------------------------
 * An OPTIONAL, user-controlled rendering flag. When enabled it sets
 *
 *     html[data-graphics-compat="true"]
 *
 * and nothing else. Every visual difference is driven purely from CSS selectors
 * in `src/styles.css` (see the "GRAPHICS COMPATIBILITY MODE" section). React
 * components never branch on this flag.
 *
 * Deliberately contains NO browser sniffing, NO UA detection, NO GPU detection
 * and NO version gating. It is turned on/off exclusively by the user and
 * persisted in localStorage. When OFF there are zero production rendering
 * changes.
 *
 * Public API:
 *   - isGraphicsCompatEnabled()          → boolean (current persisted state)
 *   - setGraphicsCompatEnabled(on)       → persist + apply immediately
 *   - resetGraphicsCompatPref()          → clear preference (back to OFF)
 *   - useGraphicsCompatPref()            → React hook, live "on" | "off"
 *   - setGraphicsCompatPref(pref)        → persist + apply ("on" | "off")
 *   - getGraphicsDiagnostics()           → { renderingMode, compatibility }
 *   - GraphicsCompatProvider             → applies persisted state on mount
 */
import { useEffect, useSyncExternalStore } from "react";

/** Kept as a small union so the existing settings card can read tri-state. */
export type GraphicsCompatPref = "auto" | "on" | "off";

const PREF_KEY = "fom-graphics-compat";
const ATTR = "data-graphics-compat";

/** Read the persisted user preference. Absent / invalid → "auto" (= OFF). */
export function readGraphicsCompatPref(): GraphicsCompatPref {
  if (typeof localStorage === "undefined") return "auto";
  try {
    const v = localStorage.getItem(PREF_KEY);
    return v === "on" || v === "off" ? v : "auto";
  } catch {
    return "auto";
  }
}

/** True when Compatibility Mode is currently enabled. */
export function isGraphicsCompatEnabled(): boolean {
  // TEMPORARY TESTING OVERRIDE — force Graphics Compatibility Mode ON.
  // Rollback: restore `return readGraphicsCompatPref() === "on";`
  return true;
}

/** Apply / remove the single html attribute at runtime. */
function applyAttribute(active: boolean) {
  if (typeof document === "undefined") return;
  const d = document.documentElement;
  if (active) d.setAttribute(ATTR, "true");
  else d.removeAttribute(ATTR);
}

/** Persist the preference and apply it live (no reload needed). */
export function setGraphicsCompatPref(pref: GraphicsCompatPref) {
  if (typeof localStorage !== "undefined") {
    try {
      if (pref === "on") localStorage.setItem(PREF_KEY, "on");
      else localStorage.removeItem(PREF_KEY);
    } catch {
      /* storage disabled — attribute still applies for this session */
    }
  }
  applyAttribute(pref === "on");
  notify();
}

/** Boolean convenience wrapper around setGraphicsCompatPref. */
export function setGraphicsCompatEnabled(on: boolean) {
  setGraphicsCompatPref(on ? "on" : "off");
}

/** Restore the default: clears the stored preference and disables the mode. */
export function resetGraphicsCompatPref() {
  setGraphicsCompatPref("auto");
}

// --- Live subscription (keeps multiple consumers in sync without a reload) ---
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

export type GraphicsDiagnostics = {
  renderingMode: "Premium Rendering" | "Compatibility Rendering";
  compatibility: "Enabled" | "Disabled";
};

/** Minimal, sniff-free diagnostics for the Settings panel. */
export function getGraphicsDiagnostics(): GraphicsDiagnostics {
  const on = isGraphicsCompatEnabled();
  return {
    renderingMode: on ? "Compatibility Rendering" : "Premium Rendering",
    compatibility: on ? "Enabled" : "Disabled",
  };
}

/**
 * Provider: single place that guarantees the persisted preference is applied to
 * the <html> element after hydration. The no-FOUC inline script in __root.tsx
 * applies it before paint; this keeps React in sync and self-heals if the
 * attribute is ever cleared. Renders children unchanged.
 */
export function GraphicsCompatProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    applyAttribute(isGraphicsCompatEnabled());
  }, []);
  return children as React.ReactElement;
}
