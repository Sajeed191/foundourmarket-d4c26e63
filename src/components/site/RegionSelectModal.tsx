import { useEffect, useState } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Globe,
  Zap,
  Truck,
  ShieldCheck,
  Lock,
  ChevronLeft,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { useRegion, type MarketRegion } from "@/lib/region";
import { cn } from "@/lib/utils";

type Option = {
  id: MarketRegion;
  flag: string;
  title: string;
  currency: string;
  blurb: string;
  badges: string[];
  payments: { label: string; soon?: boolean }[];
  perks: { icon: typeof Globe; label: string }[];
};

const OPTIONS: Option[] = [
  {
    id: "india",
    flag: "🇮🇳",
    title: "India",
    currency: "INR ₹",
    blurb: "Local pricing with instant UPI & cards, built for fast domestic commerce.",
    badges: ["GST-ready", "Domestic"],
    payments: [{ label: "UPI" }, { label: "Razorpay" }, { label: "Cards" }],
    perks: [
      { icon: Zap, label: "Instant UPI checkout" },
      { icon: Truck, label: "Fast India delivery" },
      { icon: ShieldCheck, label: "GST-compliant invoices" },
    ],
  },
  {
    id: "international",
    flag: "🌍",
    title: "International",
    currency: "USD $",
    blurb: "Global USD pricing with worldwide shipping to your doorstep.",
    badges: ["USD global pricing", "Worldwide"],
    payments: [
      { label: "Stripe", soon: true },
      { label: "PayPal", soon: true },
    ],
    perks: [
      { icon: Globe, label: "Worldwide shipping" },
      { icon: Sparkles, label: "USD global pricing" },
      { icon: ShieldCheck, label: "Secure global checkout" },
    ],
  },
];

/**
 * Post-login region picker. Customers only — staff/admin accounts are exempt
 * (handled in RegionProvider, which never sets needsSelection for admins).
 * Two-step cinematic flow: pick a market, then confirm the permanent lock.
 */
export function RegionSelectModal() {
  const { needsSelection, market, countryCode, lockMarket, loading, isAdmin } =
    useRegion();
  const [choice, setChoice] = useState<MarketRegion | null>(null);
  const [step, setStep] = useState<"select" | "confirm">("select");
  const [saving, setSaving] = useState(false);

  // Pre-select the geo-suggested region when the modal opens.
  useEffect(() => {
    if (needsSelection) {
      setChoice(market);
      setStep("select");
    }
  }, [needsSelection, market]);

  const open = needsSelection && !loading && !isAdmin;
  const selected = OPTIONS.find((o) => o.id === choice) ?? null;

  async function confirm() {
    if (!choice || saving) return;
    setSaving(true);
    try {
      await lockMarket(choice);
      toast.success("Region locked", {
        description:
          choice === "india"
            ? "You're shopping in India · INR ₹"
            : "You're shopping International · USD $",
      });
    } catch (e) {
      toast.error("Couldn't set your region", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
      setSaving(false);
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="max-w-lg overflow-hidden border-white/10 bg-background/80 p-0 backdrop-blur-2xl [&>button]:hidden"
      >
        {/* cinematic ambient glow */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div
            className="absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full opacity-50 animate-orb"
            style={{ background: "var(--gradient-ember-soft)", filter: "blur(90px)" }}
          />
        </div>

        <AnimatePresence mode="wait">
          {step === "select" ? (
            <motion.div
              key="select"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="p-6"
            >
              <div className="space-y-1.5 text-center">
                <div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10 text-accent">
                  <Globe className="size-5" />
                </div>
                <DialogTitle className="text-xl font-display font-semibold tracking-tight">
                  Choose your market
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  Pricing, currency and payments are tailored to your region.
                </DialogDescription>
                {countryCode && (
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">
                    Detected location · {countryCode}
                  </p>
                )}
              </div>

              <div className="mt-5 grid gap-3">
                {OPTIONS.map((o) => {
                  const active = choice === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setChoice(o.id)}
                      aria-pressed={active}
                      className={cn(
                        "group relative overflow-hidden rounded-2xl border p-4 text-left transition-all",
                        active
                          ? "border-accent/60 bg-accent/10 shadow-[var(--shadow-ember)]"
                          : "border-white/10 bg-white/[0.02] hover:border-accent/40 hover:bg-white/[0.04]",
                      )}
                    >
                      {market === o.id && (
                        <span className="absolute right-3 top-3 rounded-full bg-accent/15 px-2 py-0.5 text-[9px] font-mono font-semibold uppercase tracking-widest text-accent">
                          Suggested
                        </span>
                      )}
                      <div className="flex items-center gap-3">
                        <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/30 text-2xl">
                          {o.flag}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{o.title}</span>
                            <span className="text-xs font-mono text-accent">{o.currency}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                            {o.blurb}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        {o.payments.map((p) => (
                          <span
                            key={p.label}
                            className={cn(
                              "rounded-md border px-2 py-0.5 text-[9px] font-mono font-medium uppercase tracking-wider",
                              p.soon
                                ? "border-white/10 text-muted-foreground/60"
                                : "border-accent/30 bg-accent/10 text-accent",
                            )}
                          >
                            {p.label}
                            {p.soon && " · soon"}
                          </span>
                        ))}
                        {o.badges.map((b) => (
                          <span
                            key={b}
                            className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-muted-foreground/80"
                          >
                            {b}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>

              <Button
                className="mt-5 w-full"
                disabled={!choice}
                onClick={() => setStep("confirm")}
              >
                Continue
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="p-6"
            >
              <div className="space-y-1.5 text-center">
                <div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10 text-accent">
                  <Lock className="size-5" />
                </div>
                <DialogTitle className="text-xl font-display font-semibold tracking-tight">
                  Confirm {selected?.title} market
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  Your market selection{" "}
                  <span className="text-foreground">cannot be changed later.</span>
                </DialogDescription>
              </div>

              {selected && (
                <div className="mt-5 rounded-2xl border border-accent/30 bg-accent/[0.06] p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/30 text-2xl">
                      {selected.flag}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{selected.title}</span>
                        <span className="text-xs font-mono text-accent">
                          {selected.currency}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{selected.blurb}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-1.5">
                    {selected.perks.map((perk) => (
                      <div
                        key={perk.label}
                        className="flex items-center gap-2 text-xs text-muted-foreground"
                      >
                        <perk.icon className="size-3.5 text-accent shrink-0" />
                        {perk.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-5 flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={saving}
                  onClick={() => setStep("select")}
                >
                  <ChevronLeft className="size-4" /> Go back
                </Button>
                <Button className="flex-1" disabled={saving} onClick={confirm}>
                  {saving ? (
                    "Locking…"
                  ) : (
                    <>
                      <CheckCircle2 className="size-4" /> Confirm &amp; continue
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
