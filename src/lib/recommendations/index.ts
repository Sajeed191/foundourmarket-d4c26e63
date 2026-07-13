/**
 * Marketplace Intelligence — centralized recommendation engine.
 *
 * Public surface: import the provider + `useRecommendationRail` from here.
 * Every discovery surface consumes this one engine so scoring is never
 * scattered across components, and every recommendation carries a score,
 * confidence and reason.
 */
export { runEngine, runEngineProducts } from "./engine";
export {
  RecommendationProvider,
  useRecommendationSignals,
  useRecommendationRail,
} from "./context";
export { buildAffinity, scoreProduct, isFresh } from "./scorer";
export { diversify } from "./diversity";
export type {
  RecommendationItem,
  RecommendationSignals,
  RecommendationSource,
  StrategyKey,
  EngineConfig,
  RecommendationBoosts,
  LocationSignal,
} from "./types";
