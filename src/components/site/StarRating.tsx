import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Accurate star rating display. Renders exactly 5 stars and fills them to
 * precisely match the numeric rating, including decimals/half values
 * (e.g. 4.5 → 4 full + 1 half, 3.0 → 3 full + 2 empty). Never hardcoded.
 */
export function StarRating({
  rating,
  className,
  starClassName = "size-3.5",
  glow = false,
}: {
  rating: number;
  className?: string;
  starClassName?: string;
  glow?: boolean;
}) {
  const value = Math.max(0, Math.min(5, Number(rating) || 0));
  return (
    <div
      className={cn("flex items-center gap-0.5", className)}
      role="img"
      aria-label={`Rating: ${value} out of 5`}
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span key={i} className="relative inline-flex shrink-0">
            <Star className={cn("text-muted-foreground/30", starClassName)} />
            {fill > 0 && (
              <span
                aria-hidden
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${fill * 100}%` }}
              >
                <Star
                  className={cn(
                    "fill-accent text-accent",
                    glow && "drop-shadow-[0_0_6px_oklch(0.74_0.19_49/0.6)]",
                    starClassName,
                  )}
                />
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
