import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { Globe2, RefreshCw, Loader2, IndianRupee, DollarSign } from "lucide-react";
import { getCheckoutRegionDebug } from "@/lib/region.functions";

type Debug = {
  detectedCountry: string | null;
  timezone: string | null;
  market: "india" | "international";
  currency: "INR" | "USD";
  pricingSource: "profile_locked" | "edge_geo" | "default";
  confidence: number;
  profileLocked: boolean;
};

/**
 * Admin-only payment/region debug panel. Shows the exact signals the billing
 * path uses to choose a currency before any Razorpay order is created — so
 * staff can confirm Indian shoppers resolve to IN / INDIA / INR.
 */
export function CheckoutRegionDebug() {
  const fetchDebug = useServerFn(getCheckoutRegionDebug);
  const [data, setData] = useState<Debug | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setData((await fetchDebug()) as Debug);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isInr = data?.currency === "INR";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-xl"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Globe2 className="size-4 text-accent" />
          Checkout Region & Currency Debug
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          Refresh
        </button>
      </div>

      {loading && !data ? (
        <div className="mt-4 grid place-items-center py-6">
          <Loader2 className="size-5 animate-spin text-accent" />
        </div>
      ) : !data ? (
        <p className="mt-3 text-sm text-muted-foreground">Could not resolve region debug.</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Detected Country" value={data.detectedCountry ?? "—"} />
          <Stat label="Market" value={data.market.toUpperCase()} />
          <Stat
            label="Currency"
            value={
              <span className="inline-flex items-center gap-1">
                {isInr ? <IndianRupee className="size-3.5" /> : <DollarSign className="size-3.5" />}
                {data.currency}
              </span>
            }
            highlight={isInr ? "ok" : "neutral"}
          />
          <Stat label="Price Source" value={data.pricingSource} />
          <Stat label="Confidence" value={`${data.confidence}%`} />
          <Stat label="Profile Locked" value={data.profileLocked ? "Yes" : "No"} />
          <Stat label="Timezone" value={data.timezone ?? "—"} />
        </div>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Razorpay payment methods (UPI, Google Pay, PhonePe, Paytm, BHIM, Net Banking, Cards,
        Wallets, EMI, Pay Later) are surfaced by the gateway for the order currency — no method
        filter is applied at checkout. INR orders unlock all Indian methods automatically.
      </p>
    </motion.div>
  );
}

function Stat({
  label,
  value,
  highlight = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  highlight?: "ok" | "neutral";
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={`mt-1 text-sm font-semibold ${
          highlight === "ok" ? "text-emerald-400" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
