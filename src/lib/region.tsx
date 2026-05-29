import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "./auth";
import { detectRegion, getMyRegion, lockMarketRegion } from "./region.functions";
import type { MarketRegion } from "./region.functions";
import type { Product } from "./products";

export type { MarketRegion };
export type Currency = "INR" | "USD";

type Ctx = {
  /** Effective region for display (suggested for guests, locked for users). */
  market: MarketRegion;
  currency: Currency;
  symbol: string;
  /** True once the signed-in user has a permanently assigned region. */
  locked: boolean;
  /** True when a signed-in user must still pick a region (drives the modal). */
  needsSelection: boolean;
  loading: boolean;
  countryCode: string | null;
  /** Write-once region lock for the signed-in user. */
  lockMarket: (region: MarketRegion) => Promise<void>;
  /** Region price for a product (no currency conversion — admin-defined). */
  priceOf: (p: Product) => number;
  /** Region compare-at / strike-through price, or null. */
  compareOf: (p: Product) => number | null;
  /** Format a region-native amount with the correct symbol (no conversion). */
  format: (amount: number) => string;
  /** Convenience: formatted region price for a product. */
  formatProduct: (p: Product) => string;
};

const RegionContext = createContext<Ctx | null>(null);
const LS_KEY = "market_region";

function formatMoney(amount: number, currency: Currency): string {
  if (currency === "INR") return `₹${Math.round(amount).toLocaleString("en-IN")}`;
  return `$${amount.toFixed(2)}`;
}

export function RegionProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const detect = useServerFn(detectRegion);
  const fetchMine = useServerFn(getMyRegion);
  const lockFn = useServerFn(lockMarketRegion);

  // For guests / pre-selection we keep a suggested region so prices render.
  const [market, setMarket] = useState<MarketRegion>("international");
  const [locked, setLocked] = useState(false);
  const [needsSelection, setNeedsSelection] = useState(false);
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Read any cached suggestion immediately (avoids flash on reload).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const cached = localStorage.getItem(LS_KEY) as MarketRegion | null;
    if (cached === "india" || cached === "international") setMarket(cached);
  }, []);

  // Resolve the authoritative region whenever auth state settles.
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        if (user) {
          const mine = await fetchMine();
          if (cancelled) return;
          if (mine.region) {
            setMarket(mine.region);
            setLocked(true);
            setNeedsSelection(false);
            setCountryCode(mine.countryCode);
            if (typeof window !== "undefined") localStorage.setItem(LS_KEY, mine.region);
          } else {
            // Logged in but no region yet → must choose.
            setLocked(false);
            setNeedsSelection(true);
            try {
              const d = await detect();
              if (!cancelled) {
                setMarket(d.suggested);
                setCountryCode(d.countryCode);
              }
            } catch {
              /* keep cached/default suggestion */
            }
          }
        } else {
          // Guest: suggest a region for display, never lock.
          setLocked(false);
          setNeedsSelection(false);
          const hasCache =
            typeof window !== "undefined" && localStorage.getItem(LS_KEY);
          if (!hasCache) {
            try {
              const d = await detect();
              if (!cancelled) {
                setMarket(d.suggested);
                setCountryCode(d.countryCode);
              }
            } catch {
              /* default international */
            }
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading, fetchMine, detect]);

  const lockMarket = useCallback(
    async (region: MarketRegion) => {
      const res = await lockFn({ data: { region, countryCode } });
      setMarket(res.region);
      setLocked(true);
      setNeedsSelection(false);
      if (typeof window !== "undefined") localStorage.setItem(LS_KEY, res.region);
    },
    [lockFn, countryCode],
  );

  const currency: Currency = market === "india" ? "INR" : "USD";
  const symbol = currency === "INR" ? "₹" : "$";
  const USD_TO_INR = 83; // fallback only, for legacy rows missing region prices

  const priceOf = useCallback(
    (p: Product) => {
      if (market === "india") {
        return p.priceInr ?? Math.round((p.price ?? 0) * USD_TO_INR);
      }
      return p.priceUsd ?? p.price ?? 0;
    },
    [market],
  );

  const compareOf = useCallback(
    (p: Product) => {
      if (market === "india") return p.comparePriceInr ?? null;
      return p.comparePriceUsd ?? null;
    },
    [market],
  );

  const format = useCallback((amount: number) => formatMoney(amount, currency), [currency]);
  const formatProduct = useCallback(
    (p: Product) => formatMoney(priceOf(p), currency),
    [priceOf, currency],
  );

  return (
    <RegionContext.Provider
      value={{
        market,
        currency,
        symbol,
        locked,
        needsSelection,
        loading,
        countryCode,
        lockMarket,
        priceOf,
        compareOf,
        format,
        formatProduct,
      }}
    >
      {children}
    </RegionContext.Provider>
  );
}

export function useRegion() {
  const ctx = useContext(RegionContext);
  if (!ctx) throw new Error("useRegion must be inside RegionProvider");
  return ctx;
}
