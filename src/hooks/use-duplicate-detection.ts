/**
 * useDuplicateDetection — live, debounced duplicate intelligence for the
 * admin product editor. Never blocks typing: it debounces, prefilters against
 * a cached index, scores candidates with the explainable engine, and folds in
 * the admin learning loop (ignored pairs are suppressed).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadDetectionIndex,
  selectCandidates,
  scoreDuplicate,
  computeImagePhash,
  loadLearning,
  draftSignature,
  pairKey,
  type DraftProduct,
  type DupMatch,
  type DupResult,
  type LearningMap,
} from "@/lib/duplicate-detection";

const DEBOUNCE_MS = 350;
const MAX_MATCHES = 12;
const MIN_SCORE = 25; // below this we treat as "safe" and hide

export function useDuplicateDetection(draft: DraftProduct, enabled = true): DupResult {
  const [result, setResult] = useState<DupResult>({
    topScore: 0,
    topVerdict: "safe",
    matches: [],
    loading: false,
  });

  // Perceptual hash cache keyed by image URL so we hash each image once.
  const phashCache = useRef<Map<string, string | null>>(new Map());
  const [imagePhash, setImagePhash] = useState<string | null>(draft.imagePhash ?? null);

  // Compute the draft image fingerprint when the image changes.
  useEffect(() => {
    const src = draft.image;
    if (!src) {
      setImagePhash(null);
      return;
    }
    if (draft.imagePhash) {
      setImagePhash(draft.imagePhash);
      return;
    }
    if (phashCache.current.has(src)) {
      setImagePhash(phashCache.current.get(src) ?? null);
      return;
    }
    let cancelled = false;
    computeImagePhash(src).then((fp) => {
      phashCache.current.set(src, fp);
      if (!cancelled) setImagePhash(fp);
    });
    return () => {
      cancelled = true;
    };
  }, [draft.image, draft.imagePhash]);

  // Stable key of the fields that actually affect scoring.
  const draftKey = useMemo(
    () =>
      JSON.stringify({
        n: draft.name,
        b: draft.brand,
        c: draft.category,
        cs: draft.categories,
        bc: draft.barcode,
        s: draft.sku,
        d: draft.description,
        sp: draft.specifications,
        at: draft.attributes,
        pi: draft.priceInr,
        pu: draft.priceUsd,
        vk: draft.variantKeys,
        ph: imagePhash,
        sl: draft.slug,
      }),
    [draft, imagePhash],
  );

  useEffect(() => {
    if (!enabled) {
      setResult((r) => ({ ...r, matches: [], topScore: 0, topVerdict: "safe" }));
      return;
    }
    const name = (draft.name ?? "").trim();
    // Need at least a title or a barcode to say anything meaningful.
    if (name.length < 3 && !draft.barcode) {
      setResult({ topScore: 0, topVerdict: "safe", matches: [], loading: false });
      return;
    }

    let cancelled = false;
    setResult((r) => ({ ...r, loading: true }));
    const timer = setTimeout(async () => {
      const effectiveDraft: DraftProduct = { ...draft, imagePhash };
      const sig = draftSignature(effectiveDraft);
      const [index, learning] = await Promise.all([
        loadDetectionIndex().catch(() => [] as never[]),
        loadLearning(sig).catch<LearningMap>(() => ({ boosts: new Map(), ignored: new Set() })),
      ]);
      if (cancelled) return;

      const candidates = selectCandidates(effectiveDraft, index);
      const matches: DupMatch[] = [];
      for (const c of candidates) {
        const key = pairKey(sig, c.slug);
        const boost = learning.boosts.get(key) ?? 0;
        const m = scoreDuplicate(effectiveDraft, c, { historyBoost: boost });
        m.ignored = learning.ignored.has(key);
        if (m.score >= MIN_SCORE) matches.push(m);
      }
      matches.sort((a, b) => b.score - a.score);
      const visible = matches.filter((m) => !m.ignored).slice(0, MAX_MATCHES);
      const top = visible[0];
      if (cancelled) return;
      setResult({
        topScore: top?.score ?? 0,
        topVerdict: top?.verdict ?? "safe",
        matches: matches.slice(0, MAX_MATCHES),
        loading: false,
      });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draftKey, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return result;
}

/** Imperatively refresh a single draft's detection (post-action). */
export function useDetectionRefresher() {
  return useCallback(() => {
    // index invalidation lives in the events flow; this is a placeholder hook
    // for symmetry with other admin refreshers.
  }, []);
}
