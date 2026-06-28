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
  "overflowClipping",
  "gpuTransforms",
  "jsAnimations",
] as const;

export type DebugFlag = (typeof DEBUG_FLAGS)[number];

export type BisectTest = {
  id: string;
  property: string;
  enabledValue: string;
  disabledValue: string;
  selector: string;
  component: string;
  file: string;
  line: number;
};

export type BisectPhase = "feature-on-before" | "feature-off-after" | "feature-on-return";

export type BisectObservation = {
  id: string;
  property: string;
  component: string;
  file: string;
  line: number;
  phase: BisectPhase;
  corruption: boolean;
  screenshot: string;
  at: string;
};

export const BISECT_TESTS: BisectTest[] = [
  {
    id: "product-card-overflow",
    property: "overflow",
    enabledValue: "hidden",
    disabledValue: "visible",
    selector: "[data-product-card]",
    component: "ProductCard",
    file: "src/components/site/ProductCard.tsx",
    line: 309,
  },
  {
    id: "product-media-overflow",
    property: "overflow",
    enabledValue: "hidden",
    disabledValue: "visible",
    selector: "[data-product-media]",
    component: "AdaptiveProductMedia",
    file: "src/components/site/AdaptiveProductMedia.tsx",
    line: 36,
  },
  {
    id: "product-title-overflow",
    property: "overflow",
    enabledValue: "hidden",
    disabledValue: "visible",
    selector: ".product-title-text",
    component: "ProductCard title",
    file: "src/components/site/ProductCard.tsx",
    line: 70,
  },
  {
    id: "card-frame-content-visibility",
    property: "content-visibility",
    enabledValue: "auto",
    disabledValue: "visible",
    selector: "[data-product-card-frame]",
    component: "VirtualizedProductGrid card frame",
    file: "src/styles.css",
    line: 1080,
  },
  {
    id: "card-frame-contain",
    property: "contain",
    enabledValue: "layout paint style",
    disabledValue: "none",
    selector: "[data-product-card-frame]",
    component: "VirtualizedProductGrid card frame",
    file: "src/styles.css",
    line: 1082,
  },
  {
    id: "card-frame-isolation",
    property: "isolation",
    enabledValue: "isolate",
    disabledValue: "auto",
    selector: "[data-product-card-frame]",
    component: "VirtualizedProductGrid card frame",
    file: "src/styles.css",
    line: 1083,
  },
  {
    id: "product-shell-contain",
    property: "contain",
    enabledValue: "layout paint style",
    disabledValue: "none",
    selector: ".product-card-shell",
    component: "ProductCard shell",
    file: "src/styles.css",
    line: 1091,
  },
  {
    id: "product-shell-isolation",
    property: "isolation",
    enabledValue: "isolate",
    disabledValue: "auto",
    selector: ".product-card-shell",
    component: "ProductCard shell",
    file: "src/styles.css",
    line: 1092,
  },
  {
    id: "product-media-contain",
    property: "contain",
    enabledValue: "layout paint style",
    disabledValue: "none",
    selector: "[data-product-media]",
    component: "AdaptiveProductMedia",
    file: "src/styles.css",
    line: 1096,
  },
  {
    id: "product-media-isolation",
    property: "isolation",
    enabledValue: "isolate",
    disabledValue: "auto",
    selector: "[data-product-media]",
    component: "AdaptiveProductMedia",
    file: "src/styles.css",
    line: 1097,
  },
  {
    id: "product-image-transition",
    property: "transition",
    enabledValue: "transform 300ms ease-out, opacity 300ms ease-out",
    disabledValue: "none",
    selector: "[data-product-image]",
    component: "ProductImage",
    file: "src/components/site/AdaptiveProductMedia.tsx",
    line: 61,
  },
  {
    id: "product-image-srcset",
    property: "srcSet",
    enabledValue: "responsive srcSet",
    disabledValue: "undefined",
    selector: "ProductImage prop",
    component: "ProductImage",
    file: "src/components/site/ProductImage.tsx",
    line: 187,
  },
  {
    id: "product-image-lazy-loading",
    property: "loading",
    enabledValue: "lazy",
    disabledValue: "eager",
    selector: "ProductImage prop",
    component: "ProductImage",
    file: "src/components/site/ProductImage.tsx",
    line: 192,
  },
  {
    id: "product-image-decoding-async",
    property: "decoding",
    enabledValue: "async",
    disabledValue: "sync",
    selector: "ProductImage prop",
    component: "ProductImage",
    file: "src/components/site/ProductImage.tsx",
    line: 194,
  },
  {
    id: "product-image-create-image-bitmap",
    property: "createImageBitmap",
    enabledValue: "on",
    disabledValue: "off",
    selector: "ProductImage prop",
    component: "ProductImage decode path",
    file: "src/components/site/ProductImage.tsx",
    line: 191,
  },
  {
    id: "product-image-image-decode",
    property: "Image.decode()",
    enabledValue: "on",
    disabledValue: "off",
    selector: "ProductImage prop",
    component: "ProductImage decode path",
    file: "src/components/site/ProductImage.tsx",
    line: 196,
  },
  {
    id: "card-frame-contain-intrinsic-size",
    property: "contain-intrinsic-size",
    enabledValue: "auto 320px",
    disabledValue: "none",
    selector: "[data-product-card-frame]",
    component: "VirtualizedProductGrid card frame",
    file: "src/styles.css",
    line: 1081,
  },
  {
    id: "card-frame-clip-path",
    property: "clip-path",
    enabledValue: "inset(0 round 18px)",
    disabledValue: "none",
    selector: "[data-product-card-frame]",
    component: "VirtualizedProductGrid card frame",
    file: "src/styles.css",
    line: 1084,
  },
  {
    id: "product-media-mask",
    property: "-webkit-mask-image",
    enabledValue: "linear-gradient(#000,#000)",
    disabledValue: "none",
    selector: "[data-product-media]",
    component: "AdaptiveProductMedia",
    file: "src/components/site/AdaptiveProductMedia.tsx",
    line: 36,
  },
  {
    id: "product-card-will-change",
    property: "will-change",
    enabledValue: "transform",
    disabledValue: "auto",
    selector: "[data-product-card]",
    component: "ProductCard",
    file: "src/components/site/ProductCard.tsx",
    line: 309,
  },
  {
    id: "product-card-transform",
    property: "transform",
    enabledValue: "translateZ(0)",
    disabledValue: "none",
    selector: "[data-product-card]",
    component: "ProductCard",
    file: "src/components/site/ProductCard.tsx",
    line: 309,
  },
  {
    id: "product-card-translate3d",
    property: "transform",
    enabledValue: "translate3d(0,0,0)",
    disabledValue: "none",
    selector: "[data-product-card]",
    component: "ProductCard (translate3d GPU promotion)",
    file: "src/components/site/ProductCard.tsx",
    line: 309,
  },
  {
    id: "product-grid-perspective",
    property: "perspective",
    enabledValue: "1000px",
    disabledValue: "none",
    selector: "[data-product-grid]",
    component: "Product grid",
    file: "src/components/site/ProductCard.tsx",
    line: 309,
  },
  {
    id: "product-image-opacity-anim",
    property: "transition",
    enabledValue: "opacity 300ms ease-out",
    disabledValue: "none",
    selector: "[data-product-image]",
    component: "ProductImage opacity animation",
    file: "src/components/site/AdaptiveProductMedia.tsx",
    line: 61,
  },
  {
    id: "product-card-filter",
    property: "filter",
    enabledValue: "brightness(1)",
    disabledValue: "none",
    selector: "[data-product-card]",
    component: "ProductCard CSS filter",
    file: "src/styles.css",
    line: 1091,
  },
  {
    id: "card-backdrop-filter",
    property: "-webkit-backdrop-filter",
    enabledValue: "blur(12px)",
    disabledValue: "none",
    selector: ".product-card-shell",
    component: "ProductCard backdrop-filter",
    file: "src/styles.css",
    line: 1091,
  },
  {
    id: "card-blur",
    property: "filter",
    enabledValue: "blur(2px)",
    disabledValue: "none",
    selector: ".product-card-shell",
    component: "ProductCard blur",
    file: "src/styles.css",
    line: 1091,
  },
  {
    id: "card-box-shadow",
    property: "box-shadow",
    enabledValue: "0 10px 40px rgba(0,0,0,0.4)",
    disabledValue: "none",
    selector: ".product-card-shell",
    component: "ProductCard box-shadow",
    file: "src/styles.css",
    line: 1091,
  },
];


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
  overflowClipping: "Overflow Clipping",
  gpuTransforms: "GPU Transforms",
  jsAnimations: "JS Animations (rAF)",
};

