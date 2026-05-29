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
import { useIsAdmin } from "./use-admin";
import { detectRegion, getMyRegion, lockMarketRegion } from "./region.functions";
import type { MarketRegion } from "./region.functions";
import { blendDetection, CONFIDENCE_THRESHOLD } from "./geo-detect";
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
  /** True when the market was resolved silently from geo-intelligence. */
  autoDetected: boolean;
  /** Blended detection confidence (0–100) across edge/timezone/locale layers. */
  confidence: number;
  /** VPN / proxy / datacenter suspicion — forces manual confirmation. */
  vpnSuspected: boolean;
  /** True when a user/guest must still pick a region (drives the modal). */
  needsSelection: boolean;
  loading: boolean;
  countryCode: string | null;
  /** Staff accounts bypass the region lock and can view both markets. */
  isAdmin: boolean;
  /** Admin-only: temporarily preview a market without locking. */
  setPreviewMarket: (region: MarketRegion) => void;
  /** Persist a region: locks server-side for users, caches for guests. */
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
// Set only when a guest *explicitly* picks a market (inherited on login).
const GUEST_CHOICE_KEY = "market_region_chosen";
// Set once the market selector has been shown — guarantees one prompt/device.
const PROMPT_SEEN_KEY = "market_region_prompt_seen";

/** True if the region selector has already been shown on this device. */
function promptAlreadySeen(): boolean {
  if (typeof document === "undefined") return false;
  if (localStorage.getItem(PROMPT_SEEN_KEY) === "1") return true;
  return document.cookie.includes(`${PROMPT_SEEN_KEY}=1`);
}

