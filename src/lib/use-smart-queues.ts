/**
 * useSmartQueues — Marketplace Operations 1.0 data hook.
 *
 * Thin memoised wrapper around useMarketplaceHealth. Introduces no new
 * intelligence, only queue aggregation.
 */
import { useMemo } from "react";
import { useMarketplaceHealth, type MarketplaceHealthBundle } from "./use-marketplace-health";
import { buildSmartQueues, type SmartQueues } from "./marketplace-operations";

export type SmartQueuesBundle = {
  queues: SmartQueues | null;
  bundle: MarketplaceHealthBundle;
  loading: boolean;
};

export function useSmartQueues(): SmartQueuesBundle {
  const bundle = useMarketplaceHealth();
  const queues = useMemo<SmartQueues | null>(() => {
    if (bundle.loading || bundle.listings.length === 0) return null;
    return buildSmartQueues(bundle.listings);
  }, [bundle.loading, bundle.listings]);

  return { queues, bundle, loading: bundle.loading };
}
