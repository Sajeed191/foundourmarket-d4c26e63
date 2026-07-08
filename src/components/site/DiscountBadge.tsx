import { cn } from "@/lib/utils";

/**
 * Global discount capsule — the single reusable "% OFF" badge used everywhere
 * (product cards, PDP, flash/hot deals, quick view, wishlist, cart).
 *
 * Fixed height, perfectly centered, tabular numerals, never clips or wraps —
 * identical from 5% to 100% off and pixel-consistent on every device. The
 * visual style lives in the `.fom-discount-badge` token in styles.css.
 */
export function DiscountBadge({
  percent,
  className,
}: {
  percent: number;
  className?: string;
}) {
  if (!percent || percent <= 0) return null;
  return (
    <span data-product-text className={cn("fom-discount-badge", className)}>
      {percent}% OFF
    </span>
  );
}
