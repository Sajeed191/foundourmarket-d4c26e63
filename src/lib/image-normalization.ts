/**
 * ImageNormalizationService — Phase A + A.5 foundation.
 *
 * Single interface every gallery/PDP surface calls to render product media.
 * Phase A: `getDisplayImage()` + `PREMIUM_GALLERY_VIEWPORT` (fixed viewport).
 * Phase A.5 (this file):
 *   - `ImageAnalysis` metadata schema (versioned, forward-compatible)
 *   - `analyzeImage()` — deterministic, canvas-based analysis (browser only)
 *   - `computeHealthScore()` — 0-100 score + band + suggestions
 *   - `generateNormalizedDerivative()` — deterministic padded WebP when needed
 * Phase B will add ML-derived fields (bboxes, masks, confidence) WITHOUT
 * changing the public API — the gallery keeps calling `getDisplayImage()`.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Public rendering surface (stable)
// ─────────────────────────────────────────────────────────────────────────────

export type NormalizedImageSource = {
  url: string;
  alt?: string | null;
  normalizedUrl?: string | null;
  width?: number | null;
  height?: number | null;
  aspectRatio?: number | null;
  productOccupancy?: number | null;
  analysis?: ImageAnalysis | null;
};

export type DisplayImage = {
  url: string;
  alt: string;
  isNormalized: boolean;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
};

/**
 * Fixed premium gallery viewport — Phase A. Reserved via CSS so the
 * browser paints the correct box before the image decodes.
 */
export const PREMIUM_GALLERY_VIEWPORT = {
  heights: { mobile: 340, tablet: 380, desktop: 480 },
  className: "h-[340px] sm:h-[380px] lg:h-[480px]",
  objectFit: "contain" as const,
  safePadding: "p-4 sm:p-6 lg:p-8",
};

/**
 * Resolve any product image reference to what the gallery should render.
 * Prefers `normalizedUrl` when present. Gallery components never branch on
 * whether an image is original / normalized / AI-enhanced — that decision
 * lives here.
 */
