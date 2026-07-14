import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Loader2, Check, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { trackEvent } from "@/lib/visitor";


/**
 * Premium "Load More" continuation experience.
 *
 *  - Elegant centered copy ("Showing X of Y", "N more products waiting").
 *  - Premium pill CTA (60px, orange gradient, soft glow, gentle idle pulse).
 *  - Smart click flow: button → spinner → prefetch → fade out → new cards
 *    stagger in below the fold and the viewport smoothly settles so the FIRST
 *    newly loaded card sits near the top of the viewport (never scrolls to
 *    page top).
 *  - Soft highlight glow on the newly loaded row fades out after ~1.5s.
 *  - Floating toast "✨ N new products loaded" auto-dismisses after 2s.
 *  - Silent prefetch when the section approaches within ~400px of the viewport
 *    (best-effort; the actual data owner controls fetch semantics).
 *  - Adaptive labels: Load More / Load Final / Show Last / End.
 *  - a11y: aria-live announcement, keyboard-focusable, disabled states,
 *    prefers-reduced-motion respected.
 */

type Props = {
  visible: number;
  total: number;
  pageSize: number;
  onLoadMore: () => void | Promise<void>;
  onPrefetch?: () => void;
  loading?: boolean;
  analyticsSource?: string;
};

export function LoadMoreSection({
  visible,
  total,
  pageSize,
  onLoadMore,
  onPrefetch,
  loading: externalLoading = false,
  analyticsSource = "search",
}: Props) {
  const remaining = Math.max(0, total - visible);
  const nextBatch = Math.min(pageSize, remaining);
  const done = remaining === 0;

  const [busy, setBusy] = useState(false);
  const loading = busy || externalLoading;

  const sectionRef = useRef<HTMLElement | null>(null);
  const prevVisibleRef = useRef(visible);
  const pendingHighlightRef = useRef<number | null>(null);
  const [toast, setToast] = useState<{ n: number; id: number } | null>(null);
  const [announce, setAnnounce] = useState("");

  // ─── Silent prefetch when the section is within ~400px of viewport ───
  const prefetchedRef = useRef(false);
  useEffect(() => {
    if (done || !onPrefetch) return;
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    prefetchedRef.current = false;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !prefetchedRef.current) {
            prefetchedRef.current = true;
            try { onPrefetch(); } catch { /* noop */ }
          }
        }
      },
      { rootMargin: "400px 0px 400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [done, onPrefetch, visible]);

  // ─── After a load completes, animate new cards + scroll into view ───
  useEffect(() => {
    const prev = prevVisibleRef.current;
    if (visible <= prev) {
      prevVisibleRef.current = visible;
      return;
    }
    const added = visible - prev;
    prevVisibleRef.current = visible;

    // Defer to next frame so freshly appended DOM nodes exist.
    const raf = requestAnimationFrame(() => {
      const cards = Array.from(
        document.querySelectorAll<HTMLElement>("[data-product-card]"),
      );
      const newCards = cards.slice(prev, prev + added);
      const reduce =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

      newCards.forEach((el, i) => {
        if (!reduce) {
          el.style.animation = `fom-loadmore-in 440ms cubic-bezier(0.22,1,0.36,1) ${Math.min(i, 12) * 45}ms both`;
        }
      });

      // Highlight the first newly loaded row (first 2 cards on mobile, up to 4 on desktop).
      const rowSize = window.innerWidth >= 1280 ? 4 : window.innerWidth >= 768 ? 3 : 2;
      newCards.slice(0, rowSize).forEach((el) => {
        el.classList.add("fom-new-row-glow");
        window.setTimeout(() => el.classList.remove("fom-new-row-glow"), 1600);
      });

      // Smart scroll: settle viewport so the first NEW card is near top.
      const first = newCards[0];
      if (first) {
        const rect = first.getBoundingClientRect();
        const topOffset = 96; // clear sticky header
        const y = window.scrollY + rect.top - topOffset;
        window.scrollTo({ top: y, behavior: reduce ? "auto" : "smooth" });
      }
    });

    setToast({ n: added, id: Date.now() });
    setAnnounce(`${added} more products loaded.`);
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const handleLoad = useCallback(async () => {
    if (loading || done) return;
    try {
      (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate?.(10);
    } catch { /* noop */ }

    pendingHighlightRef.current = visible;
    setBusy(true);
    void trackEvent("catalog_load_more_click", {
      metadata: { source: analyticsSource, visible, total, remaining, next_batch: nextBatch },
    });

    // Small deliberate pause so the button transition reads as premium.
    await new Promise((r) => setTimeout(r, 180));
    try {
      await onLoadMore();
    } finally {
      // Release busy on next frame — the visible-change effect handles the rest.
      requestAnimationFrame(() => setBusy(false));
    }
  }, [loading, done, visible, total, remaining, nextBatch, analyticsSource, onLoadMore]);

  // Announce end-of-catalog once.
  const endLoggedRef = useRef(false);
  useEffect(() => {
    if (done && !endLoggedRef.current) {
      endLoggedRef.current = true;
      void trackEvent("catalog_load_more_end", { metadata: { source: analyticsSource, total } });
    }
  }, [done, analyticsSource, total]);

  const buttonLabel = useMemo(() => {
    if (loading) return "Loading more products…";
    if (remaining <= 10) return `Show Last ${remaining} Product${remaining === 1 ? "" : "s"}`;
    if (remaining < 50) return `Load Final ${nextBatch} Products`;
    return `Load ${nextBatch} More Products`;
  }, [loading, remaining, nextBatch]);

  return (
    <section
      ref={sectionRef}
      aria-label="Load more products"
      className="mt-16 sm:mt-20 mb-6 flex flex-col items-center"
    >
      {/* Live region for screen readers */}
      <span className="sr-only" role="status" aria-live="polite">{announce}</span>

      {!done ? (
        <>
          {/* Elegant progress copy */}
          <div className="text-center px-4">
            <p className="text-[13px] sm:text-sm font-medium text-foreground/85 tabular-nums tracking-tight">
              Showing <span className="font-semibold text-foreground">{visible.toLocaleString()}</span>
              {" "}of <span className="font-semibold text-foreground">{total.toLocaleString()}</span> products
            </p>
            <p className="mt-1.5 text-[11px] sm:text-[12px] font-mono uppercase tracking-[0.22em] text-muted-foreground/80 tabular-nums">
              {remaining.toLocaleString()} more product{remaining === 1 ? "" : "s"} waiting
            </p>
          </div>

          {/* Premium CTA — slides down + fades while loading */}
          <div
            className={[
              "mt-7 sm:mt-8 transition-all duration-300 ease-out will-change-transform",
              loading ? "translate-y-2 opacity-70" : "translate-y-0 opacity-100",
            ].join(" ")}
          >
            <button
              type="button"
              onClick={handleLoad}
              disabled={loading}
              aria-busy={loading}
              aria-label={buttonLabel}
              className={[
                "group relative inline-flex items-center justify-center gap-2.5 overflow-hidden",
                "h-[60px] min-h-[44px] w-[min(360px,calc(100vw-2rem))]",
                "rounded-[999px] px-8 text-[15px] font-semibold text-white",
                "bg-[linear-gradient(135deg,hsl(24_95%_58%),hsl(20_100%_50%))]",
                "shadow-[0_18px_40px_-16px_hsl(24_95%_53%/0.55),0_0_0_1px_hsl(24_95%_60%/0.35)_inset]",
                "transition-[transform,box-shadow,filter] duration-300 ease-out",
                "hover:-translate-y-0.5 hover:scale-[1.015]",
                "hover:shadow-[0_28px_64px_-18px_hsl(24_95%_53%/0.8),0_0_0_1px_hsl(24_95%_65%/0.5)_inset]",
                "active:scale-[0.985] active:translate-y-0",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                "disabled:cursor-wait",
                !loading ? "fom-cta-pulse" : "",
              ].join(" ")}
            >
              {/* Ambient glow */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-full opacity-60 blur-2xl bg-[radial-gradient(closest-side,hsl(24_95%_58%/0.6),transparent_70%)] group-hover:opacity-95 transition-opacity"
              />
              {/* Sheen */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-1 top-[2px] h-1/2 rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.35),rgba(255,255,255,0))]"
              />
              <span className="relative z-[1] flex items-center gap-2.5">
                {loading ? (
                  <Loader2 className="size-[18px] animate-spin" aria-hidden />
                ) : (
                  <ArrowDown
                    className="size-[16px] transition-transform duration-500 group-hover:translate-y-0.5 fom-arrow-bounce"
                    aria-hidden
                  />
                )}
                <span className="tracking-[-0.01em]">{buttonLabel}</span>
              </span>
            </button>
          </div>
        </>
      ) : (
        <EndOfCatalog total={total} />
      )}

      {/* Floating toast: "✨ N new products loaded" */}
      <div
        aria-hidden={!toast}
        className={[
          "pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center transition-all duration-300",
          toast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
        ].join(" ")}
      >
        {toast && (
          <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-accent/40 bg-background/85 px-4 py-2 text-[12px] font-medium text-foreground shadow-[0_10px_30px_-10px_hsl(24_95%_53%/0.5)] backdrop-blur-md">
            <Sparkles className="size-3.5 text-accent" aria-hidden />
            <span>{toast.n} new products loaded</span>
          </div>
        )}
      </div>

      {/* Scoped premium animations. Do not export — keeps design system clean. */}
      <style>{`
        @keyframes fom-loadmore-in {
          0%   { opacity: 0; transform: translateY(18px) scale(0.985); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fom-cta-pulse {
          0%,100% { box-shadow: 0 18px 40px -16px hsl(24 95% 53% / 0.55), 0 0 0 1px hsl(24 95% 60% / 0.35) inset, 0 0 0 0 hsl(24 95% 58% / 0.35); }
          50%     { box-shadow: 0 18px 40px -16px hsl(24 95% 53% / 0.6),  0 0 0 1px hsl(24 95% 60% / 0.4)  inset, 0 0 0 10px hsl(24 95% 58% / 0); }
        }
        .fom-cta-pulse { animation: fom-cta-pulse 3.4s ease-in-out infinite; }
        @keyframes fom-arrow-bounce {
          0%,100% { transform: translateY(0); }
          50%     { transform: translateY(2px); }
        }
        .fom-arrow-bounce { animation: fom-arrow-bounce 2.6s ease-in-out infinite; }
        @keyframes fom-row-glow {
          0%   { box-shadow: 0 0 0 0 hsl(24 95% 58% / 0), 0 0 0 0 hsl(24 95% 58% / 0); background-color: hsl(24 95% 58% / 0.10); }
          40%  { box-shadow: 0 0 0 1px hsl(24 95% 60% / 0.45), 0 18px 44px -14px hsl(24 95% 53% / 0.45); background-color: hsl(24 95% 58% / 0.06); }
          100% { box-shadow: 0 0 0 0 hsl(24 95% 58% / 0), 0 0 0 0 hsl(24 95% 58% / 0); background-color: transparent; }
        }
        .fom-new-row-glow { animation: fom-row-glow 1500ms ease-out both; border-radius: 14px; }
        @media (prefers-reduced-motion: reduce) {
          .fom-cta-pulse, .fom-arrow-bounce, .fom-new-row-glow { animation: none !important; }
        }
      `}</style>
    </section>
  );
}

function EndOfCatalog({ total }: { total: number }) {
  return (
    <div className="w-full animate-[fade-in_400ms_ease-out]">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-accent/10 ring-1 ring-accent/30">
          <Check className="size-6 text-accent" aria-hidden />
        </div>
        <p className="text-base font-semibold text-foreground">
          You've explored every product in this category
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          All {total.toLocaleString()} products loaded.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Link to="/products/trending" className="rounded-full border border-border bg-card/60 px-3.5 py-2 text-[11px] font-medium hover:border-accent hover:text-accent transition-colors">Trending</Link>
          <Link to="/recommended" className="rounded-full border border-border bg-card/60 px-3.5 py-2 text-[11px] font-medium hover:border-accent hover:text-accent transition-colors">AI Picks</Link>
          <Link to="/recently-viewed" className="rounded-full border border-border bg-card/60 px-3.5 py-2 text-[11px] font-medium hover:border-accent hover:text-accent transition-colors">Recently viewed</Link>
        </div>
      </div>

    </div>
  );
}
