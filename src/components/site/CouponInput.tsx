import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Tag, Check, X, Loader2 } from "lucide-react";
import { applyCoupon } from "@/lib/cart.functions";
import { useAppliedPromoCode } from "@/lib/promo-code";

export type AppliedCoupon = {
  code: string;
  kind: string;
  value: number;
  /** Discount amount in USD (re-computed server-side from the live cart). */
  discount: number;
};

/**
 * Coupon entry + validation UI. Validates against the real promo_codes table
 * via the existing `applyCoupon` server function (no backend changes). Surfaces
 * success, invalid, expired and usage-limit states, persists the applied code
 * across cart ↔ checkout, and re-validates whenever the cart contents change.
 */
export function CouponInput({
  items,
  format,
  onChange,
}: {
  items: { slug: string; qty: number }[];
  format: (usd: number) => string;
  onChange: (applied: AppliedCoupon | null) => void;
}) {
  const validate = useServerFn(applyCoupon);
  const [storedCode, setStoredCode] = useAppliedPromoCode();
  const [input, setInput] = useState(storedCode ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<AppliedCoupon | null>(null);
  const itemsKey = items.map((i) => `${i.slug}:${i.qty}`).join(",");

  async function run(code: string, silent = false) {
    const trimmed = code.trim();
    if (!trimmed || items.length === 0) return;
    if (!silent) setBusy(true);
    setError(null);
    try {
      const res = await validate({ data: { code: trimmed, items } });
      if (res.ok) {
        const next: AppliedCoupon = {
          code: res.code,
          kind: res.kind,
          value: res.value,
          discount: res.discount,
        };
        setApplied(next);
        onChange(next);
        setStoredCode(res.code);
        setInput(res.code);
      } else {
        setApplied(null);
        onChange(null);
        setError(res.reason);
        if (silent) setStoredCode(null);
      }
    } catch {
      setApplied(null);
      onChange(null);
      setError("Could not validate this code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // Re-validate a persisted / applied code whenever the cart changes, so the
  // discount stays accurate and self-clears if it is no longer eligible.
  useEffect(() => {
    if (storedCode && items.length > 0) run(storedCode, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);

  function clear() {
    setApplied(null);
    onChange(null);
    setStoredCode(null);
    setInput("");
    setError(null);
  }

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4">
      {applied ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="size-8 shrink-0 grid place-items-center rounded-full bg-accent/15 text-accent">
              <Check className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                Code <span className="font-mono uppercase">{applied.code}</span> applied
              </p>
              <p className="text-[11px] text-accent">
                You save {format(applied.discount)}
                {applied.kind === "percent" ? ` (${applied.value}% off)` : ""}
              </p>
            </div>
          </div>
          <button onClick={clear} className="text-muted-foreground hover:text-destructive shrink-0" aria-label="Remove coupon">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <>
          <label className="flex items-center gap-2 text-xs font-medium mb-2 text-muted-foreground">
            <Tag className="size-3.5 text-accent" /> Have a coupon code?
          </label>
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => {
                setInput(e.target.value.toUpperCase());
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  run(input);
                }
              }}
              placeholder="Enter code"
              maxLength={64}
              className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm uppercase tracking-wider focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              onClick={() => run(input)}
              disabled={busy || !input.trim()}
              className="px-4 rounded-lg bg-accent text-accent-foreground text-xs font-bold uppercase tracking-widest disabled:opacity-40 inline-flex items-center gap-1.5"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Apply"}
            </button>
          </div>
          {error && <p className="text-xs text-destructive mt-2">{error}</p>}
        </>
      )}
    </div>
  );
}