const STORAGE_KEY = "fom_debug_flags";
const BISECT_LOG_KEY = "fom_bisect_report";
const BISECT_STYLE_ID = "fom-bisect-one-property-style";
const QUERY_KEY = "ff"; // ?ff=off:blur,gpuTransforms  or  ?ff=only:hero

type FlagState = Record<DebugFlag, boolean>;

function defaults(): FlagState {
  return DEBUG_FLAGS.reduce((acc, f) => {
    acc[f] = true;
    return acc;
  }, {} as FlagState);
}

let state: FlagState = defaults();
let activeBisectTest: string | null = null;
let bisectOverrideEnabled = false;
let bisectLog: BisectObservation[] = [];
const listeners = new Set<() => void>();

// ---- Guided runner state ----
let runnerActive = false;
let runnerIndex = 0;
let runnerPhase: BisectPhase = "feature-on-before";
// CSS overrides currently injected by the runner (one entry per css feature).
let runnerOverrides: Array<{ id: string; off: boolean }> = [];

/** True only when the harness has been explicitly enabled — keeps production
 *  builds free of any debug behavior unless ?debug=1 or a saved flag set. */
let enabled = false;

export function isDebugEnabled(): boolean {
  return enabled;
}

function buildBisectRule(test: BisectTest, off: boolean): string {
  if (test.selector === "ProductImage prop") return "";
  const value = off ? test.disabledValue : test.enabledValue;
  return `${test.selector}{${test.property}:${value} !important;}`;
}

