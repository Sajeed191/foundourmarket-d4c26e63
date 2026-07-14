import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ShoppingBag, Loader2, Check, ArrowUp, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { ProductSkeletonGrid } from "./ProductSkeleton";
import { trackEvent } from "@/lib/visitor";

/**
 * Premium "Load More" continuation experience.
 *
 * Responsibilities:
 *  - Show live progress ("Showing X of Y", "N remaining") with animated counters.
 *  - Render a premium orange-gradient CTA (lift/scale/glow hover, ripple + haptic tap).
 *  - Loading state: spinner, disabled, appended skeleton cards (no layout shift).
 *  - Hybrid infinite scroll: after 2 manual taps, auto-load when the sentinel
 *    approaches the viewport bottom.
 *  - End-of-catalog celebration + escape hatches (Back to top, Trending, etc.).
 *  - a11y: 44px min touch target, aria-live progress, keyboard focusable.
 *  - Analytics: `catalog_load_more_click` and `catalog_load_more_end` events.
 *
 * The component is presentation-only. All data (visible/total counts, the
 * `loadMore` handler, loading state) is owned by the caller so this can drop
 * into search, category, or collection routes without owning result state.
 */

type Props = {
  visible: number;
  total: number;
  pageSize: number;
  onLoadMore: () => void;
  loading?: boolean;
  columnsClassName?: string; // must match the grid above so skeletons align
  analyticsSource?: string;
};

function useAnimatedNumber(value: number, durationMs = 320) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);
  return display;
}

