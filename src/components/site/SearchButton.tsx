import { ArrowRight, Loader2, Search } from "lucide-react";
import { useRef } from "react";

type Props = {
  loading?: boolean;
};

/**
 * Premium pill-shaped search submit button.
 * - Glossy orange gradient, soft layered shadows, subtle idle pulse + periodic shimmer.
 * - GPU-only animations (transform/opacity), respects prefers-reduced-motion.
 * - Loading state morphs into a circular spinner without changing size.
 * - Press triggers a lightweight ripple.
 */
export function SearchButton({ loading = false }: Props) {
  const rippleRef = useRef<HTMLSpanElement>(null);

  function spawnRipple(e: React.PointerEvent<HTMLButtonElement>) {
    const el = rippleRef.current;
    if (!el) return;
    const rect = e.currentTarget.getBoundingClientRect();
    el.style.left = `${e.clientX - rect.left}px`;
    el.style.top = `${e.clientY - rect.top}px`;
    el.classList.remove("search-cta__ripple--run");
    // force reflow to restart the animation
    void el.offsetWidth;
    el.classList.add("search-cta__ripple--run");
  }

  return (
    <button
      type="submit"
      aria-label="Search"
      aria-busy={loading}
      disabled={loading}
      onPointerDown={spawnRipple}
      className={`search-cta group absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-11 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold tracking-wide text-white outline-none transition-transform duration-[250ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.03] active:scale-[0.98] disabled:cursor-default ${loading ? "search-cta--loading w-11 px-0" : "min-w-[120px] px-5"}`}
    >
      {/* glossy top highlight */}
      <span aria-hidden className="search-cta__gloss pointer-events-none absolute inset-x-1 top-[2px] h-1/2 rounded-full" />
      {/* periodic shimmer sweep */}
      <span aria-hidden className="search-cta__shimmer pointer-events-none absolute inset-0 rounded-full" />
      {/* click ripple */}
      <span ref={rippleRef} aria-hidden className="search-cta__ripple pointer-events-none" />

      {loading ? (
        <Loader2 className="relative z-[1] size-4 animate-spin" />
      ) : (
        <>
          <Search className="relative z-[1] size-3.5" strokeWidth={2.4} />
          <span className="relative z-[1]">Search</span>
          <ArrowRight className="relative z-[1] size-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
        </>
      )}
    </button>
  );
}
