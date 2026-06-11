import { Loader2, CheckCircle2, XCircle, Truck, CalendarClock, Wallet, ShieldAlert, RotateCcw, Globe, Gauge } from "lucide-react";
import type { ServiceabilityResult } from "@/lib/serviceability.functions";

type Props = {
  service: ServiceabilityResult | null;
  checking: boolean;
  /** Human-readable delivery window, e.g. "Jun 4 – Jun 7". */
  eta: string;
  /** Pre-formatted shipping price label, e.g. "₹99" or "FREE". */
  shippingLabel: string;
  /** Whether Cash on Delivery is currently offered. */
  codAvailable: boolean;
  city?: string | null;
  postal?: string | null;
  /** Return window in days (defaults to 4). */
  returnsDays?: number;
  /** Market the destination resolved to. */
  region?: "India" | "International";
};

/**
 * Rich, Amazon/Flipkart-style delivery card shown for the selected address.
 * Surfaces delivery availability, the estimated window, shipping cost and COD
 * eligibility in a single glanceable block instead of a bare "PIN verified".
 */
export function SmartDeliveryCard({
  service,
  checking,
  eta,
  shippingLabel,
  codAvailable,
  city,
  postal,
  returnsDays = 4,
  region = "India",
}: Props) {
  const serviceable = service?.serviceable === true;
  const serviceDown = service?.status === "service_down";
  const unavailable = !!service && !serviceable && !serviceDown;

  return (
    <section className="glass border border-white/10 rounded-2xl p-5 sm:p-6">
      {/* Header status */}
      <div className="flex items-center gap-2.5">
        {checking ? (
          <>
            <Loader2 className="size-4 text-accent animate-spin shrink-0" />
            <p className="text-sm font-medium">Checking delivery for {postal}…</p>
          </>
        ) : serviceable ? (
          <>
            <span className="size-7 grid place-items-center rounded-lg bg-emerald-500/15 text-emerald-400 shrink-0">
              <CheckCircle2 className="size-4" />
            </span>
            <div>
              <p className="text-sm font-medium text-emerald-400">Delivery available</p>
              <p className="text-[11px] text-muted-foreground">
                To {city ?? "your area"} {postal}
              </p>
            </div>
          </>
        ) : serviceDown ? (
          <>
            <span className="size-7 grid place-items-center rounded-lg bg-amber-500/15 text-amber-400 shrink-0">
              <ShieldAlert className="size-4" />
            </span>
            <div>
              <p className="text-sm font-medium text-amber-400">We'll confirm before dispatch</p>
              <p className="text-[11px] text-muted-foreground">
                Live verification is temporarily unavailable
              </p>
            </div>
          </>
        ) : unavailable ? (
          <>
            <span className="size-7 grid place-items-center rounded-lg bg-destructive/15 text-destructive shrink-0">
              <XCircle className="size-4" />
            </span>
            <div>
              <p className="text-sm font-medium text-destructive">Delivery unavailable</p>
              <p className="text-[11px] text-muted-foreground">{service?.message}</p>
            </div>
          </>
        ) : (
          <>
            <Truck className="size-4 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">Select an address to see delivery details</p>
          </>
        )}
      </div>

      {/* Detail grid — only when we have a usable destination */}
      {(serviceable || serviceDown) && (
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          <Stat
            icon={<CalendarClock className="size-3.5" />}
            label="Estimated"
            value={eta}
            tone="accent"
          />
          <Stat
            icon={<Truck className="size-3.5" />}
            label="Shipping"
            value={shippingLabel}
            tone={shippingLabel.toUpperCase() === "FREE" ? "emerald" : "default"}
          />
          <Stat
            icon={<Wallet className="size-3.5" />}
            label="COD"
            value={codAvailable ? "Available" : "Unavailable"}
            tone={codAvailable ? "emerald" : "muted"}
          />
          <Stat
            icon={<RotateCcw className="size-3.5" />}
            label="Returns"
            value={`${returnsDays} days`}
            tone="default"
          />
          <Stat
            icon={<Globe className="size-3.5" />}
            label="Region"
            value={region}
            tone="accent"
          />
          <Stat
            icon={<Gauge className="size-3.5" />}
            label="Confidence"
            value={serviceable ? "High" : "Pending"}
            tone={serviceable ? "emerald" : "muted"}
          />
        </div>
      )}
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "default" | "accent" | "emerald" | "muted";
}) {
  const valueTone =
    tone === "accent"
      ? "text-accent"
      : tone === "emerald"
        ? "text-emerald-400"
        : tone === "muted"
          ? "text-muted-foreground"
          : "text-foreground";
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="inline-flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className={`mt-1 text-xs font-medium ${valueTone}`}>{value}</p>
    </div>
  );
}
