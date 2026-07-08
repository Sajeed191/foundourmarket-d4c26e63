import { useRegion } from "@/lib/region";
import { cn } from "@/lib/utils";

type PriceVariant = "current" | "compare" | "plain";

/**
 * Currency-safe, premium price renderer — the single global price component.
 *
 * While the active region/currency is still being resolved (`currencyReady`
 * is false), this paints a neutral skeleton instead of a price. This is the
 * single mechanism that prevents Indian shoppers from briefly seeing USD
 * (and international shoppers from seeing INR) on first load, refresh, login,
 * navigation, or any async region settle.
 *
 * Variants (one consistent design everywhere):
 * - "current" (default): the featured price — premium metallic champagne→ember
 *   sheen, bold 800 weight, tabular numerals, currency symbol locked to the
 *   amount (no wrapping), subtle premium shadow.
 * - "compare": the original / struck price — muted gray, clean strike-through.
 * - "plain": no built-in treatment (inline totals that inherit surrounding
 *   styling). Callers still get tabular numerals + no-wrap via className.
 *
 * Pass `value` as the already region-resolved amount (from `priceOf`,
 * `compareOf`, totals, etc.). Formatting + symbol come from the region context.
 */
export function Price({
  value,
  className,
  skeletonClassName,
  variant = "current",
}: {
  value: number;
  className?: string;
  /** Width/height of the placeholder shown until currency is ready. */
  skeletonClassName?: string;
  variant?: PriceVariant;
}) {
  const { format, currencyReady } = useRegion();

  if (!currencyReady) {
    return (
      <span
        aria-hidden
        data-product-text
        className={cn(
          "product-price-skeleton inline-block h-[1em] w-14 animate-pulse rounded bg-white/10 align-middle",
          skeletonClassName,
        )}
      />
    );
  }

  const variantClass =
    variant === "current"
      ? "fom-price-current"
      : variant === "compare"
        ? "fom-price-compare"
        : "";

  return (
    <span
      data-product-text
      className={cn("product-typography product-price-text", variantClass, className)}
    >
      {format(value)}
    </span>
  );
}
