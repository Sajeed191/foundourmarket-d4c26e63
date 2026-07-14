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
    heroSuitability?: number | null;
    isRecommendedPrimary?: boolean;
    recommendationReason?: string[];
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

// ─────────────────────────────────────────────────────────────────────────────
// Gallery consistency — deterministic, cross-image quality analysis
// ─────────────────────────────────────────────────────────────────────────────

export type GalleryDimensionKey =
  | "consistency"
  | "lighting"
  | "background"
  | "framing"
  | "resolution"
  | "primary";

export type GalleryDimension = {
  key: GalleryDimensionKey;
  label: string;
  score: number;      // 0-100
  band: HealthBand;
};

export type GalleryRecommendation = {
  key: string;
  label: string;
  severity: "info" | "warning";
  imageIndex?: number;
};

export type GalleryHealth = {
  overall: number;    // 0-100
  band: HealthBand;
  count: number;
  dimensions: Record<GalleryDimensionKey, GalleryDimension>;
  recommendations: GalleryRecommendation[];
};

function bandOf(score: number): HealthBand {
  return score >= 90 ? "excellent" : score >= 75 ? "good" : score >= 55 ? "needs-work" : "poor";
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

function pctFromDeviation(dev: number, tolerant: number, strict: number): number {
  // dev ≤ strict → 100; dev ≥ tolerant → 0; linear between.
  if (dev <= strict) return 100;
  if (dev >= tolerant) return 0;
  return Math.round(100 - ((dev - strict) / (tolerant - strict)) * 100);
}

/**
 * Cross-image quality score for a whole gallery. Deterministic — uses only
 * signals already collected per-image (Tier 1). AI signals plug into the
 * same reducer later without changing the surface.
 */
export function computeGalleryHealth(analyses: (ImageAnalysis | null | undefined)[]): GalleryHealth {
  const items = analyses.filter((a): a is ImageAnalysis => !!a);
  const count = items.length;

  if (count === 0) {
    const empty: GalleryDimension = { key: "consistency", label: "Image consistency", score: 0, band: "poor" };
    return {
      overall: 0,
      band: "poor",
      count: 0,
      dimensions: {
        consistency: empty,
        lighting: { ...empty, key: "lighting", label: "Lighting" },
        background: { ...empty, key: "background", label: "Background" },
        framing: { ...empty, key: "framing", label: "Framing" },
        resolution: { ...empty, key: "resolution", label: "Resolution" },
        primary: { ...empty, key: "primary", label: "Primary image quality" },
      },
      recommendations: [{ key: "empty", label: "No images uploaded yet.", severity: "info" }],
    };
  }

  const brightnessArr = items.map((a) => a.brightness);
  const aspectArr = items.map((a) => a.aspectRatio);
  const occupancyArr = items.map((a) => a.occupancy);
  const longEdges = items.map((a) => Math.max(a.width, a.height));
  const bgTypes = items.map((a) => a.backgroundType);
  const bgColors = items.map((a) => a.backgroundColorHex ?? "");

  // Consistency = blend of framing + background + lighting spread.
  const brightnessDev = stddev(brightnessArr);
  const aspectDev = stddev(aspectArr);
  const occupancyDev = stddev(occupancyArr);

  const lighting = pctFromDeviation(brightnessDev, 60, 8);
  const framing = Math.round(
    (pctFromDeviation(aspectDev, 0.35, 0.03) + pctFromDeviation(occupancyDev, 30, 4)) / 2,
  );

  // Background: same type + similar color.
  const uniqTypes = new Set(bgTypes).size;
  const uniqColors = new Set(bgColors.filter(Boolean)).size;
  let background = 100;
  if (uniqTypes > 1) background -= (uniqTypes - 1) * 20;
  if (uniqColors > 1) background -= Math.min(30, (uniqColors - 1) * 10);
  const photoCount = bgTypes.filter((t) => t === "photo").length;
  if (photoCount > 0) background -= Math.min(20, photoCount * 8);
  background = Math.max(0, Math.min(100, background));

  // Resolution: penalize small min edge, reward consistent high resolution.
  const minEdge = Math.min(...longEdges);
  const edgeDev = stddev(longEdges);
  let resolution = 100;
  if (minEdge < 600) resolution -= 40;
  else if (minEdge < 1000) resolution -= 20;
  else if (minEdge < 1600) resolution -= 8;
  resolution -= Math.min(20, Math.round(edgeDev / 200));
  resolution = Math.max(0, Math.min(100, resolution));

  // Primary image quality = health of index 0.
  const primaryScore = items[0]?.healthScore ?? 0;

  // Consistency dimension = weighted blend.
  const consistency = Math.round(lighting * 0.3 + framing * 0.35 + background * 0.35);

  // Overall
  const overall = Math.round(
    consistency * 0.28 +
      lighting * 0.14 +
      background * 0.16 +
      framing * 0.16 +
      resolution * 0.14 +
      primaryScore * 0.12,
  );

  // Recommendations (actionable, per-image where possible).
  const recs: GalleryRecommendation[] = [];
  if (primaryScore < 80) {
    recs.push({
      key: "primary_weak",
      label: "Hero image is below premium quality — consider a brighter, cleaner shot.",
      severity: "warning",
      imageIndex: 0,
    });
  }
  if (lighting < 75) {
    const brightest = brightnessArr.indexOf(Math.max(...brightnessArr));
    const darkest = brightnessArr.indexOf(Math.min(...brightnessArr));
    recs.push({
      key: "lighting_spread",
      label: `Lighting varies between image ${darkest + 1} and image ${brightest + 1}.`,
      severity: "warning",
    });
  }
  if (background < 75) {
    if (photoCount > 0) {
      const idx = bgTypes.findIndex((t) => t === "photo");
      recs.push({
        key: "bg_busy",
        label: `Image ${idx + 1} has a busy background — plain backgrounds look more premium.`,
        severity: "warning",
        imageIndex: idx,
      });
    } else if (uniqColors > 1) {
      recs.push({
        key: "bg_color_mismatch",
        label: "Background colors differ across the gallery.",
        severity: "info",
      });
    }
  }
  if (framing < 75) {
    const outlier = occupancyArr.indexOf(Math.min(...occupancyArr));
    recs.push({
      key: "framing_off",
      label: `Image ${outlier + 1} has inconsistent framing — reshoot at a similar zoom.`,
      severity: "warning",
      imageIndex: outlier,
    });
  }
  if (resolution < 75) {
    const idx = longEdges.indexOf(Math.min(...longEdges));
    recs.push({
      key: "res_low",
      label: `Image ${idx + 1} is lower resolution than the rest of the gallery.`,
      severity: "warning",
      imageIndex: idx,
    });
  }
  if (count === 1) {
    recs.push({
      key: "single_image",
      label: "Only one image — add 3-5 angles for a premium listing.",
      severity: "info",
    });
  }

  // Also stamp per-image galleryContribution back into v2.quality when present.
  for (const a of items) {
    if (a.quality) a.quality.galleryContribution = overall;
  }

  return {
    overall,
    band: bandOf(overall),
    count,
    dimensions: {
      consistency: { key: "consistency", label: "Image consistency", score: consistency, band: bandOf(consistency) },
      lighting: { key: "lighting", label: "Lighting", score: lighting, band: bandOf(lighting) },
      background: { key: "background", label: "Background", score: background, band: bandOf(background) },
      framing: { key: "framing", label: "Framing", score: framing, band: bandOf(framing) },
      resolution: { key: "resolution", label: "Resolution", score: resolution, band: bandOf(resolution) },
      primary: { key: "primary", label: "Primary image quality", score: primaryScore, band: bandOf(primaryScore) },
    },
    recommendations: recs,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// Hero Recommendation Engine — deterministic, explainable
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Centralized weights for Hero Suitability. Keep them here so Phase B AI
 * signals can join later without touching call sites.
 */
export const HERO_SUITABILITY_WEIGHTS = {
  occupancy: 0.30,
  sharpness: 0.20,
  framing: 0.15,
  resolution: 0.10,
  brightness: 0.10,
  background: 0.10,
  aspect: 0.05,
} as const;

/** Minimum score delta over the current hero required to recommend a swap. */
export const HERO_RECOMMEND_THRESHOLD = 5;

function clamp100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Deterministic Hero Suitability score for a single image. */
export function computeHeroSuitability(a: ImageAnalysis): number {
  const occupancyScore = clamp100(100 - Math.abs(a.occupancy - 75) * 1.6);
  const sharpnessScore = clamp100((Math.min(a.sharpness, 300) / 300) * 100);
  const aspectDelta = Math.abs(a.aspectRatio - 1);
  const framingScore = clamp100(100 - aspectDelta * 60 - Math.max(0, a.emptyMarginPct - 25) * 1.2);
  const longEdge = Math.max(a.width, a.height);
  const resolutionScore =
    longEdge >= 1600 ? 100
    : longEdge >= 1200 ? 88
    : longEdge >= 1000 ? 72
    : longEdge >= 700 ? 50
    : 25;
  const brightnessScore = clamp100(100 - Math.max(0, Math.abs(a.brightness - 155) - 25) * 1.4);
  const backgroundScore =
    a.backgroundType === "solid" ? 100
    : a.backgroundType === "transparent" ? 96
    : a.backgroundType === "gradient" ? 78
    : 55;
  const aspectScore = clamp100(100 - aspectDelta * 90);

  const w = HERO_SUITABILITY_WEIGHTS;
  const total =
    occupancyScore * w.occupancy +
    sharpnessScore * w.sharpness +
    framingScore * w.framing +
    resolutionScore * w.resolution +
    brightnessScore * w.brightness +
    backgroundScore * w.background +
    aspectScore * w.aspect;

  return clamp100(total);
}

export type HeroRecommendation = {
  currentIndex: number;
  recommendedIndex: number;
  recommendedScore: number;
  currentScore: number;
  delta: number;
  shouldRecommend: boolean;
  perImage: number[];
  reasons: string[];
};

function reasonsFor(candidate: ImageAnalysis, current: ImageAnalysis): string[] {
  const out: string[] = [];
  if (candidate.sharpness > current.sharpness + 30) out.push("Sharper than current hero");
  if (Math.abs(candidate.occupancy - 75) < Math.abs(current.occupancy - 75) - 8)
    out.push("Better product framing");
  if (Math.max(candidate.width, candidate.height) > Math.max(current.width, current.height) * 1.2)
    out.push("Higher resolution");
  if (
    (candidate.backgroundType === "solid" || candidate.backgroundType === "transparent") &&
    current.backgroundType === "photo"
  )
    out.push("Cleaner background");
  if (Math.abs(candidate.brightness - 155) < Math.abs(current.brightness - 155) - 20)
    out.push("Better exposure");
  if (Math.abs(candidate.aspectRatio - 1) < Math.abs(current.aspectRatio - 1) - 0.15)
    out.push("More square-friendly aspect ratio");
  if (out.length === 0) out.push("Higher overall Hero Suitability score");
  return out;
}

/**
 * Recommend the best hero image from a gallery. Deterministic; only flags a
 * recommendation when the improvement is meaningful. Stamps per-image
 * `quality.heroSuitability` / `isRecommendedPrimary` so downstream UIs can
 * render badges without recomputing.
 */
export function recommendHeroImage(
  analyses: (ImageAnalysis | null | undefined)[],
  currentIndex = 0,
): HeroRecommendation {
  const items = analyses.map((a) => a ?? null);
  const perImage = items.map((a) => (a ? computeHeroSuitability(a) : 0));

  let bestIndex = currentIndex;
  let bestScore = perImage[currentIndex] ?? 0;
  perImage.forEach((s, i) => {
    if (s > bestScore) {
      bestScore = s;
      bestIndex = i;
    }
  });

  const currentScore = perImage[currentIndex] ?? 0;
  const delta = bestScore - currentScore;
  const shouldRecommend = bestIndex !== currentIndex && delta >= HERO_RECOMMEND_THRESHOLD;

  const current = items[currentIndex];
  const candidate = items[bestIndex];
  const reasons =
    shouldRecommend && current && candidate ? reasonsFor(candidate, current) : [];

  items.forEach((a, i) => {
    if (!a || !a.quality) return;
    a.quality.heroSuitability = perImage[i];
    a.quality.isRecommendedPrimary = shouldRecommend && i === bestIndex;
    a.quality.recommendationReason = shouldRecommend && i === bestIndex ? reasons : [];
  });

  return {
    currentIndex,
    recommendedIndex: bestIndex,
    recommendedScore: bestScore,
    currentScore,
    delta,
    shouldRecommend,
    perImage,
    reasons,
  };
}
