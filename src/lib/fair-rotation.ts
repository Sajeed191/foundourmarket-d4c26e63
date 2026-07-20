/**
 * Fair paged rotation — every eligible product cycles through a homepage
 * section before any repeats. Given N items and a display limit L, the queue
 * is sliced into ceil(N/L) pages; the current rotation window picks page
 * `windowIndex % pageCount`. The queue itself is deterministically shuffled
 * once per day so admins can't game the order, and every rotation window
 * shows a contiguous fresh slice.
 *
 * Same inputs always produce the same output — safe for SSR and identical
 * across every visitor on the same rotation window.
 */
import { dayWindowSeed, hashString, seededShuffle } from "./rotation-windows";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Seed for the current N-hour rotation window (IST-aligned). */
export function rotationWindowSeed(nowMs: number, hours: number): number {
  const h = Math.max(1, Math.min(24, Math.floor(hours || 1)));
  const ist = new Date(nowMs + IST_OFFSET_MS);
  const slot = Math.floor(ist.getUTCHours() / h) * h;
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), slot, 0, 0, 0);
}

/** Zero-based index of the current rotation window inside the current IST day. */
export function rotationWindowIndex(nowMs: number, hours: number): number {
  const h = Math.max(1, Math.min(24, Math.floor(hours || 1)));
  const ist = new Date(nowMs + IST_OFFSET_MS);
  return Math.floor(ist.getUTCHours() / h);
}

/**
 * Picks a contiguous slice of `limit` products from the queue, wrapping around
 * so the tail joins the head. Guarantees every product appears before repeats.
 *
 * @param items    All eligible products for the section.
 * @param limit    Max number of products to display in this window.
 * @param nowMs    Current time in ms.
 * @param hours    Rotation interval in hours (1/2/4/6/12/24).
 * @param nonce    Manual reshuffle nonce (bumps re-randomize instantly).
 * @param key      Section key — mixed into the seed so different sections
 *                 shuffle independently.
 */
export function fairPagedSlice<T>(
  items: T[],
  limit: number,
  nowMs: number,
  hours: number,
  nonce: number,
  key: string,
): T[] {
  const n = items.length;
  if (n === 0) return [];
  const cap = Math.max(1, Math.floor(limit));
  if (n <= cap) return items.slice();

  // Deterministic daily shuffle keyed per section so Trending / Best Sellers
  // don't pick from the same offset.
  const daySeed = dayWindowSeed(nowMs) ^ hashString(key) ^ (nonce >>> 0);
  const queue = seededShuffle(items.slice(), daySeed);

  const windowIdx = rotationWindowIndex(nowMs, hours) + (nonce & 0xff);
  const pageCount = Math.ceil(n / cap);
  const page = ((windowIdx % pageCount) + pageCount) % pageCount;
  const start = page * cap;
  const end = start + cap;
  if (end <= n) return queue.slice(start, end);
  // Wrap around so the last page stays full instead of tapering.
  return queue.slice(start).concat(queue.slice(0, end - n));
}
