/**
 * Browse — Track A · Phase 2.1 public surface.
 *
 * Composition layer over frozen intelligence contracts. Consumers (browse
 * routes, rails, search results) import ONLY from this entry point.
 */
export {
  buildBrowsePresentation,
  sortProductsForBrowse,
  defaultFiltersFor,
} from "./presentation-adapter";
export type {
  BrowsePresentation,
  BrowseBadge,
  BrowseSection,
  BrowseSortOption,
  BrowseAdapterInput,
  BrowseFilterDefaults,
} from "./presentation-adapter";