function applyDom() {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.dataset.debugHarness = enabled ? "on" : "off";
  el.dataset.bisectTest = activeBisectTest ?? "none";
  el.dataset.bisectOverride = bisectOverrideEnabled ? "on" : "off";
  el.dataset.bisectRunner = runnerActive ? "on" : "off";
  for (const f of DEBUG_FLAGS) {
    el.dataset[`ff${f.charAt(0).toUpperCase()}${f.slice(1)}`] = state[f] ? "on" : "off";
  }

  let style = document.getElementById(BISECT_STYLE_ID) as HTMLStyleElement | null;
  const rules: string[] = [];

  if (runnerActive) {
    for (const ov of runnerOverrides) {
      const t = BISECT_TESTS.find((x) => x.id === ov.id);
      if (t) {
        const rule = buildBisectRule(t, ov.off);
        if (rule) rules.push(`html[data-bisect-runner="on"] ${rule}`);
      }
    }
  } else {
    const test = activeBisectTest ? BISECT_TESTS.find((t) => t.id === activeBisectTest) : null;
    if (test) {
      const rule = buildBisectRule(test, bisectOverrideEnabled);
      if (rule) {
        rules.push(`html[data-debug-harness="on"][data-bisect-test="${test.id}"] ${rule}`);
      }
    }
  }

  if (rules.length === 0) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement("style");
    style.id = BISECT_STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = rules.join("\n");
}