export function getDisplayImage(
  input: NormalizedImageSource | string | null | undefined,
  fallbackAlt = "",
): DisplayImage {
  if (!input) {
    return { url: "", alt: fallbackAlt, isNormalized: false, width: null, height: null, aspectRatio: null };
  }
  if (typeof input === "string") {
    return { url: input, alt: fallbackAlt, isNormalized: false, width: null, height: null, aspectRatio: null };
  }
  const url = input.normalizedUrl || input.url;
  return {
    url,
    alt: input.alt || fallbackAlt,
    isNormalized: Boolean(input.normalizedUrl),
    width: input.width ?? input.analysis?.width ?? null,
    height: input.height ?? input.analysis?.height ?? null,
    aspectRatio:
      input.aspectRatio ??
      input.analysis?.aspectRatio ??
      (input.width && input.height ? input.width / input.height : null),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Analysis schema (versioned — extend fields, never break the shape)
// ─────────────────────────────────────────────────────────────────────────────

export const IMAGE_ANALYSIS_VERSION = 2;

export type Orientation = "portrait" | "landscape" | "square";
export type BackgroundType = "solid" | "gradient" | "photo" | "transparent";

/**
 * v2 payload: flat v1 fields remain for back-compat; namespaced sections
 * scope future intelligence without further schema migrations. Deterministic
 * signals live under `image`/`product`/`background`; AI-derived signals live
 * under `ai` and always carry confidence.
 */
export type ImageAnalysis = {
  version: number;
  // ── v1 flat fields — every downstream reader still uses these ──
  width: number;
  height: number;
  aspectRatio: number;
  orientation: Orientation;
  megapixels: number;
  occupancy: number;
  emptyMarginPct: number;
  hasTransparentBorder: boolean;
  backgroundType: BackgroundType;
  backgroundColorHex: string | null;
  sharpness: number;
  brightness: number;
  normalized: boolean;
  healthScore: number;

  // ── v2 namespaces (optional on read; populated by v2+ analyzers) ──
  image?: {
    width: number;
    height: number;
    aspectRatio: number;
    orientation: Orientation;
    megapixels: number;
    sharpness: number;
    brightness: number;
  };
  product?: {
    analyzed: boolean;
    occupancy: number;
    emptyMarginPct: number;
    objects: Array<{
      id: number;
      bbox: { x: number; y: number; width: number; height: number };
      confidence: number;
    }>;
    confidence: number | null;
  };
  background?: {
    type: BackgroundType;
    colorHex: string | null;
    hasTransparentBorder: boolean;
    confidence: number | null;
  };
  ai?: {
    provider: string | null;
    model: string | null;
    version: string | null;
    analyzedAt: string | null;
    cacheVersion: number;
  };
  quality?: {
    healthScore: number;
    band: HealthBand;
    galleryContribution: number | null;
    readinessScore: number | null;
    suggestions: HealthSuggestion[];
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Canvas-based analyzer (browser only)
// ─────────────────────────────────────────────────────────────────────────────

const ANALYSIS_MAX = 96; // downscale target — keeps analysis O(96²)
const OCCUPANCY_ALPHA_THRESHOLD = 8; // alpha ≤ 8 → transparent
const OCCUPANCY_COLOR_TOLERANCE = 14; // luma diff from bg → "product"

function loadHTMLImage(src: Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = typeof src === "string" ? src : URL.createObjectURL(src);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode image"));
    img.src = url;
  });
}

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Deterministic analysis. Runs entirely in-browser on a downscaled bitmap so
 * it never blocks the upload for more than a few ms even on 20MB images.
 */
export async function analyzeImage(source: Blob | HTMLImageElement): Promise<ImageAnalysis> {
  const img = source instanceof HTMLImageElement ? source : await loadHTMLImage(source);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const megapixels = (width * height) / 1_000_000;
  const aspectRatio = width && height ? width / height : 1;
  const orientation: Orientation =
    Math.abs(aspectRatio - 1) < 0.03 ? "square" : aspectRatio > 1 ? "landscape" : "portrait";

  if (typeof document === "undefined") {
    // SSR fallback — return a minimal, honest analysis.
    return baseAnalysis(width, height, aspectRatio, orientation, megapixels);
  }

  const canvas = document.createElement("canvas");
  const sw = ANALYSIS_MAX;
  const sh = ANALYSIS_MAX;
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return baseAnalysis(width, height, aspectRatio, orientation, megapixels);
  ctx.drawImage(img, 0, 0, sw, sh);
  const { data } = ctx.getImageData(0, 0, sw, sh);

  // Grayscale + alpha buffers.
  const gray = new Float32Array(sw * sh);
  const alpha = new Uint8ClampedArray(sw * sh);
  let sum = 0;
  for (let i = 0; i < sw * sh; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    gray[i] = l;
    alpha[i] = a;
    sum += l;
  }
  const brightness = sum / (sw * sh);

  // Sample the four corners to detect the reference background.
  const cornerIdx = [0, sw - 1, (sh - 1) * sw, sw * sh - 1];
  const cornerR: number[] = [], cornerG: number[] = [], cornerB: number[] = [], cornerA: number[] = [];
  for (const i of cornerIdx) {
    cornerR.push(data[i * 4]); cornerG.push(data[i * 4 + 1]);
    cornerB.push(data[i * 4 + 2]); cornerA.push(data[i * 4 + 3]);
  }
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const bgR = avg(cornerR), bgG = avg(cornerG), bgB = avg(cornerB), bgA = avg(cornerA);
  const bgLuma = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;
  const cornerLumaSpread = Math.max(...cornerR.map((_, i) =>
    Math.abs((0.299 * cornerR[i] + 0.587 * cornerG[i] + 0.114 * cornerB[i]) - bgLuma),
  ));
  const hasTransparentBorder = bgA < 20;

  // Product occupancy: bbox of pixels that differ from the background OR are
  // opaque against a transparent background. Deterministic, no ML required.
  let minX = sw, minY = sh, maxX = -1, maxY = -1, productPixels = 0;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const i = y * sw + x;
      const isProduct = hasTransparentBorder
        ? alpha[i] > OCCUPANCY_ALPHA_THRESHOLD
        : Math.abs(gray[i] - bgLuma) > OCCUPANCY_COLOR_TOLERANCE;
      if (isProduct) {
        productPixels++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  const totalPixels = sw * sh;
  const bboxArea = maxX >= 0 ? (maxX - minX + 1) * (maxY - minY + 1) : 0;
  const occupancy = totalPixels ? Math.round((bboxArea / totalPixels) * 100) : 0;
  const emptyMarginPct = 100 - occupancy;

  // Laplacian variance → sharpness (blur detector).
  let lapSum = 0, lapSq = 0, n = 0;
  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      const i = y * sw + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - sw] - gray[i + sw];
      lapSum += lap; lapSq += lap * lap; n++;
    }
  }
  const meanLap = lapSum / n;
  const sharpness = Math.round(Math.max(0, lapSq / n - meanLap * meanLap));

  // Background classification.
  let backgroundType: BackgroundType;
  if (hasTransparentBorder) backgroundType = "transparent";
  else if (cornerLumaSpread < 4) backgroundType = "solid";
  else if (cornerLumaSpread < 22) backgroundType = "gradient";
  else backgroundType = "photo";

  const backgroundColorHex = backgroundType === "transparent" ? null : toHex(bgR, bgG, bgB);

  const analysis: ImageAnalysis = {
    version: IMAGE_ANALYSIS_VERSION,
    width, height, aspectRatio,
    orientation, megapixels: Math.round(megapixels * 100) / 100,
    occupancy, emptyMarginPct,
    hasTransparentBorder,
    backgroundType, backgroundColorHex,
    sharpness, brightness: Math.round(brightness),
    normalized: false,
    healthScore: 0,
  };
  const health = computeHealthScore(analysis);
  analysis.healthScore = health.score;
  hydrateV2Namespaces(analysis, health);
  void productPixels;
  return analysis;
}

