import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "./auth";
import { useIsAdmin } from "./use-admin";
import { detectRegion, getMyRegion, lockMarketRegion } from "./region.functions";
import type { MarketRegion } from "./region.functions";
import { blendDetection } from "./geo-detect";
import type { DetectionTier } from "./geo-detect";
import { track } from "./analytics";
import type { Product } from "./products";
import { computeShipping } from "./pricing";


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
  /** Blended detection confidence (0–100) across all signal layers. */
  confidence: number;
  /** Human-readable signals that drove the detected region. */
  reasons: string[];
  /** UX tier the engine resolved to: auto | confirm | pick. */
  detectionTier: DetectionTier | null;
  /** VPN / proxy / datacenter suspicion — forces manual confirmation. */
  vpnSuspected: boolean;
  /** True when a user/guest must still pick a region (drives the full modal). */
  needsSelection: boolean;
  /** True when a lightweight one-tap confirmation should be shown (70–89). */
  softConfirm: boolean;
  /** Accept the detected region from the lightweight confirmation. */
  confirmDetectedRegion: () => Promise<void>;
  /** Dismiss the lightweight confirmation and open the full picker instead. */
  rejectDetectedRegion: () => void;
  loading: boolean;
  /**
   * True once the active currency is trustworthy and safe to paint. Stays false
   * during SSR / first client render and while a first-time visitor's region is
   * still being detected, so pricing renders a skeleton instead of flashing USD.
   */
  currencyReady: boolean;
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
  /** Admin-defined per-product shipping fee in the active region's currency. */
  shippingFeeOf: (p: Product) => number;
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

// 1-year region-lock cookie, mirrored in localStorage.
const REGION_COOKIE = "region_lock";

/** Persist the resolved region to both a 1-year cookie and localStorage. */
function persistRegion(region: MarketRegion) {
  if (typeof document === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, region);
  } catch {
    /* ignore */
  }
  document.cookie = `${REGION_COOKIE}=${region}; path=/; max-age=31536000; samesite=lax`;
}

/** Read any previously-stored region choice (cookie first, then localStorage). */
function getPreviousChoice(): MarketRegion | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`${REGION_COOKIE}=(india|international)`));
  if (m) return m[1] as MarketRegion;
  try {
    const stored = localStorage.getItem(GUEST_CHOICE_KEY) || localStorage.getItem(LS_KEY);
    if (stored === "india" || stored === "international") return stored;
  } catch {
    /* ignore */
  }
  return null;
}


