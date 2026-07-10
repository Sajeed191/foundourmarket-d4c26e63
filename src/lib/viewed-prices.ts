// Lightweight, client-side snapshot of the selling price a user last SAW for a
// product. Used only to detect real price changes on the Continue Shopping page.
//
// This is deliberately localStorage-based and free of any network calls:
// - It is written once per product view (from the product page).
// - It is read synchronously on Continue Shopping and compared, O(n), against
//   the already-loaded current product price.
//
// The snapshot is region-aware: a viewed price is only meaningful when compared
// within the same market, so we key by market and ignore mismatches.

const KEY = "fom_viewed_prices";

export type ViewedPrice = { price: number; market: string; at: number };

type Store = Record<string, ViewedPrice>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

function write(store: Store) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* storage full or disabled */
  }
}

/**
 * Record the price a user just saw for a product. Only the FIRST snapshot per
 * product is kept as the "viewed price" baseline until a change is observed —
 * we intentionally do NOT overwrite it on every re-view, otherwise the baseline
 * would always equal the current price and no change could ever be detected.
 */
export function recordViewedPrice(slug: string, price: number, market: string) {
  if (!slug || !Number.isFinite(price) || price <= 0) return;
  const store = read();
  const existing = store[slug];
  // Keep the earliest baseline for this market; refresh only if market changed
  // or nothing is stored yet.
  if (!existing || existing.market !== market) {
    store[slug] = { price, market, at: Date.now() };
    write(store);
  }
}

/** All viewed-price snapshots. */
export function getViewedPrices(): Store {
  return read();
}

export type PriceChange = "drop" | "increase" | "same" | "unknown";

/**
 * Compare a stored viewed price with the current price. Returns "unknown" when
 * there is no valid baseline (never viewed before, or a different market).
 */
export function comparePrice(
  snapshot: ViewedPrice | undefined,
  currentPrice: number,
  market: string,
): { change: PriceChange; savings: number; percent: number } {
  if (!snapshot || snapshot.market !== market || !Number.isFinite(snapshot.price) || snapshot.price <= 0) {
    return { change: "unknown", savings: 0, percent: 0 };
  }
  const diff = snapshot.price - currentPrice;
  if (Math.abs(diff) < 0.5) return { change: "same", savings: 0, percent: 0 };
  const percent = Math.round((Math.abs(diff) / snapshot.price) * 100);
  if (diff > 0) return { change: "drop", savings: diff, percent };
  return { change: "increase", savings: 0, percent };
}
