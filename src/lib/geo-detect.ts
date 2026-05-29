import type { MarketRegion, EdgeGeo } from "./region.functions";

/**
 * Client-side detection layers (timezone, locale, device) combined with the
 * edge geo-IP result into a single confidence score. This never grants access
 * or pricing on its own — it only decides whether we can silently auto-assign
 * a region or must fall back to the "Choose your market" modal.
 */

export type DetectionResult = {
  region: MarketRegion;
  /** 0–100 blended confidence across all available layers. */
  confidence: number;
  /** Conflicting signals across layers (timezone vs locale vs IP). */
  conflicting: boolean;
  /** VPN / proxy / datacenter suspicion carried from the edge layer. */
  vpnSuspected: boolean;
  countryCode: string | null;
};

// Confidence at/above this means we auto-assign silently — no popup.
export const CONFIDENCE_THRESHOLD = 70;

function indiaSignalsFromBrowser(): { tzIndia: boolean; localeIndia: boolean } {
  if (typeof window === "undefined") {
    return { tzIndia: false, localeIndia: false };
  }
  let tzIndia = false;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    tzIndia = tz === "Asia/Kolkata";
  } catch {
    /* ignore */
  }

  const langs = [
    navigator.language,
    ...(navigator.languages || []),
  ]
    .filter(Boolean)
    .map((l) => l.toLowerCase());
  const localeIndia = langs.some(
    (l) => l.endsWith("-in") || l.startsWith("hi") || l.startsWith("ta") ||
      l.startsWith("ml") || l.startsWith("te") || l.startsWith("kn") ||
      l.startsWith("bn") || l.startsWith("mr") || l.startsWith("gu"),
  );

  return { tzIndia, localeIndia };
}

/**
 * Blend the edge geo result (Layer 1) with browser timezone (Layer 2) and
 * device locale (Layer 3). Each layer votes; agreement raises confidence,
 * disagreement lowers it and flags the session as conflicting.
 */
export function blendDetection(edge: EdgeGeo): DetectionResult {
  const { tzIndia, localeIndia } = indiaSignalsFromBrowser();

  // Each layer casts a weighted vote for "india".
  const votes: { india: boolean; weight: number }[] = [];
  // Layer 1 — edge geo-IP (strongest when a country header exists).
  votes.push({
    india: edge.suggested === "india",
    weight: edge.countryCode ? 0.55 : 0.2,
  });
  // Layer 2 — browser timezone.
  votes.push({ india: tzIndia, weight: 0.25 });
  // Layer 3 — device locale.
  votes.push({ india: localeIndia, weight: 0.2 });

  const totalWeight = votes.reduce((s, v) => s + v.weight, 0);
  const indiaScore = votes.reduce((s, v) => s + (v.india ? v.weight : 0), 0);
  const indiaRatio = indiaScore / totalWeight;

  const region: MarketRegion = indiaRatio >= 0.5 ? "india" : "international";

  // Agreement strength → confidence. 0.5 (split) = low, 0/1 (unanimous) = high.
  const agreement = Math.abs(indiaRatio - 0.5) * 2; // 0..1
  let confidence = Math.round(agreement * 100);

  // Blend in the edge layer's own confidence when it agrees with the verdict.
  if ((region === "india") === (edge.suggested === "india")) {
    confidence = Math.round(confidence * 0.5 + edge.edgeConfidence * 0.5);
  }

  // Detect cross-layer conflict (e.g. IP says US but timezone+locale say India).
  const indiaVotes = [edge.suggested === "india", tzIndia, localeIndia];
  const yes = indiaVotes.filter(Boolean).length;
  const conflicting = yes !== 0 && yes !== indiaVotes.length;

  if (conflicting) confidence = Math.min(confidence, 55);
  if (edge.vpnSuspected) confidence = Math.min(confidence, 30);

  return {
    region,
    confidence: Math.max(0, Math.min(100, confidence)),
    conflicting,
    vpnSuspected: edge.vpnSuspected,
    countryCode: edge.countryCode,
  };
}
