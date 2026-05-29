import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useRegion, type MarketRegion } from "@/lib/region";
import { cn } from "@/lib/utils";

const OPTIONS: {
  id: MarketRegion;
  flag: string;
  title: string;
  currency: string;
  blurb: string;
}[] = [
  {
    id: "india",
    flag: "🇮🇳",
    title: "India",
    currency: "INR ₹",
    blurb: "Local pricing, UPI & cards, fast domestic delivery.",
  },
  {
    id: "international",
    flag: "🌍",
    title: "International",
    currency: "USD $",
    blurb: "Global pricing in USD with worldwide shipping.",
  },
];

/**
 * Post-login region picker. Appears only when a signed-in user has not yet
 * locked a market. Geo-detection pre-selects the suggested region; the choice
 * is permanent once confirmed.
 */
export function RegionSelectModal() {
  const { needsSelection, market, countryCode, lockMarket, loading } = useRegion();
  const [choice, setChoice] = useState<MarketRegion | null>(null);
  const [saving, setSaving] = useState(false);

  // Pre-select the geo-suggested region when the modal opens.
  useEffect(() => {
    if (needsSelection) setChoice(market);
  }, [needsSelection, market]);

  const open = needsSelection && !loading;

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
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="max-w-md [&>button]:hidden"
      >
        <div className="space-y-1 text-center">
          <h2 className="text-xl font-semibold tracking-tight">Choose your market</h2>
          <p className="text-sm text-muted-foreground">
            This locks your currency and pricing permanently and can't be changed
            later.
          </p>
          {countryCode && (
            <p className="text-xs text-muted-foreground/80">
              Detected location: {countryCode}
            </p>
          )}
        </div>

        <div className="mt-4 grid gap-3">
          {OPTIONS.map((o) => {
            const active = choice === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setChoice(o.id)}
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-4 rounded-xl border p-4 text-left transition-all",
                  active
                    ? "border-primary bg-primary/10 ring-1 ring-primary"
                    : "border-border hover:border-primary/50 hover:bg-accent/40",
                )}
              >
                <span className="text-3xl leading-none">{o.flag}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{o.title}</span>
                    <span className="text-xs text-muted-foreground">{o.currency}</span>
                    {market === o.id && (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                        Suggested
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {o.blurb}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <Button
          className="mt-4 w-full"
          disabled={!choice || saving}
          onClick={confirm}
        >
          {saving ? "Locking…" : "Confirm & continue"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
