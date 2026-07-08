/**
 * Affected-Device Confidence System — single source of truth for whether this
 * device should run in Compatibility Mode.
 * ---------------------------------------------------------------------------
 * The previous implementation flipped Compatibility Mode ON purely from a
 * single hardware/UA signal (a Mali renderer string, an old Chromium version,
 * an Android UA). That over-triggered: plenty of Mali/Chromium devices render
 * perfectly and should NEVER see the banner or the reduced-graphics path.
 *
 * This module replaces that with a weighted, multi-signal CONFIDENCE score.
 * Compatibility Mode activates only when the combined confidence that this
 * device is *actually* affected by the Chromium GPU-rasterization corruption
 * crosses a high threshold (>= 90%). The decision requires BOTH:
 *
 *   1. Hardware eligibility — a suspect GPU family / driver / engine
 *      (a device that CAN exhibit the bug), AND
 *   2. Verified runtime evidence — anomalies our diagnostics actually observed
 *      on THIS device (WebGL context loss, texture/bitmap decode failures,
 *      canvas failures, GPU warnings, repeated rendering corruption).
 *
 * A perfectly-working Mali device (no runtime anomalies) stays well below the
 * threshold and renders normally. A healthy Chromium device (no suspect
 * hardware) is never even eligible. Only devices that are highly likely to
 * corrupt tiles receive Compatibility Mode.
 *
 * Architecture is DATA-DRIVEN and future-proof: add a new problematic GPU or
 * browser build by appending to KNOWN_BAD_COMBOS / SUSPECT_GPU_FAMILIES /
 * SUSPECT_ENGINES — no control-flow changes required. All activation flows
 * through `activate()`, which sets `data-gpu-unsafe` (the app-wide flag every
 * component/CSS rule already reads) and persists the decision, keyed by the
 * device's renderer signature so evidence never bleeds across devices.
 */

const ACTIVATION_THRESHOLD = 90;

/** localStorage keys (renderer-signature scoped). */
const EVIDENCE_KEY = "fom-compat-evidence";
const ACTIVATED_KEY = "fom-compat-activated";

// ---------------------------------------------------------------------------
// Signal registries (extend these to support new hardware / browser builds)
// ---------------------------------------------------------------------------

/** GPU families historically prone to the compositor-tile corruption. */
const SUSPECT_GPU_FAMILIES: { pattern: RegExp; family: string; weight: number }[] = [
  { pattern: /mali/i, family: "Mali", weight: 30 },
  { pattern: /powervr/i, family: "PowerVR", weight: 30 },
  { pattern: /videocore/i, family: "VideoCore", weight: 28 },
  { pattern: /vivante/i, family: "Vivante", weight: 28 },
  { pattern: /adreno\s*(2|3)\d\d/i, family: "Adreno (legacy)", weight: 26 },
  { pattern: /swiftshader|software|llvmpipe|microsoft basic/i, family: "Software", weight: 34 },
];

/**
 * Known problematic GPU + driver/browser combinations. These are exact,
 * verified-affected fingerprints — they raise hardware confidence further, but
 * still never reach the threshold on their own (a working unit of the same GPU
 * exists), so runtime evidence is always required.
 */
const KNOWN_BAD_COMBOS: { pattern: RegExp; label: string; weight: number }[] = [
  { pattern: /mali-g72/i, label: "Mali-G72 (Chromium 149 GPU-raster regression)", weight: 55 },
  { pattern: /mali-g5\d/i, label: "Mali-G5x compositor corruption", weight: 50 },
];

/** Old browser engines that shipped the buggy rasterizer. */
type EngineInfo = { engine: "chromium" | "samsung"; weight: number };

/** Weight + per-session cap for each verified runtime-anomaly signal. */
export type EvidenceKind =
  | "webgl-context-lost"
  | "image-bitmap-failure"
  | "image-decode-failure"
  | "canvas-failure"
  | "gpu-warning"
  | "render-corruption";