export function LoadMoreSection({
  visible,
  total,
  pageSize,
  onLoadMore,
  loading = false,
  columnsClassName = "grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5 lg:gap-6",
  analyticsSource = "search",
}: Props) {
  const remaining = Math.max(0, total - visible);
  const nextBatch = Math.min(pageSize, remaining);
  const done = remaining === 0;

  const shownAnim = useAnimatedNumber(visible);
  const remainingAnim = useAnimatedNumber(remaining);

  const [tapCount, setTapCount] = useState(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [ripple, setRipple] = useState<{ x: number; y: number; id: number } | null>(null);

  const handleLoad = () => {
    if (loading || done) return;
    // Haptic feedback (mobile). Silently no-op on unsupported browsers.
    try {
      (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate?.(12);
    } catch { /* noop */ }
    setTapCount((c) => c + 1);
    void trackEvent("catalog_load_more_click", {
      metadata: { source: analyticsSource, visible, total, remaining, tap_index: tapCount + 1 },
    });
    onLoadMore();
  };

  const onButtonPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setRipple({ x: e.clientX - rect.left, y: e.clientY - rect.top, id: Date.now() });
  };
  useEffect(() => {
    if (!ripple) return;
    const t = window.setTimeout(() => setRipple(null), 600);
    return () => window.clearTimeout(t);
  }, [ripple]);

  // Hybrid infinite scroll — arms after two manual taps, disarms at end.
  useEffect(() => {
    if (done || loading || tapCount < 2) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            onLoadMore();
            void trackEvent("catalog_load_more_auto", {
              metadata: { source: analyticsSource, visible, total },
            });
          }
        }
      },
      { rootMargin: "600px 0px 600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [done, loading, tapCount, onLoadMore, analyticsSource, visible, total]);

  // Announce end-of-catalog once.
  const endLoggedRef = useRef(false);
  useEffect(() => {
    if (done && !endLoggedRef.current) {
      endLoggedRef.current = true;
      void trackEvent("catalog_load_more_end", {
        metadata: { source: analyticsSource, total, taps: tapCount },
      });
    }
  }, [done, analyticsSource, total, tapCount]);

  const pct = total > 0 ? Math.min(100, Math.round((visible / total) * 100)) : 0;
  const buttonLabel = useMemo(() => {
    if (loading) return "Loading more products…";
    if (nextBatch <= 0) return "Load More Products";
    return `Load ${nextBatch} More Products`;
  }, [loading, nextBatch]);

  return (
    <section
      aria-label="Load more products"
      className="mt-14 sm:mt-16 flex flex-col items-center"
    >
      {loading && (
        <div className="w-full mb-8 sm:mb-10">
          <ProductSkeletonGrid count={Math.min(nextBatch || pageSize, pageSize)} className={columnsClassName} />
        </div>
      )}

      {!done ? (
        <>
          {/* Live progress */}
          <div className="w-full max-w-[360px] text-center" aria-live="polite" aria-atomic="true">
            <p className="text-[13px] font-medium text-foreground/90 tabular-nums">
              Showing <span className="font-semibold text-accent">{shownAnim.toLocaleString()}</span>{" "}
              of <span className="font-semibold">{total.toLocaleString()}</span> products
            </p>
            <p className="mt-1 text-[11px] font-mono uppercase tracking-widest text-muted-foreground tabular-nums">
              {remainingAnim.toLocaleString()} remaining
            </p>

            {/* Progress line */}
            <div className="mt-3 h-[3px] w-full rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent/70 via-accent to-accent/70 transition-[width] duration-500 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Premium CTA */}
          <button
            ref={btnRef}
            type="button"
            onClick={handleLoad}
            onPointerDown={onButtonPointerDown}
            disabled={loading}
            aria-busy={loading}
            aria-label={buttonLabel}
            className={[
              "group relative mt-6 inline-flex items-center justify-center gap-2.5 overflow-hidden",
              "h-[60px] min-h-[44px] w-[min(360px,calc(100vw-2rem))]",
              "rounded-full px-8 text-[15px] font-semibold text-white",
              "bg-[linear-gradient(135deg,hsl(24_95%_58%),hsl(20_100%_50%))]",
              "shadow-[0_18px_40px_-16px_hsl(24_95%_53%/0.55),0_0_0_1px_hsl(24_95%_60%/0.35)_inset]",
              "transition-[transform,box-shadow,filter] duration-300 ease-out",
              "hover:-translate-y-0.5 hover:scale-[1.015]",
              "hover:shadow-[0_26px_60px_-18px_hsl(24_95%_53%/0.75),0_0_0_1px_hsl(24_95%_65%/0.5)_inset]",
              "active:scale-[0.985] active:translate-y-0",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "disabled:cursor-not-allowed disabled:opacity-90",
            ].join(" ")}
          >
            {/* Glow */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full opacity-60 blur-2xl bg-[radial-gradient(closest-side,hsl(24_95%_58%/0.55),transparent_70%)] group-hover:opacity-90 transition-opacity"
            />
            {/* Ripple */}
            {ripple && (
              <span
                aria-hidden
                key={ripple.id}
                className="pointer-events-none absolute rounded-full bg-white/25 animate-[ripple_600ms_ease-out]"
                style={{
                  left: ripple.x,
                  top: ripple.y,
                  width: 12,
                  height: 12,
                  transform: "translate(-50%, -50%)",
                }}
              />
            )}
            <span className="relative flex items-center gap-2.5">
              {loading ? (
                <Loader2 className="size-[18px] animate-spin" aria-hidden />
              ) : (
                <ShoppingBag
                  className="size-[18px] transition-transform duration-300 group-hover:-translate-y-0.5"
                  aria-hidden
                />
              )}
              <span className="tracking-[-0.01em]">{buttonLabel}</span>
              {!loading && (
                <ArrowDown
                  className="size-[16px] transition-transform duration-300 group-hover:translate-y-0.5"
                  aria-hidden
                />
              )}
            </span>
          </button>

          <p className="mt-3 text-[11px] text-muted-foreground">
            {tapCount >= 2 ? "Auto-loading as you scroll…" : `Next: ${nextBatch} products`}
          </p>

          {/* Sentinel for hybrid infinite scroll */}
          <div ref={sentinelRef} aria-hidden className="h-1 w-full" />
        </>
      ) : (
        <EndOfCatalog total={total} />
      )}

      {/* Ripple keyframes (scoped, keeps design system untouched) */}
      <style>{`
        @keyframes ripple {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 0.55; }
          100% { transform: translate(-50%, -50%) scale(28); opacity: 0; }
        }
      `}</style>
    </section>
  );
}

function EndOfCatalog({ total }: { total: number }) {
  const backToTop = () => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return (
    <div className="w-full max-w-md text-center animate-[fade-in_400ms_ease-out]">
      <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-accent/10 ring-1 ring-accent/30">
        <Check className="size-6 text-accent" aria-hidden />
      </div>
      <p className="text-base font-semibold text-foreground">
        You've explored everything in this category
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        All {total.toLocaleString()} products loaded — nice browsing.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <button
          onClick={backToTop}
          className="inline-flex items-center justify-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-2.5 text-[11px] font-medium text-foreground hover:border-accent hover:text-accent transition-colors"
        >
          <ArrowUp className="size-3.5" /> Back to top
        </button>
        <Link
          to="/products/trending"
          className="inline-flex items-center justify-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-2.5 text-[11px] font-medium text-foreground hover:border-accent hover:text-accent transition-colors"
        >
          <Sparkles className="size-3.5" /> Trending
        </Link>
        <Link
          to="/recommended"
          className="inline-flex items-center justify-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-2.5 text-[11px] font-medium text-foreground hover:border-accent hover:text-accent transition-colors"
        >
          AI Picks
        </Link>
        <Link
          to="/recently-viewed"
          className="inline-flex items-center justify-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-2.5 text-[11px] font-medium text-foreground hover:border-accent hover:text-accent transition-colors"
        >
          Recently viewed
        </Link>
      </div>
    </div>
  );
}