function persist() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled, state, activeBisectTest, bisectOverrideEnabled }));
    localStorage.setItem(BISECT_LOG_KEY, JSON.stringify(bisectLog));
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
      const parsed = JSON.parse(raw) as { enabled?: boolean; state?: Partial<FlagState>; activeBisectTest?: string | null; bisectOverrideEnabled?: boolean };
      if (parsed.enabled) enabled = true;
      if (parsed.state) state = { ...defaults(), ...parsed.state };
      activeBisectTest = parsed.activeBisectTest ?? null;
      bisectOverrideEnabled = parsed.bisectOverrideEnabled === true;
    }
    const logRaw = localStorage.getItem(BISECT_LOG_KEY);
    if (logRaw) bisectLog = JSON.parse(logRaw) as BisectObservation[];
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
  activeBisectTest = null;
  bisectOverrideEnabled = false;
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

export function getActiveBisectTest(): string | null {
  return activeBisectTest;
}

export function getBisectOverrideEnabled(): boolean {
  return bisectOverrideEnabled;
}

export function setActiveBisectTest(id: string | null) {
  enabled = true;
  activeBisectTest = id && BISECT_TESTS.some((t) => t.id === id) ? id : null;
  bisectOverrideEnabled = false;
  applyDom();
  persist();
  notify();
}

export function setBisectOverrideEnabled(value: boolean) {
  enabled = true;
  bisectOverrideEnabled = value;
  applyDom();
  persist();
  notify();
}

export function getBisectLog(): BisectObservation[] {
  return [...bisectLog];
}

export function clearBisectLog() {
  bisectLog = [];
  persist();
  notify();
}

export function recordBisectObservation(id: string, phase: BisectPhase, corruption: boolean) {
  const test = BISECT_TESTS.find((t) => t.id === id);
  if (!test) return;
  bisectLog = [
    ...bisectLog,
    {
      id,
      property: test.property,
      component: test.component,
      file: test.file,
      line: test.line,
      phase,
      corruption,
      screenshot: phase === "feature-off-after" ? "after-phone-photo-required" : "before-or-return-phone-photo-required",
      at: new Date().toISOString(),
    },
  ];
  persist();
  notify();
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Group the A/B/A log per test and decide whether it satisfies the strict
 *  reproduce → disable → reproduce-gone → re-enable → reproduce-returns proof. */
export function evaluateBisect(): Array<{
  id: string;
  property: string;
  component: string;
  file: string;
  line: number;
  on1: boolean | null;
  off2: boolean | null;
  on3: boolean | null;
  confirmedRootCause: boolean;
}> {
  return BISECT_TESTS.map((t) => {
    const rows = bisectLog.filter((r) => r.id === t.id);
    const last = (phase: BisectPhase): boolean | null => {
      const found = rows.filter((r) => r.phase === phase).slice(-1)[0];
      return found ? found.corruption : null;
    };
    const on1 = last("feature-on-before");
    const off2 = last("feature-off-after");
    const on3 = last("feature-on-return");
    return {
      id: t.id,
      property: t.property,
      component: t.component,
      file: t.file,
      line: t.line,
      on1,
      off2,
      on3,
      // Proven culprit: corrupt ON → clean OFF → corrupt again ON.
      confirmedRootCause: on1 === true && off2 === false && on3 === true,
    };
  });
}

/** Build the full machine-readable report: device + runtime diagnostics +
 *  every A/B/A observation + the confirmed root-cause verdict. */
export function buildBisectReport(diagnostics: unknown) {
  const evaluation = evaluateBisect();
  const confirmed = evaluation.filter((e) => e.confirmedRootCause);
  return {
    generatedAt: new Date().toISOString(),
    url: typeof window !== "undefined" ? window.location.href : "",
    device: diagnostics,
    flags: getAllFlags(),
    activeBisectTest,
    bisectOverrideEnabled,
    tests: BISECT_TESTS,
    observations: bisectLog,
    evaluation,
    confirmedRootCause: confirmed.length === 1 ? confirmed[0] : null,
    confirmedRootCauseCandidates: confirmed,
    protocol:
      "A feature is the root cause only if: (1) ON=corrupt, (2) OFF=clean, (3) ON-again=corrupt. Toggle exactly one switch at a time on the physical Realme Narzo 20.",
  };
}

export function downloadBisectReport(diagnostics: unknown) {
  if (typeof document === "undefined") return;
  const report = buildBisectReport(diagnostics);
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `android-bisect-report-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}

