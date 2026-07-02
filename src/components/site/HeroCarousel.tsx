import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { ProductImage } from "@/components/site/ProductImage";
import { useFlag } from "@/lib/use-debug-flag";
import type { Product } from "@/lib/products";
import { useRenderDiagnostics } from "@/lib/startup-diagnostics";
import { useMotionTier } from "@/lib/motion-tier";

type Props = {
  /** Pre-prioritized product pools. First non-empty wins. */
  featured: Product[];
  trending: Product[];
  bestSellers: Product[];
  newArrivals: Product[];
  /** Search + chips slot rendered below the showcase. */
  children?: React.ReactNode;
};

const ROTATE_MS = 4500;

/**
 * Lightweight single-card product showcase.
 *
 * ONE responsive design used on every device — phones, tablets, laptops,
 * desktops. No device-capability detection, no GPU/blur/backdrop-filter, no
 * stacked 3D layers. A single centered product card crossfades between products
 * using transform + opacity only, keeping scrolling at 60 FPS even on
 * entry-level Android. Images are lazy-loaded (the active one is prioritized).
 * Supports autoplay, swipe and keyboard navigation. UI only.
 */
export function HeroCarousel({ featured, trending, bestSellers, newArrivals, children }: Props) {
  useRenderDiagnostics("HeroCarousel", {
    featured: featured.length,
    trending: trending.length,
    bestSellers: bestSellers.length,
    newArrivals: newArrivals.length,
  });

  const ffJsAnimations = useFlag("jsAnimations");
  const motionTier = useMotionTier();

  const items = useMemo(() => {
    const pool =
      (featured.length && featured) ||
      (trending.length && trending) ||
      (bestSellers.length && bestSellers) ||
      newArrivals;
    return (pool || []).filter((p) => !!p?.image).slice(0, 8);
  }, [featured, trending, bestSellers, newArrivals]);

  const [index, setIndex] = useState(0);
  const pausedRef = useRef(false);
  const offscreenRef = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);

  // Reset when the pool changes.
  useEffect(() => {
    setIndex(0);
  }, [items.length]);

  const go = useCallback(
    (dir: number) => {
      setIndex((i) => {
        const n = items.length;
        if (n <= 1) return i;
        return (i + dir + n) % n;
      });
    },
    [items.length],
  );

  // Pause autoplay while off-screen so it never animates frames the user can't see.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        offscreenRef.current = !entry.isIntersecting;
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Auto-rotate.
  useEffect(() => {
    if (!ffJsAnimations || items.length <= 1) return;
    const id = window.setInterval(() => {
      if (pausedRef.current || offscreenRef.current) return;
      setIndex((i) => (i + 1) % items.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [items.length, ffJsAnimations]);

  // Preload the immediate next image so the crossfade is instant.
  useEffect(() => {
    if (items.length <= 1) return;
    const next = items[(index + 1) % items.length];
    if (next?.image) {
      const img = new Image();
      img.src = next.image;
    }
  }, [index, items]);

  const current = items[index];

  // ── Pointer / touch swipe ──
  const drag = useRef<{ active: boolean; startX: number; moved: boolean }>({
    active: false,
    startX: 0,
    moved: false,
  });

  const onPointerDown = (e: React.PointerEvent) => {
    if (items.length <= 1) return;
    drag.current = { active: true, startX: e.clientX, moved: false };
    pausedRef.current = true;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 50 && !drag.current.moved) {
      drag.current.moved = true;
      go(dx < 0 ? 1 : -1);
    }
  };
  const endDrag = () => {
    if (drag.current.active) drag.current.active = false;
    pausedRef.current = false;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    }
  };

  return (
    <div className="relative mx-auto max-w-[1280px]">
      <div className="relative z-10 flex flex-col items-center text-center pt-6 sm:pt-9">
        {/* badge */}
        <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-accent/35 bg-card px-3.5 text-[10px] font-mono uppercase tracking-[0.22em] text-foreground">
          <Sparkles className="size-3 text-accent" /> Global Marketplace
        </span>
        <h2 className="mt-4 font-display font-semibold tracking-tight text-balance text-[clamp(1.5rem,5.5vw,2.1rem)] leading-[1.1]">
          Discover Premium Products
        </h2>
        <p className="mt-2 max-w-md text-sm sm:text-base text-muted-foreground text-balance">
          Trusted products from verified sellers worldwide.
        </p>

        {/* ── single-card product showcase ── */}
        <div
          ref={stageRef}
          className="hero-stage relative mt-6 sm:mt-8 w-full select-none outline-none"
          role="group"
          aria-roledescription="carousel"
          aria-label="Featured products"
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={endDrag}
          onMouseEnter={() => { pausedRef.current = true; }}
          onMouseLeave={() => { if (!drag.current.active) pausedRef.current = false; }}
        >
          <div
            className="relative mx-auto touch-pan-y"
            style={{ width: "var(--card)", height: "var(--card)" }}
          >
            {items.length === 0 ? (
              <div
                className="absolute inset-0 rounded-[26px] border border-white/10 bg-card animate-pulse"
              />
            ) : (
              current && (
                <Link
                  key={current.id}
                  to="/products/$slug"
                  params={{ slug: current.slug }}
                  draggable={false}
                  onClick={(e) => { if (drag.current.moved) e.preventDefault(); }}
                  className="absolute inset-0 block overflow-hidden rounded-[26px] border border-white/10 bg-card shadow-md animate-fade-in"
                >
                  <ProductImage
                    src={current.image}
                    alt={current.name}
                    width={640}
                    height={640}
                    priority
                    debugId={`hero#${index}`}
                    sizes="(min-width: 1025px) 480px, (min-width: 768px) 50vw, 72vw"
                    className="block size-full object-cover object-center"
                  />
                </Link>
              )
            )}
          </div>

          {/* prev / next — desktop / pointer affordance, lightweight */}
          {items.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous product"
                onClick={() => go(-1)}
                className="absolute left-1 sm:left-3 top-1/2 -translate-y-1/2 hidden sm:grid size-10 place-items-center rounded-full border border-white/10 bg-card/90 text-foreground transition-colors hover:bg-card active:scale-95"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                aria-label="Next product"
                onClick={() => go(1)}
                className="absolute right-1 sm:right-3 top-1/2 -translate-y-1/2 hidden sm:grid size-10 place-items-center rounded-full border border-white/10 bg-card/90 text-foreground transition-colors hover:bg-card active:scale-95"
              >
                <ChevronRight className="size-5" />
              </button>
            </>
          )}
        </div>

        {/* Reserved-height container prevents layout shift when content loads. */}
        <div className="min-h-[8.75rem]">
          {current && (
            <div className="mt-5 min-h-[2.5rem] animate-fade-in" key={current.id}>
              <p className="text-sm font-medium text-foreground line-clamp-2 max-w-[280px] mx-auto leading-snug">{current.name}</p>
              <Link
                to="/products/$slug"
                params={{ slug: current.slug }}
                className="group mt-3 inline-flex h-11 items-center justify-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-6 text-[12px] font-semibold tracking-wide text-foreground transition-colors hover:bg-accent/15 active:scale-[0.98]"
              >
                <span>View Product</span>
                <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </div>
          )}

          {items.length > 1 && (
            <div className="mt-3 flex items-center justify-center gap-1.5" role="tablist" aria-label="Product slides">
              {items.map((p, i) => {
                const isActive = i === index;
                return (
                  <button
                    key={p.id}
                    role="tab"
                    aria-selected={isActive}
                    aria-label={`Show product ${i + 1}`}
                    onClick={() => setIndex(i)}
                    className={`h-1.5 rounded-full transition-[width,background-color] duration-300 ${isActive ? "w-6 bg-accent" : "w-1.5 bg-white/25 hover:bg-white/40"}`}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* search + chips slot */}
      {children}
    </div>
  );
}