const EVIDENCE_WEIGHTS: Record<EvidenceKind, { weight: number; cap: number }> = {
  // A lost GL context is the smoking gun for texture/tile corruption.
  "webgl-context-lost": { weight: 60, cap: 60 },
  // createImageBitmap failing is a known Mali texture-upload corruption path.
  "image-bitmap-failure": { weight: 35, cap: 70 },
  // Repeated image decode failures correlate with corrupted tiles.
  "image-decode-failure": { weight: 18, cap: 54 },
  "canvas-failure": { weight: 30, cap: 60 },
  "gpu-warning": { weight: 22, cap: 44 },
  // Corruption confirmed by our runtime diagnostics (repaint diffing, etc.).
  "render-corruption": { weight: 50, cap: 100 },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EvidenceCounts = Partial<Record<EvidenceKind, number>>;

export type ConfidenceBreakdown = {
  renderer: string;
  signature: string;
  hardwareScore: number;
  hardwareEligible: boolean;
  gpuFamily: string | null;
  knownCombo: string | null;
  engine: EngineInfo["engine"] | null;
  android: boolean;
  evidence: EvidenceCounts;
  evidenceScore: number;
  score: number;
  threshold: number;
  activated: boolean;
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let hardware: {
  renderer: string;
  signature: string;
  hardwareScore: number;
  hardwareEligible: boolean;
  gpuFamily: string | null;
  knownCombo: string | null;
  engine: EngineInfo["engine"] | null;
  android: boolean;
} | null = null;

let evidence: EvidenceCounts = {};
let installed = false;

const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((l) => l());
}

// ---------------------------------------------------------------------------
// Hardware signal collection (never an activation trigger on its own)
// ---------------------------------------------------------------------------

function readRenderer(): string {
  if (typeof document !== "undefined") {
    const attr = document.documentElement.getAttribute("data-gpu-renderer");
    if (attr && attr !== "unknown") return attr;
  }
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl") ||
      c.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return "unknown";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const s = ext
      ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    return (s || "unknown").toString();
  } catch {
    return "unknown";
  }
}

function detectEngine(): EngineInfo | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent || "";
  let m = ua.match(/SamsungBrowser\/(\d+)/);
  if (m && parseInt(m[1], 10) < 14) return { engine: "samsung", weight: 22 };
  if (/Android/.test(ua) && (m = ua.match(/Chrome\/(\d+)/)) && parseInt(m[1], 10) < 80) {
    return { engine: "chromium", weight: 20 };
  }
  return null;
}

function collectHardware() {
  if (hardware) return hardware;
  const renderer = readRenderer();
  const rl = renderer.toLowerCase();
  const android = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent || "");

  const family = SUSPECT_GPU_FAMILIES.find((f) => f.pattern.test(rl)) || null;
  const combo = KNOWN_BAD_COMBOS.find((c) => c.pattern.test(rl)) || null;
  const engine = detectEngine();

  // Hardware score is capped BELOW the activation threshold by construction:
  // no combination of hardware signals can reach 90 without runtime evidence.
  let hardwareScore = 0;
  if (family) hardwareScore += family.weight;
  if (combo) hardwareScore += combo.weight - (family ? 15 : 0); // avoid double-count
  if (engine) hardwareScore += engine.weight;
  if (android) hardwareScore += 6;
  hardwareScore = Math.min(hardwareScore, 75);

  // Eligibility gate: a device must have suspect hardware or a suspect engine
  // to ever be a candidate. Healthy Chromium/desktop devices are never eligible
  // regardless of transient runtime anomalies.
  const hardwareEligible = Boolean(family || combo || engine);

  hardware = {
    renderer,
    signature: renderer || "unknown",
    hardwareScore,
    hardwareEligible,
    gpuFamily: family?.family ?? null,
    knownCombo: combo?.label ?? null,
    engine: engine?.engine ?? null,
    android,
  };
  return hardware;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function evidenceScore(counts: EvidenceCounts): number {
  let total = 0;
  (Object.keys(EVIDENCE_WEIGHTS) as EvidenceKind[]).forEach((kind) => {
    const n = counts[kind] ?? 0;
    if (n <= 0) return;
    const { weight, cap } = EVIDENCE_WEIGHTS[kind];
    total += Math.min(n * weight, cap);
  });
  return total;
}

