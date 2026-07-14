/**
 * Image Intelligence Engine — version manifest.
 *
 * REPRODUCIBILITY RULE (FoundOurMarket™)
 * ─────────────────────────────────────────────────────────────────────────
 * Every generated asset MUST be reproducible. Given:
 *   - the original image
 *   - the engine version manifest below
 *   - the category rules snapshot
 * the pipeline MUST produce the same optimized image. No randomness,
 * no hidden state, no nondeterministic outputs.
 *
 * Bump the relevant version whenever behaviour changes:
 *   ENGINE_VERSION            — any change to the overall pipeline shape
 *   PHOTON_RUNTIME_VERSION    — bump @cf-wasm/photon or swap WASM engine
 *   QUALITY_GATE_VERSION      — any change to gate thresholds / checks
 *   CATEGORY_RULES_VERSION    — any change to CATEGORY_FRAMING targets
 *
 * These stamps are written onto every image_intelligence_jobs row and
 * onto product_images.<version fields> when an optimized derivative is
 * applied. That enables selective reprocessing of assets produced by
 * older algorithm versions without re-running the whole catalog.
 */

export const ENGINE_VERSION = "3.0.0";
export const PHOTON_RUNTIME_VERSION = "0.3.6"; // matches @cf-wasm/photon
export const QUALITY_GATE_VERSION = "1.0.0";
export const CATEGORY_RULES_VERSION = "2.0.0";

export const ENGINE_VERSION_MANIFEST = {
  engine_version: ENGINE_VERSION,
  photon_version: PHOTON_RUNTIME_VERSION,
  quality_gate_version: QUALITY_GATE_VERSION,
  category_rules_version: CATEGORY_RULES_VERSION,
} as const;

export type EngineVersionManifest = typeof ENGINE_VERSION_MANIFEST;