export function RegionProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin } = useIsAdmin();
  const detect = useServerFn(detectRegion);
  const fetchMine = useServerFn(getMyRegion);
  const lockFn = useServerFn(lockMarketRegion);

  // For guests / pre-selection we keep a suggested region so prices render.
  // Lazily seed from any previously-stored choice so returning shoppers paint
  // their correct currency on the very first frame instead of flashing USD.
  const [market, setMarket] = useState<MarketRegion>(
    () => getPreviousChoice() ?? "international",
  );
  // True when we already had a trustworthy region cached before any async work.
  const hadCachedChoice = useRef(getPreviousChoice() !== null);
  // Avoid SSR/client hydration mismatches: only trust the client region post-mount.
  const [mounted, setMounted] = useState(false);
  const [locked, setLocked] = useState(false);
  const [needsSelection, setNeedsSelection] = useState(false);
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [autoDetected, setAutoDetected] = useState(false);
  const [confidence, setConfidence] = useState(0);
  const [reasons, setReasons] = useState<string[]>([]);
  const [detectionTier, setDetectionTier] = useState<DetectionTier | null>(null);
  const [softConfirm, setSoftConfirm] = useState(false);
  const [vpnSuspected, setVpnSuspected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

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

    /** Multi-signal engine: edge geo-IP blended with browser + stored signals. */
    async function runDetection() {
      const edge = await detect();
      const result = blendDetection(edge, getPreviousChoice());
      if (!cancelled) {
        setCountryCode(result.countryCode);
        setConfidence(result.confidence);
        setReasons(result.reasons);
        setDetectionTier(result.tier);
        setVpnSuspected(result.vpnSuspected);
      }
      // Fire-and-forget analytics for the Region Intelligence Center.
      void track("region_detected", {
        value: result.confidence,
        metadata: {
          region: result.region,
          confidence: result.confidence,
          tier: result.tier,
          source: edge.countryCode ? "geo-ip+signals" : "signals",
          countryCode: result.countryCode,
          vpnSuspected: result.vpnSuspected,
          conflicting: result.conflicting,
          reasons: result.reasons,
          loggedIn: !!user,
        },
      });
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

          if (result && result.tier === "auto") {
            // Very high confidence (>=90) → silently lock, no popup.
            try {
              const res = await lockFn({
                data: { region: result.region, countryCode: result.countryCode },
              });
              if (cancelled) return;
              setMarket(res.region);
              setLocked(true);
              setNeedsSelection(false);
              setSoftConfirm(false);
              setAutoDetected(true);
              persistRegion(res.region);
              return;
            } catch {
              /* fall through to manual */
            }
          }

          // 70–89 → lightweight confirmation; <70 / VPN → full picker.
          if (result) setMarket(result.region);
          setLocked(false);
          if (promptAlreadySeen()) {
            setNeedsSelection(false);
            setSoftConfirm(false);
          } else {
            markPromptSeen();
            if (result && result.tier === "confirm") {
              setSoftConfirm(true);
              setNeedsSelection(false);
            } else {
              setSoftConfirm(false);
              setNeedsSelection(true);
            }
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

          if (result && result.tier === "auto") {
            // >=90 confidence → render correct pricing instantly, no popup.
            setMarket(result.region);
            setAutoDetected(true);
            setNeedsSelection(false);
            setSoftConfirm(false);
            persistRegion(result.region);
          } else {
            if (result) setMarket(result.region);
            setAutoDetected(false);
            if (promptAlreadySeen()) {
              setNeedsSelection(false);
              setSoftConfirm(false);
            } else {
              markPromptSeen();
              if (result && result.tier === "confirm") {
                // 70–89 → lightweight one-tap confirmation.
                setSoftConfirm(true);
                setNeedsSelection(false);
              } else {
                // <70 / VPN → full picker before pricing is trusted.
                setSoftConfirm(false);
                setNeedsSelection(true);
              }
            }
          }
          setLocked(false);
        }

      } catch {
        // Auth/session not ready or detection failed — fall back to a safe
        // guest state instead of crashing the whole app.
        if (!cancelled) {
          setLocked(false);
          setNeedsSelection(false);
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
      void track("region_locked", {
        metadata: { region, source: "manual", confidence },
      });
      if (user) {
        const res = await lockFn({ data: { region, countryCode } });
        setMarket(res.region);
        setLocked(true);
        setNeedsSelection(false);
        setSoftConfirm(false);
        persistRegion(res.region);
        if (typeof window !== "undefined") localStorage.removeItem(GUEST_CHOICE_KEY);
        return;
      }
      // Guest: persist the explicit choice so it's inherited on login.
      setMarket(region);
      setNeedsSelection(false);
      setSoftConfirm(false);
      setAutoDetected(false);
      persistRegion(region);
      if (typeof window !== "undefined") localStorage.setItem(GUEST_CHOICE_KEY, region);
    },
    [user, lockFn, countryCode, confidence],
  );

  // Accept the detected region from the lightweight (70–89) confirmation.
  const confirmDetectedRegion = useCallback(async () => {
    void track("region_confirmed", {
      metadata: { region: market, confidence, source: "soft-confirm" },
    });
    await lockMarket(market);
  }, [lockMarket, market, confidence]);

  // Reject the lightweight confirmation → escalate to the full picker.
  const rejectDetectedRegion = useCallback(() => {
    void track("region_override", { metadata: { from: market, confidence } });
    setSoftConfirm(false);
    setNeedsSelection(true);
  }, [market, confidence]);

  // Admin-only market preview (no lock, no persistence).
  const setPreviewMarket = useCallback((region: MarketRegion) => {
    setMarket(region);
  }, []);


  const currency: Currency = market === "india" ? "INR" : "USD";
  const symbol = currency === "INR" ? "₹" : "$";
  // Currency is safe to paint once mounted AND either we had a cached region
  // from the first frame or async detection/lock has settled. Admins (who can
  // freely switch markets) are always ready.
  const currencyReady = mounted && (hadCachedChoice.current || isAdmin || !loading);

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

  const shippingFeeOf = useCallback(
    (p: Product) => {
      return computeShipping({
        region: market,
        subtotal: 0,
        items: [{ slug: p.slug, category: p.category, qty: 1, shippingFeeInr: p.shippingFeeInr, shippingFeeUsd: p.shippingFeeUsd }],
        settings: { shipping_mode: "product" },
      });
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
        reasons,
        detectionTier,
        vpnSuspected,
        needsSelection,
        softConfirm,
        confirmDetectedRegion,
        rejectDetectedRegion,

        loading,
        countryCode,
        isAdmin,
        setPreviewMarket,
        lockMarket,
        priceOf,
        compareOf,
        shippingFeeOf,
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
