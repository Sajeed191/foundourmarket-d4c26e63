/**
 * Duplicate Detection — public surface.
 *
 * A dedicated intelligence module inside the Marketplace Intelligence platform.
 * Deterministic, explainable duplicate scoring across title, brand, category,
 * barcode, SKU, image (perceptual hash), specs, attributes, description, price
 * and keyword signals — with an admin ignore/learning loop. Never blocks.
 */
export * from "./types";
export { scoreDuplicate, uniqueBadges } from "./engine";
export { toImageIntelSummary } from "./image-intel";
export {
  normalizeText,
  tokenize,
  titleFingerprint,
  normalizeCode,
  normalizeSku,
} from "./normalize";
export { titleSimilarity, keywordSimilarity, levenshtein } from "./text-similarity";
export { computeImagePhash, imageSimilarity } from "./image-hash";
export {
  loadDetectionIndex,
  invalidateDetectionIndex,
  selectCandidates,
} from "./candidates";
export {
  logDuplicateEvent,
  loadLearning,
  draftSignature,
  pairKey,
} from "./events";
export type { DupAction, LearningMap } from "./events";
