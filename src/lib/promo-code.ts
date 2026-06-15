import { useCallback, useEffect, useState } from "react";

/**
 * Tiny cross-surface store for the customer's applied coupon code.
 * The cart and checkout both read/write the same persisted code so an applied
 * coupon survives navigation. Only the code string is stored — the actual
 * discount is always re-validated server-side against the live cart.
 */
const KEY = "fom_promo_code";
const EVT = "fom_promo_change";

function read(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

export function useAppliedPromoCode(): [string | null, (code: string | null) => void] {
  const [code, setCode] = useState<string | null>(read);

  useEffect(() => {
    const sync = () => setCode(read());
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const set = useCallback((c: string | null) => {
    try {
      if (c) localStorage.setItem(KEY, c);
      else localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    setCode(c);
    if (typeof window !== "undefined") window.dispatchEvent(new Event(EVT));
  }, []);

  return [code, set];
}
