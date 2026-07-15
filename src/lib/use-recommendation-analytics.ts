/**
 * useRecommendationAnalytics — Recommendation Analytics v1.0 data hook.
 *
 * Consumes useMarketplaceHealth (public bundle) plus a persisted
 * recommendation-history log to compute the RecommendationAnalytics contract.
 *
 * Introduces NO new intelligence: it only aggregates lifecycle events that
 * Marketplace Health has already surfaced. The history is stored in
 * localStorage and updated on each hook run.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMarketplaceHealth, type MarketplaceHealthBundle } from "./use-marketplace-health";
import {
  buildRecommendationAnalytics,
  emptyRecommendationHistory,
  updateRecommendationHistory,
  type RecommendationAnalytics,
  type RecommendationHistory,
} from "@/lib/marketplace-intelligence";

const HISTORY_KEY = "fom.recommendation-analytics.history.v1";

function loadHistory(): RecommendationHistory {
  if (typeof window === "undefined") return emptyRecommendationHistory();
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return emptyRecommendationHistory();
    const parsed = JSON.parse(raw) as RecommendationHistory;
    if (!parsed || typeof parsed !== "object" || !parsed.entries) {
      return emptyRecommendationHistory();
    }
    return parsed;
  } catch {
    return emptyRecommendationHistory();
  }
}

function saveHistory(next: RecommendationHistory) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota errors */
  }
}

export type RecommendationAnalyticsBundle = {
  analytics: RecommendationAnalytics | null;
  bundle: MarketplaceHealthBundle;
  history: RecommendationHistory;
  loading: boolean;
  resetHistory: () => void;
};

export function useRecommendationAnalytics(): RecommendationAnalyticsBundle {
  const bundle = useMarketplaceHealth();
  const historyRef = useRef<RecommendationHistory | null>(null);
  const [historyTick, setHistoryTick] = useState(0);

  if (historyRef.current === null) historyRef.current = loadHistory();

  // Update history whenever the health lifecycle changes.
  useEffect(() => {
    if (!bundle.health) return;
    const current = bundle.health.lifecycle;
    const updated = updateRecommendationHistory(historyRef.current!, current);
    historyRef.current = updated;
    saveHistory(updated);
    setHistoryTick((t) => t + 1);
  }, [bundle.health]);

  const analytics = useMemo<RecommendationAnalytics | null>(() => {
    if (!bundle.health) return null;
    return buildRecommendationAnalytics({
      lifecycle: bundle.health.lifecycle,
      optimization: bundle.optimization,
      vendors: bundle.vendors,
      history: historyRef.current!,
    });
    // historyTick is included so recomputes track the persisted history update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle.health, bundle.optimization, bundle.vendors, historyTick]);

  return {
    analytics,
    bundle,
    history: historyRef.current!,
    loading: bundle.loading,
    resetHistory: () => {
      const fresh = emptyRecommendationHistory();
      historyRef.current = fresh;
      saveHistory(fresh);
      setHistoryTick((t) => t + 1);
    },
  };
}
