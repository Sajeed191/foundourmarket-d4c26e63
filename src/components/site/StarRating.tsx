import { useId } from "react";
import { cn } from "@/lib/utils";

// Lucide "star" path, rendered manually so we can apply a precise 50% fill
// via an SVG gradient. This guarantees every star (full / half / empty) is the
// exact same shape, size, baseline and spacing — only the fill amount differs.
const STAR_PATH =
  "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.49a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 10.275a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z";

/**
 * One star slot. `pct` is the fill percentage (0, 50 or 100). The outline and
 * fill use a single shared <path>, so the half star is pixel-identical in size
 * and alignment to full/empty stars — never cropped, shrunk or shifted.
 */
function StarIcon({
  pct,
  className,
  glow,
}: {
  pct: number;
  className?: string;
  glow?: boolean;
}) {
  const id = useId();
  const filled = pct > 0;
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn(
        "shrink-0",
        filled ? "text-accent" : "text-muted-foreground/30",
        glow && filled && "drop-shadow-[0_0_6px_oklch(0.74_0.19_49/0.6)]",
        className,
      )}
      style={{ display: "block" }}
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <stop offset={`${pct}%`} stopColor="var(--accent)" />
          <stop offset={`${pct}%`} stopColor="transparent" />
        </linearGradient>
      </defs>
      <path
        d={STAR_PATH}
        fill={filled ? `url(#${id})` : "none"}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Professional ecommerce rating display. Renders exactly 5 equally sized stars
 * and fills each to match the numeric rating rounded to the nearest 0.5
 * (e.g. 4.5 → 4 full + 1 half, 3.0 → 3 full + 2 empty, 0.5 → 1 half).
 *
 * Stars are the primary visual element. Optionally appends the numeric value
 * and/or the review count after the stars. When there are zero reviews it shows
 * an empty 5-star row plus a "No reviews yet" note so ratings are never
 * misleading.
 */
export function StarRating({
  rating,
  count,
  showValue = false,
  className,
  starClassName = "size-3.5",
  textClassName,
  glow = false,
}: {
  rating: number;
  /** Number of reviews. When 0 (and provided) shows empty stars + "No reviews yet". */
  count?: number;
  /** Show the numeric rating value after the stars. */
  showValue?: boolean;
  className?: string;
  starClassName?: string;
  textClassName?: string;
  glow?: boolean;
}) {
  const raw = Math.max(0, Math.min(5, Number(rating) || 0));
  // Round only to the nearest 0.5 so stars always show full / half / empty.
  const value = Math.round(raw * 2) / 2;
  const hasCount = typeof count === "number";
  const noReviews = hasCount && count === 0;

  return (
    <div
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}
      role="img"
      aria-label={
        noReviews
          ? "No reviews yet"
          : `Rating: ${value} out of 5${hasCount ? `, ${count} reviews` : ""}`
      }
    >
      <span className="inline-flex items-center gap-0.5 shrink-0 leading-none">
        {Array.from({ length: 5 }).map((_, i) => {
          // 1 = full, 0.5 = half, 0 = empty for this slot.
          const fill = noReviews ? 0 : Math.max(0, Math.min(1, value - i));
          const pct = fill >= 1 ? 100 : fill >= 0.5 ? 50 : 0;
          return <StarIcon key={i} pct={pct} className={starClassName} glow={glow} />;
        })}
      </span>

      {noReviews ? (
        <span className={cn("text-muted-foreground tabular-nums", textClassName)}>
          No reviews yet
        </span>
      ) : (
        (showValue || hasCount) && (
          <span className={cn("text-foreground/80 tabular-nums", textClassName)}>
            {showValue && <span className="font-medium">{value.toFixed(1)}</span>}
            {hasCount && (
              <span className={cn("text-muted-foreground", showValue && "ml-1")}>
                ({count})
              </span>
            )}
          </span>
        )
      )}
    </div>
  );
}
