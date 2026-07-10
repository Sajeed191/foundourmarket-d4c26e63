import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Premium "View All" card for horizontal product carousels.
 *
 * Reusable across Continue Shopping, Recently Viewed, Recommended For You,
 * Wishlist and any other product rail so the "see everything" affordance
 * feels like the last premium card of the carousel — identical width, height,
 * radius, border, shadow and padding as the surrounding product cards.
 *
 * Sizing is inherited from the parent frame (pass the same width class used by
 * the product-card frames). Height matches neighbouring cards via `self-stretch`.
 */
export function CarouselViewAllCard({
  to,
  remaining,
  title = "View All",
  subtitle = "Continue shopping",
  className,
}: {
  /** Destination route (never the browse/catalogue page). */
  to: string;
  /** Number of additional products not shown in the carousel. */
  remaining?: number;
  title?: string;
  subtitle?: string;
  /** Width/sizing classes matching the sibling product-card frames. */
  className?: string;
}) {
  const remainingLabel =
    typeof remaining === "number" && remaining > 0
      ? `${remaining.toLocaleString()} more`
      : "See all";

  return (
    <motion.div
      className={cn("self-stretch snap-start shrink-0", className)}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 28, mass: 0.6 }}
    >
      <Link
        to={to as never}
        onClick={() => {
          if (typeof navigator !== "undefined" && "vibrate" in navigator) {
            try {
              navigator.vibrate?.(8);
            } catch {
              /* no-op */
            }
          }
        }}
        aria-label={title}
        className={cn(
          "group relative flex h-full min-h-full w-full flex-col items-center justify-center gap-3 overflow-hidden",
          "rounded-[22px] border border-accent/20 bg-card/40 p-4 text-center backdrop-blur-xl",
          "shadow-[var(--shadow-ember)] transition-[transform,border-color,box-shadow] duration-200 ease-out",
          "hover:border-accent/45 active:scale-[0.98]",
        )}
      >
        {/* Soft radial highlight behind the icon */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 size-40 -translate-x-1/2 -translate-y-[70%] rounded-full opacity-40 blur-xl transition-opacity duration-200 group-hover:opacity-70"
          style={{ background: "var(--gradient-ember)" }}
        />

        {/* Premium circular icon with subtle glow */}
        <span className="relative grid size-14 place-items-center rounded-full border border-accent/30 bg-accent/15 text-accent shadow-[var(--shadow-ember)] transition-transform duration-200 ease-out group-hover:scale-105 group-active:scale-95">
          <LayoutGrid className="size-6" />
        </span>

        <span className="relative flex flex-col items-center">
          <span className="text-base font-semibold tracking-tight text-foreground">{title}</span>
          <span className="mt-1 text-[11px] text-muted-foreground">{subtitle}</span>
        </span>

        <span className="relative inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-accent">
          {remainingLabel}
          <ArrowRight className="size-3 transition-transform duration-200 group-hover:translate-x-0.5" />
        </span>
      </Link>
    </motion.div>
  );
}
