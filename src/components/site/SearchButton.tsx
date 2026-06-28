import { ArrowRight, Loader2 } from "lucide-react";

type Props = {
  loading?: boolean;
};

/**
 * Premium pill-shaped search submit button.
 * - Glossy orange gradient, soft brand glow, idle pulse + periodic shimmer.
 * - GPU-only animations (transform/opacity), respects prefers-reduced-motion.
 * - Loading state swaps the arrow for a spinner without changing size.
 */
export function SearchButton({ loading = false }: Props) {
  return (
    <button
      type="submit"
      aria-label="Search"
      aria-busy={loading}
      disabled={loading}
      className="search-cta group absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-11 min-w-[112px] items-center justify-center gap-1.5 rounded-full px-5 text-[13px] font-semibold tracking-wide text-white outline-none transition-transform duration-[250ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.04] active:scale-[0.97] disabled:cursor-default"
    >
      {/* glossy top highlight */}
      <span aria-hidden className="search-cta__gloss pointer-events-none absolute inset-x-1 top-[2px] h-1/2 rounded-full" />
      {/* periodic shimmer sweep */}
      <span aria-hidden className="search-cta__shimmer pointer-events-none absolute inset-0 rounded-full" />
      <span className="relative z-[1]">Search</span>
      <span className="relative z-[1] grid size-3.5 place-items-center">
        {loading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
        )}
      </span>
    </button>
  );
}
