/**
 * Fuzzy text similarity primitives for duplicate detection.
 * Pure, deterministic. Combines token-set overlap (word reordering / extra
 * marketing words) with Levenshtein ratio (typos / minor edits).
 */
import { tokenize, normalizeText } from "./normalize";

/** Levenshtein edit distance (bounded, iterative). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** Levenshtein similarity in [0,1] — 1 = identical. */
export function levenshteinRatio(a: string, b: string): number {
  const s1 = normalizeText(a).replace(/\s+/g, "");
  const s2 = normalizeText(b).replace(/\s+/g, "");
  if (!s1 && !s2) return 1;
  if (!s1 || !s2) return 0;
  const dist = levenshtein(s1, s2);
  return 1 - dist / Math.max(s1.length, s2.length);
}

/** Jaccard token-set overlap in [0,1]. */
export function tokenSetRatio(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (!ta.size && !tb.size) return 1;
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return inter / union;
}

/**
 * Blended fuzzy title similarity: the stronger of token-set overlap and
 * character-level ratio, so both "reordered words" and "typo'd string" score
 * high. Weighted toward token-set (word identity matters most for products).
 */
export function titleSimilarity(a: string, b: string): number {
  const tok = tokenSetRatio(a, b);
  const lev = levenshteinRatio(a, b);
  return Math.max(tok, tok * 0.6 + lev * 0.4);
}

/** Simple keyword overlap over de-duplicated meaningful tokens. */
export function keywordSimilarity(a: string, b: string): number {
  return tokenSetRatio(a, b);
}
