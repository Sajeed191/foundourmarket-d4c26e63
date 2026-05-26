import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Currency = "USD" | "INR" | "EUR" | "AED";
type Region = "IN" | "INTL" | "EU" | "AE";

type Ctx = {
  region: Region;
  currency: Currency;
  symbol: string;
  setRegion: (r: Region) => void;
  setCurrency: (c: Currency) => void;
  format: (usd: number) => string;
};

// Static demo exchange rates (vs USD)
const RATES: Record<Currency, number> = { USD: 1, INR: 83, EUR: 0.92, AED: 3.67 };
const SYMBOLS: Record<Currency, string> = { USD: "$", INR: "₹", EUR: "€", AED: "AED " };
const REGION_DEFAULT: Record<Region, Currency> = { IN: "INR", INTL: "USD", EU: "EUR", AE: "AED" };

const RegionContext = createContext<Ctx | null>(null);

export function RegionProvider({ children }: { children: ReactNode }) {
  const [region, setRegionState] = useState<Region>("INTL");
  const [currency, setCurrencyState] = useState<Currency>("USD");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedR = localStorage.getItem("region") as Region | null;
    const savedC = localStorage.getItem("currency") as Currency | null;
    if (savedR && ["IN", "INTL", "EU", "AE"].includes(savedR)) setRegionState(savedR);
    if (savedC && ["USD", "INR", "EUR", "AED"].includes(savedC)) {
      setCurrencyState(savedC);
    } else if (savedR) {
      setCurrencyState(REGION_DEFAULT[savedR]);
    } else {
      const lang = navigator.language?.toLowerCase() ?? "";
      if (lang.includes("in")) { setRegionState("IN"); setCurrencyState("INR"); }
      else if (lang.startsWith("ar") || lang.includes("ae")) { setRegionState("AE"); setCurrencyState("AED"); }
      else if (lang.startsWith("de") || lang.startsWith("fr") || lang.startsWith("es") || lang.startsWith("it")) {
        setRegionState("EU"); setCurrencyState("EUR");
      }
    }
  }, []);

  const setRegion = (r: Region) => {
    setRegionState(r);
    setCurrencyState(REGION_DEFAULT[r]);
    if (typeof window !== "undefined") {
      localStorage.setItem("region", r);
      localStorage.setItem("currency", REGION_DEFAULT[r]);
    }
  };
  const setCurrency = (c: Currency) => {
    setCurrencyState(c);
    if (typeof window !== "undefined") localStorage.setItem("currency", c);
  };

  const symbol = SYMBOLS[currency];

  const format = (usd: number) => {
    const v = usd * RATES[currency];
    if (currency === "INR") return `₹${Math.round(v).toLocaleString("en-IN")}`;
    if (currency === "AED") return `AED ${v.toFixed(2)}`;
    if (currency === "EUR") return `€${v.toFixed(2)}`;
    return `$${v.toFixed(2)}`;
  };

  return (
    <RegionContext.Provider value={{ region, currency, symbol, setRegion, setCurrency, format }}>
      {children}
    </RegionContext.Provider>
  );
}

export function useRegion() {
  const ctx = useContext(RegionContext);
  if (!ctx) throw new Error("useRegion must be inside RegionProvider");
  return ctx;
}