/** Persist the "seen" flag across both localStorage and a 1-year cookie. */
function markPromptSeen() {
  if (typeof document === "undefined") return;
  try {
    localStorage.setItem(PROMPT_SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
  document.cookie = `${PROMPT_SEEN_KEY}=1; path=/; max-age=31536000; samesite=lax`;
}

function formatMoney(amount: number, currency: Currency): string {
  if (currency === "INR") return `₹${Math.round(amount).toLocaleString("en-IN")}`;
  return `$${amount.toFixed(2)}`;
}

export function RegionProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin } = useIsAdmin();
  const detect = useServerFn(detectRegion);
  const fetchMine = useServerFn(getMyRegion);
  const lockFn = useServerFn(lockMarketRegion);

  // For guests / pre-selection we keep a suggested region so prices render.
  const [market, setMarket] = useState<MarketRegion>("international");
  const [locked, setLocked] = useState(false);
  const [needsSelection, setNeedsSelection] = useState(false);
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [autoDetected, setAutoDetected] = useState(false);
  const [confidence, setConfidence] = useState(0);
  const [vpnSuspected, setVpnSuspected] = useState(false);
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

    /** Layers 1–3: edge geo-IP blended with browser timezone + locale. */
    async function runDetection() {
      const edge = await detect();
      const result = blendDetection(edge);
      if (!cancelled) {
        setCountryCode(result.countryCode);
        setConfidence(result.confidence);
        setVpnSuspected(result.vpnSuspected);
      }
      return result;
    }

    (async () => {
      setLoading(true);
      try {
        if (user) {
          // Staff/admin accounts are exempt from the region lock entirely.
          if (isAdmin) {
            setLocked(false);
            setNeedsSelection(false);
            try {
              await runDetection();
            } catch {
              /* ignore */
            }
            return;
          }

          const mine = await fetchMine();
          if (cancelled) return;

          if (mine.region) {
            // Already locked → authoritative, instant.
            setMarket(mine.region);
            setLocked(true);
            setNeedsSelection(false);
            setAutoDetected(false);
            setCountryCode(mine.countryCode);
            if (typeof window !== "undefined") {
              localStorage.setItem(LS_KEY, mine.region);
            }
            return;
          }

          // Logged in, no region yet → inherit a pre-login guest choice,
          // else auto-lock when geo-intelligence is confident, else prompt.
          const guestChoice =
            typeof window !== "undefined"
              ? (localStorage.getItem(GUEST_CHOICE_KEY) as MarketRegion | null)
              : null;

          if (guestChoice === "india" || guestChoice === "international") {
            try {
              const res = await lockFn({
                data: { region: guestChoice, countryCode },
              });
              if (cancelled) return;
              setMarket(res.region);
              setLocked(true);
              setNeedsSelection(false);
              if (typeof window !== "undefined") {
                localStorage.setItem(LS_KEY, res.region);
                localStorage.removeItem(GUEST_CHOICE_KEY);
              }
              return;
            } catch {
              /* fall through to detection */
            }
          }

          const result = await runDetection().catch(() => null);
          if (cancelled) return;

          if (
            result &&
            !result.conflicting &&
            !result.vpnSuspected &&
            result.confidence >= CONFIDENCE_THRESHOLD
          ) {
            // High confidence → silently lock, no popup.
            try {
              const res = await lockFn({
                data: { region: result.region, countryCode: result.countryCode },
              });
              if (cancelled) return;
              setMarket(res.region);
              setLocked(true);
              setNeedsSelection(false);
              setAutoDetected(true);
              if (typeof window !== "undefined") {
                localStorage.setItem(LS_KEY, res.region);
              }
              return;
            } catch {
              /* fall through to manual */
            }
          }

          // Ambiguous / VPN / low confidence → require manual confirmation,
          // but only if we've never shown the selector on this device.
          if (result) setMarket(result.region);
          setLocked(false);
          if (promptAlreadySeen()) {
            setNeedsSelection(false);
          } else {
            markPromptSeen();
            setNeedsSelection(true);
          }
        } else {
          // Guest: silent auto-detect, only prompt when ambiguous.
          const guestChoice =
            typeof window !== "undefined"
              ? localStorage.getItem(GUEST_CHOICE_KEY)
              : null;

          if (guestChoice === "india" || guestChoice === "international") {
            setMarket(guestChoice);
            setLocked(false);
            setNeedsSelection(false);
            setAutoDetected(false);
            return;
          }

          const result = await runDetection().catch(() => null);
          if (cancelled) return;

          if (
            result &&
            !result.conflicting &&
            !result.vpnSuspected &&
            result.confidence >= CONFIDENCE_THRESHOLD
          ) {
            // Confident → render correct pricing instantly, no popup.
            setMarket(result.region);
            setAutoDetected(true);
            setNeedsSelection(false);
            if (typeof window !== "undefined") {
              localStorage.setItem(LS_KEY, result.region);
            }
          } else {
            // Ambiguous → let the guest choose their market.
            if (result) setMarket(result.region);
            setAutoDetected(false);
            setNeedsSelection(true);
          }
          setLocked(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading, isAdmin, fetchMine, detect, lockFn, countryCode]);

  const lockMarket = useCallback(
    async (region: MarketRegion) => {
      if (user) {
        const res = await lockFn({ data: { region, countryCode } });
        setMarket(res.region);
        setLocked(true);
        setNeedsSelection(false);
        if (typeof window !== "undefined") {
          localStorage.setItem(LS_KEY, res.region);
          localStorage.removeItem(GUEST_CHOICE_KEY);
        }
        return;
      }
      // Guest: persist the explicit choice so it's inherited on login.
      setMarket(region);
      setNeedsSelection(false);
      setAutoDetected(false);
      if (typeof window !== "undefined") {
        localStorage.setItem(LS_KEY, region);
        localStorage.setItem(GUEST_CHOICE_KEY, region);
      }
    },
    [user, lockFn, countryCode],
  );

  // Admin-only market preview (no lock, no persistence).
  const setPreviewMarket = useCallback((region: MarketRegion) => {
    setMarket(region);
  }, []);

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
        autoDetected,
        confidence,
        vpnSuspected,
        needsSelection,
        loading,
        countryCode,
        isAdmin,
        setPreviewMarket,
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
