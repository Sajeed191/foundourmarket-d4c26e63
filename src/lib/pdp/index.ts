/**
 * PDP — Track A · Phase 3.1 public surface.
 *
 * Composition layer over the frozen RelationshipIntelligence contract.
 * PDP routes and components import ONLY from this entry point.
 */
export {
  buildRelationshipPresentation,
  pickSection,
} from "./relationship-presentation-adapter";
export type {
  ProductRelationshipPresentation,
  ProductRelationshipSection,
  ProductSummary,
  ProductResolver,
  RelationshipAdapterInput,
} from "./relationship-presentation-adapter";
