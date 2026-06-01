import { useRegion } from "@/lib/region";
import { cn } from "@/lib/utils";

/**
 * Currency-safe price renderer.
 *
 * While the active region/currency is still being resolved (`currencyReady`
 * is false), this paints a neutral skeleton instead of a price. This is the
 * single mechanism that prevents Indian shoppers from briefly seeing USD
 * (and international shoppers from seeing INR) on first load, refresh, login,
 * navigation, or any async region settle.
 *
 * Pass `value` as the already region-resolved amount (from `priceOf`,
 * `compareOf`, totals, etc.). Formatting + symbol come from the region context.
 */
export function Price({
  value,
  className,
  skeletonClassName,
}: {
  value: number;
  className?: string;
  /** Width/height of the placeholder shown until currency is ready. */
  skeletonClassName?: string;
}) {
  const { format, currencyReady } = useRegion();

  if (!currencyReady) {
    return (
      <span
        aria-hidden
        className={cn(
          "inline-block h-[1em] w-14 animate-pulse rounded bg-white/10 align-middle",
          skeletonClassName,
        )}
      />
    );
  }

  return <span className={className}>{format(value)}</span>;
}
