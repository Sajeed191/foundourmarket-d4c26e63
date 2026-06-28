/**
 * TEMPORARY DEBUG HARNESS — binary isolation of the Android rendering
 * corruption. Every subsystem suspected of triggering GPU/compositor
 * texture corruption can be toggled independently at runtime, with NO
 * rebuild. State persists in localStorage and is mirrored onto
 * <html data-ff-*="on|off"> so CSS kill-switches react instantly.
 *
 * Default = every flag ON (production behavior). Flip flags OFF one at a
 * time (or in halves — true binary search) on the real device until the
 * corruption disappears; the last flag you turned OFF is the culprit.
 *
 * Remove this file (and DebugPanel + the data-ff CSS block) once the root
 * cause is fixed.
 */

export const DEBUG_FLAGS = [
  "hero",
  "productGrid",
  "productImages",
  "categoryGrid",
  "search",
  "flashDeals",
  "carousels",
  "animations",
  "lazyLoading",
  "imageTransformations",
  "imageDecoding",
  "paletteExtraction",
  "serviceWorker",
  "pwa",
  "virtualization",
  "infiniteScroll",
  "cssFilters",
  "backdropFilters",
  "blurEffects",
  "gpuTransforms",
  "jsAnimations",
] as const;

export type DebugFlag = (typeof DEBUG_FLAGS)[number];

export const FLAG_LABELS: Record<DebugFlag, string> = {
  hero: "Hero",
  productGrid: "Product Grid",
  productImages: "Product Images",
  categoryGrid: "Category Grid",
  search: "Search",
  flashDeals: "Flash Deals",
  carousels: "Carousels",
  animations: "Animations (CSS)",
  lazyLoading: "Lazy Loading",
  imageTransformations: "Image Transformations",
  imageDecoding: "Image Decoding (async)",
  paletteExtraction: "Palette Extraction",
  serviceWorker: "Service Worker",
  pwa: "PWA",
  virtualization: "Virtualization",
  infiniteScroll: "Infinite Scroll",
  cssFilters: "CSS Filters",
  backdropFilters: "Backdrop Filters",
  blurEffects: "Blur Effects",
  gpuTransforms: "GPU Transforms",
  jsAnimations: "JS Animations (rAF)",
};

const STORAGE_KEY = "fom_debug_flags";
const QUERY_KEY = "ff"; // ?ff=off:blur,gpuTransforms  or  ?ff=only:hero

type FlagState = Record<DebugFlag, boolean>;

function defaults(): FlagState {
  return DEBUG_FLAGS.reduce((acc, f) => {
    acc[f] = true;
    return acc;
  }, {} as FlagState);
}

let state: FlagState = defaults();
const listeners = new Set<() => void>();

/** True only when the harness has been explicitly enabled — keeps production
 *  builds free of any debug behavior unless ?debug=1 or a saved flag set. */
let enabled = false;

export function isDebugEnabled(): boolean {
  return enabled;
}

function applyDom() {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.dataset.debugHarness = enabled ? "on" : "off";
  for (const f of DEBUG_FLAGS) {
    el.dataset[`ff${f.charAt(0).toUpperCase()}${f.slice(1)}`] = state[f] ? "on" : "off";
  }
}

function persist() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled, state }));
  } catch {
    /* ignore */
  }
}

function notify() {
  listeners.forEach((l) => l());
}

/** Parse ?ff=... and ?debug= once at startup. */
function parseQuery() {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  if (params.has("debug")) enabled = params.get("debug") !== "0";
  const ff = params.get(QUERY_KEY);
  if (!ff) return;
  enabled = true;
  // off:a,b,c  -> turn those off
  // only:a,b   -> turn ONLY those on, everything else off
  const [mode, listRaw] = ff.includes(":") ? ff.split(":") : ["off", ff];
  const list = (listRaw ?? "").split(",").map((s) => s.trim()).filter(Boolean) as DebugFlag[];
  if (mode === "only") {
    for (const f of DEBUG_FLAGS) state[f] = false;
    for (const f of list) if (f in state) state[f] = true;
  } else {
    for (const f of list) if (f in state) state[f] = false;
  }
}

export function initDebugFlags() {
  if (typeof window === "undefined") return;
  // Load saved state first.
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { enabled?: boolean; state?: Partial<FlagState> };
      if (parsed.enabled) enabled = true;
      if (parsed.state) state = { ...defaults(), ...parsed.state };
    }
  } catch {
    /* ignore */
  }
  parseQuery(); // query overrides saved state
  applyDom();
  persist();
}

/** Read a flag. When the harness is disabled every flag reads ON (production). */
export function getFlag(flag: DebugFlag): boolean {
  if (!enabled) return true;
  return state[flag];
}

export function getAllFlags(): FlagState {
  return { ...state };
}

export function setFlag(flag: DebugFlag, value: boolean) {
  enabled = true;
  state[flag] = value;
  applyDom();
  persist();
  notify();
}

export function setAll(value: boolean) {
  enabled = true;
  for (const f of DEBUG_FLAGS) state[f] = value;
  applyDom();
  persist();
  notify();
}

export function resetFlags() {
  state = defaults();
  enabled = false;
  applyDom();
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  notify();
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