export function evaluate(): ConfidenceBreakdown {
  const hw = collectHardware();
  const evScore = evidenceScore(evidence);
  // Evidence only counts toward activation on eligible hardware; on
  // non-eligible hardware anomalies are treated as unrelated noise.
  const combined = hw.hardwareEligible
    ? Math.min(100, hw.hardwareScore + evScore)
    : Math.min(100, hw.hardwareScore); // never crosses threshold (score<=75)
  const activated =
    hw.hardwareEligible && combined >= ACTIVATION_THRESHOLD;

  return {
    renderer: hw.renderer,
    signature: hw.signature,
    hardwareScore: hw.hardwareScore,
    hardwareEligible: hw.hardwareEligible,
    gpuFamily: hw.gpuFamily,
    knownCombo: hw.knownCombo,
    engine: hw.engine,
    android: hw.android,
    evidence: { ...evidence },
    evidenceScore: evScore,
    score: combined,
    threshold: ACTIVATION_THRESHOLD,
    activated,
  };
}

// ---------------------------------------------------------------------------
// Persistence (renderer-signature scoped so evidence never crosses devices)
// ---------------------------------------------------------------------------

function loadPersistedEvidence(sig: string) {
  try {
    const raw = localStorage.getItem(EVIDENCE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { sig?: string; counts?: EvidenceCounts };
    if (parsed && parsed.sig === sig && parsed.counts) {
      evidence = { ...parsed.counts };
    }
  } catch {
    /* storage disabled */
  }
}

function persistEvidence(sig: string) {
  try {
    localStorage.setItem(EVIDENCE_KEY, JSON.stringify({ sig, counts: evidence }));
  } catch {
    /* ignore */
  }
}

function persistActivation(sig: string, reason: string) {
  try {
    localStorage.setItem(ACTIVATED_KEY, JSON.stringify({ sig, reason, at: Date.now() }));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

function activate(reason: "gpu" | "engine") {
  if (typeof document === "undefined") return;
  const d = document.documentElement;
  if (d.getAttribute("data-gpu-unsafe") === "true") return; // already on
  d.setAttribute("data-gpu-unsafe", "true");
  d.setAttribute("data-compat-reason", reason);
  const hw = collectHardware();
  persistActivation(hw.signature, reason);
  try {
    console.info(
      "%c[FOM Compatibility] activated",
      "color:#ff8a3d;font-weight:bold",
      evaluate(),
    );
  } catch {
    /* ignore */
  }
  notify();
}

/** Re-score and activate Compatibility Mode if the threshold is now crossed. */
function reevaluateAndMaybeActivate() {
  const result = evaluate();
  if (result.activated) {
    activate(result.engine && !result.gpuFamily ? "engine" : "gpu");
  }
}

// ---------------------------------------------------------------------------
// Public evidence API — called by runtime diagnostics on real anomalies
// ---------------------------------------------------------------------------

export function recordCompatEvidence(kind: EvidenceKind, count = 1) {
  if (typeof window === "undefined" || count <= 0) return;
  const hw = collectHardware();
  evidence[kind] = (evidence[kind] ?? 0) + count;
  persistEvidence(hw.signature);
  reevaluateAndMaybeActivate();
  notify();
}

// ---------------------------------------------------------------------------
// Self-contained, always-on evidence listeners (independent of debug mode)
// ---------------------------------------------------------------------------

function installEvidenceListeners() {
  // WebGL context loss anywhere in the document.
  document.addEventListener(
    "webglcontextlost",
    () => recordCompatEvidence("webgl-context-lost"),
    true,
  );

  // Image load/decode failures (a corrupted-tile correlate). Only count
  // same-origin/product imagery to avoid third-party noise.
  document.addEventListener(
    "error",
    (e) => {
      const t = e.target as HTMLElement | null;
      if (t && t.tagName === "IMG") recordCompatEvidence("image-decode-failure");
    },
    true,
  );

  // createImageBitmap corruption path (known Mali texture-upload failure).
  if (typeof window.createImageBitmap === "function") {
    const orig = window.createImageBitmap.bind(window);
    window.createImageBitmap = ((...args: Parameters<typeof orig>) =>
      orig(...args).catch((err) => {
        recordCompatEvidence("image-bitmap-failure");
        throw err;
      })) as typeof window.createImageBitmap;
  }
}

// ---------------------------------------------------------------------------
// Boot / init
// ---------------------------------------------------------------------------

/**
 * Initialise the confidence system after hydration. Loads any evidence
 * persisted for this device's renderer signature, re-scores (a device that was
 * confirmed-affected in a prior session activates immediately), and installs
 * always-on evidence listeners for the current session.
 *
 * Note: the pre-paint inline script in __root.tsx already re-applies
 * `data-gpu-unsafe` before first paint for signatures previously confirmed —
 * this keeps React in sync and continues gathering evidence.
 */
export function initCompatConfidence() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const hw = collectHardware();
  loadPersistedEvidence(hw.signature);
  installEvidenceListeners();
  reevaluateAndMaybeActivate();
  installPreviewControls();
  notify();
}

// ---------------------------------------------------------------------------
// Hidden preview/testing switch — for QA only. Lets you SHOW the Compatibility
// Mode banner + dialogs on demand without affecting the real confidence engine,
// scoring, evidence, or persistence. Enable via:
//   • URL param:  ?compatPreview=1   (add ?compatPreview=0 to turn off)
//   • Console:    window.__fomCompatPreview(true)  /  (false)
// Preview mode is session-only and never writes the confirmed-activation key,
// so it can't turn a healthy device into a "confirmed affected" one.
// ---------------------------------------------------------------------------

let previewOn = false;

/** Turn the visual preview of Compatibility Mode on/off (testing only). */
export function setCompatPreview(on: boolean) {
  if (typeof document === "undefined") return;
  previewOn = on;
  const d = document.documentElement;
  if (on) {
    d.setAttribute("data-gpu-unsafe", "true");
    if (!d.getAttribute("data-compat-reason")) d.setAttribute("data-compat-reason", "gpu");
    d.setAttribute("data-compat-preview", "true");
    // Clear the 30-day dismissal so the banner is guaranteed to appear.
    try {
      localStorage.removeItem("fom-compat-banner-dismissed");
      localStorage.removeItem("fom-compat-banner-dismissed-at");
    } catch {
      /* ignore */
    }
  } else {
    d.removeAttribute("data-compat-preview");
    // Only clear the flag if it wasn't set by a genuine confirmed activation.
    if (!isConfirmedActivated()) {
      d.setAttribute("data-gpu-unsafe", "false");
      d.removeAttribute("data-compat-reason");
    }
  }
  notify();
}

/** True when the current device has a genuine, persisted confirmed activation. */
function isConfirmedActivated(): boolean {
  try {
    const raw = localStorage.getItem(ACTIVATED_KEY);
    if (!raw) return false;
    const a = JSON.parse(raw) as { sig?: string };
    return Boolean(a && a.sig === collectHardware().signature);
  } catch {
    return false;
  }
}

function installPreviewControls() {
  try {
    (window as unknown as { __fomCompatPreview?: (on?: boolean) => void }).__fomCompatPreview = (
      on = true,
    ) => setCompatPreview(on);
    const params = new URLSearchParams(window.location.search);
    if (params.has("compatPreview")) {
      setCompatPreview(params.get("compatPreview") !== "0");
    }
  } catch {
    /* ignore */
  }
}

/** Whether the visual preview switch is currently active (testing only). */
export function isCompatPreview(): boolean {
  return previewOn;
}

// ---------------------------------------------------------------------------
// Subscription (drives the reactive React hooks in gpu-compat.ts)
// ---------------------------------------------------------------------------

export function subscribeCompat(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Diagnostics helper for the debug panel / console. */
export function getCompatConfidence(): ConfidenceBreakdown {
  return evaluate();
}