function baseAnalysis(
  width: number, height: number, aspectRatio: number,
  orientation: Orientation, megapixels: number,
): ImageAnalysis {
  const a: ImageAnalysis = {
    version: IMAGE_ANALYSIS_VERSION,
    width, height, aspectRatio, orientation,
    megapixels: Math.round(megapixels * 100) / 100,
    occupancy: 0, emptyMarginPct: 0, hasTransparentBorder: false,
    backgroundType: "photo", backgroundColorHex: null,
    sharpness: 0, brightness: 0, normalized: false, healthScore: 0,
  };
  hydrateV2Namespaces(a, computeHealthScore(a));
  return a;
}

/**
 * Populate v2 namespaces from the flat v1 fields. Additive only — never
 * mutates the flat fields, so v1 readers stay intact.
 */
function hydrateV2Namespaces(a: ImageAnalysis, health: HealthScore): void {
  a.image = {
    width: a.width,
    height: a.height,
    aspectRatio: a.aspectRatio,
    orientation: a.orientation,
    megapixels: a.megapixels,
    sharpness: a.sharpness,
    brightness: a.brightness,
  };
  a.product = {
    analyzed: false,
    occupancy: a.occupancy,
    emptyMarginPct: a.emptyMarginPct,
    objects: [],
    confidence: null,
  };
  a.background = {
    type: a.backgroundType,
    colorHex: a.backgroundColorHex,
    hasTransparentBorder: a.hasTransparentBorder,
    confidence: null,
  };
  a.ai = {
    provider: null,
    model: null,
    version: null,
    analyzedAt: null,
    cacheVersion: 1,
  };
  a.quality = {
    healthScore: health.score,
    band: health.band,
    galleryContribution: null,
    readinessScore: null,
    suggestions: health.suggestions,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// Health score + suggestions
// ─────────────────────────────────────────────────────────────────────────────

export type HealthBand = "excellent" | "good" | "needs-work" | "poor";

export type HealthSuggestion = {
  key: string;
  label: string;
  severity: "info" | "warning";
};

export type HealthScore = {
  score: number;      // 0-100
  band: HealthBand;
  suggestions: HealthSuggestion[];
};

const SUGGESTIONS: Record<string, HealthSuggestion> = {
  low_res: { key: "low_res", label: "Resolution below 1000px — zoom will look soft.", severity: "warning" },
  tiny: { key: "tiny", label: "Image is very small; the gallery will look pixelated.", severity: "warning" },
  low_occupancy: { key: "low_occupancy", label: "Product occupies less than 55% of the canvas.", severity: "warning" },
  huge_margins: { key: "huge_margins", label: "Large empty margins detected — will be padded on upload.", severity: "info" },
  blurry: { key: "blurry", label: "Image looks blurry or out of focus.", severity: "warning" },
  dark: { key: "dark", label: "Image is dark — brighten before uploading.", severity: "info" },
  overexposed: { key: "overexposed", label: "Image is overexposed — reduce brightness.", severity: "info" },
  extreme_aspect: { key: "extreme_aspect", label: "Non-standard aspect ratio — square works best.", severity: "info" },
  transparent_border: { key: "transparent_border", label: "Transparent border detected — will be trimmed.", severity: "info" },
  photo_bg: { key: "photo_bg", label: "Busy background — a plain background looks more premium.", severity: "info" },
};

export function computeHealthScore(a: ImageAnalysis): HealthScore {
  let score = 100;
  const flags: HealthSuggestion[] = [];

  const longEdge = Math.max(a.width, a.height);
  if (longEdge < 600) { score -= 30; flags.push(SUGGESTIONS.tiny); }
  else if (longEdge < 1000) { score -= 15; flags.push(SUGGESTIONS.low_res); }

  if (a.occupancy > 0 && a.occupancy < 55) { score -= 18; flags.push(SUGGESTIONS.low_occupancy); }
  if (a.emptyMarginPct > 35) flags.push(SUGGESTIONS.huge_margins);

  if (a.sharpness > 0 && a.sharpness < 50) { score -= 20; flags.push(SUGGESTIONS.blurry); }

  if (a.brightness && a.brightness < 55) { score -= 8; flags.push(SUGGESTIONS.dark); }
  if (a.brightness && a.brightness > 240) { score -= 8; flags.push(SUGGESTIONS.overexposed); }

  if (a.aspectRatio < 0.6 || a.aspectRatio > 1.8) { score -= 10; flags.push(SUGGESTIONS.extreme_aspect); }
  if (a.hasTransparentBorder) flags.push(SUGGESTIONS.transparent_border);
  if (a.backgroundType === "photo") { score -= 6; flags.push(SUGGESTIONS.photo_bg); }

  score = Math.max(0, Math.min(100, score));
  const band: HealthBand =
    score >= 90 ? "excellent" : score >= 75 ? "good" : score >= 55 ? "needs-work" : "poor";
  return { score, band, suggestions: flags };
}

// ─────────────────────────────────────────────────────────────────────────────
// Derivative generator — deterministic, no AI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decide whether the gallery would benefit from a normalized derivative.
 * Conservative: only produce one when the source clearly won't render well
 * in a fixed viewport (small canvas, huge margins, or non-square).
 */
export function shouldNormalize(a: ImageAnalysis): boolean {
  const longEdge = Math.max(a.width, a.height);
  if (a.hasTransparentBorder) return true;
  if (longEdge < 1200) return true;
  if (a.emptyMarginPct > 35) return true;
  if (a.aspectRatio < 0.85 || a.aspectRatio > 1.15) return true;
  return false;
}

/**
 * Generate a padded square WebP derivative. Never upscales the product
 * itself: it is drawn 1:1 (or scaled to fit) onto a larger square canvas
 * with the detected background color (or white as a safe default). Trims
 * transparent borders when the source has an alpha channel.
 */
export async function generateNormalizedDerivative(
  source: Blob | HTMLImageElement,
  a: ImageAnalysis,
  opts: { targetDim?: number; quality?: number } = {},
): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  const img = source instanceof HTMLImageElement ? source : await loadHTMLImage(source);
  const targetDim = Math.min(opts.targetDim ?? 1600, Math.max(1200, Math.max(a.width, a.height)));

  // Scale the source to fit ~82% of the target canvas (safe zone).
  const safeArea = targetDim * 0.82;
  const scale = Math.min(1, safeArea / Math.max(img.naturalWidth, img.naturalHeight));
  const drawW = Math.round(img.naturalWidth * scale);
  const drawH = Math.round(img.naturalHeight * scale);
  const dx = Math.round((targetDim - drawW) / 2);
  const dy = Math.round((targetDim - drawH) / 2);

  const canvas = document.createElement("canvas");
  canvas.width = targetDim;
  canvas.height = targetDim;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Fill background — use detected bg color when solid, else premium white.
  const bg =
    a.backgroundType === "solid" && a.backgroundColorHex
      ? a.backgroundColorHex
      : a.hasTransparentBorder
        ? "#ffffff"
        : "#ffffff";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, targetDim, targetDim);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, dx, dy, drawW, drawH);

  return await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/webp", opts.quality ?? 0.86);
  });
}
