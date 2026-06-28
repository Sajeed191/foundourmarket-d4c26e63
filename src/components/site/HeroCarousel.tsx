import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles, ArrowRight } from "lucide-react";
import { ProductImage } from "@/components/site/ProductImage";
import { useImagePalette } from "@/lib/use-image-palette";
import { useLowEndDevice, useDeviceTier } from "@/lib/use-low-end-device";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Product } from "@/lib/products";

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
// Apple/Stripe-style premium easing for the showcase transitions.
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const DUR = 600;

/**
 * Premium queue-style 3D product carousel. Picks real products
 * (Featured → Trending → Best Sellers → New Arrivals) and lays them out as a
 * horizontal queue: the active card is centered, largest, sharp; neighbours
 * recede on both sides with progressive scale, blur, grayscale, dimming and a
 * subtle rotateY toward center for cinematic depth. Supports autoplay, drag,
 * swipe and keyboard navigation. UI only — no data fetching, no routing changes.
 */
export function HeroCarousel({ featured, trending, bestSellers, newArrivals, children }: Props) {
  const lowEnd = useLowEndDevice();
  const isMobile = useIsMobile();
  const tier = useDeviceTier();

  const items = useMemo(() => {
    const pool =
      (featured.length && featured) ||
      (trending.length && trending) ||
      (bestSellers.length && bestSellers) ||
      newArrivals;
    return (pool || []).filter((p) => !!p?.image).slice(0, 12);
  }, [featured, trending, bestSellers, newArrivals]);

  const [index, setIndex] = useState(0);
  const pausedRef = useRef(false);
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

  // Auto-rotate.
  useEffect(() => {
    if (items.length <= 1) return;
    const id = window.setInterval(() => {
      if (pausedRef.current) return;
      setIndex((i) => (i + 1) % items.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [items.length]);

  const current = items[index];
  const { palette } = useImagePalette(current?.image);

  // Preload only the immediate next + previous images (per spec). Off-screen
  // cards beyond these are lazy-loaded by the browser via <ProductImage>.
  useEffect(() => {
    if (items.length <= 1) return;
    const n = items.length;
    [items[(index + 1) % n], items[(index - 1 + n) % n]].forEach((p) => {
      if (p?.image) {
        const img = new Image();
        img.src = p.image;
      }
    });
  }, [index, items]);

  const primary = palette.primary || "#ffffff";
  const ambient = `color-mix(in srgb, ${primary} 38%, transparent)`;
  const ambientSoft = `color-mix(in srgb, ${primary} 18%, transparent)`;

  // ── Adaptive performance profile (highest priority) ──
  // Visible products + effect strength scale with the device tier so low-end
  // Android phones stay at 60 FPS while high-end devices get the full show.
  const perf = useMemo(() => {
    // Card COUNT is fixed per spec — always 7 on mobile (3/side) and 9 on
    // desktop (4/side), regardless of device tier, so the queue never collapses
    // to only 3 products. Tier only scales effect *intensity* for performance.
    const maxDepth = isMobile ? 3 : 4;
    const blurScale = tier === "high" ? 1 : tier === "mid" ? 0.7 : 0.4;
    return {
      maxDepth,
      blurScale,
      enableGlow: tier !== "low",
    };
  }, [tier, isMobile]);

  // ── Pointer / touch drag + swipe ──
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
      {/* ── Dynamic ambient background derived from the product image ── */}
      <div aria-hidden className="pointer-events-none absolute top-0 bottom-0 left-1/2 w-screen -translate-x-1/2 -z-0 overflow-hidden">
        {/* full-bleed blurred product backdrop fills the empty side areas */}
        {current?.image && !lowEnd && (
          <img
            src={current.image}
            alt=""
            aria-hidden
            className="absolute inset-0 size-full scale-125 object-cover opacity-[0.14] blur-[64px]"
            style={{ transition: "opacity 800ms ease" }}
          />
        )}
        <div
          className="absolute left-1/2 -top-[20%] -translate-x-1/2 size-[460px] sm:size-[620px] rounded-full blur-[110px]"
          style={{ background: `radial-gradient(circle, ${ambient}, transparent 70%)`, transition: "background 700ms ease", willChange: "background" }}
        />
        <div
          className="absolute left-1/2 top-1/3 -translate-x-1/2 h-[60%] w-[120%]"
          style={{ background: `radial-gradient(ellipse at 50% 30%, ${ambientSoft}, transparent 65%)`, transition: "background 700ms ease" }}
        />
        <div className="absolute left-1/2 -top-[28%] -translate-x-1/2 size-[360px] sm:size-[460px] rounded-full blur-[100px] opacity-40" style={{ background: "radial-gradient(circle, oklch(0.74 0.19 49 / 0.30), transparent 70%)" }} />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background/80 to-transparent" />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center pt-6 sm:pt-9">
        {/* badge */}
        <span
          className="inline-flex h-8 items-center gap-1.5 rounded-full glass-strong px-3.5 text-[10px] font-mono uppercase tracking-[0.22em] text-foreground ring-1 ring-accent/40 animate-fade-in"
          style={{ boxShadow: "0 0 18px -4px oklch(0.74 0.19 49 / 0.5), inset 0 1px 0 oklch(1 0 0 / 0.08)" }}
        >
          <Sparkles className="size-3 text-accent" /> Global Marketplace
        </span>
        <h2 className="mt-4 font-display font-semibold tracking-tight text-balance text-[clamp(1.5rem,5.5vw,2.1rem)] leading-[1.1]">
          Discover Premium Products
        </h2>
        <p className="mt-2 max-w-md text-sm sm:text-base text-muted-foreground text-balance">
          Trusted products from verified sellers worldwide.
        </p>

        {/* ── premium queue-style 3D carousel ── */}
        <div
          ref={stageRef}
          className="hero-stage relative mt-6 sm:mt-8 w-full max-w-none select-none overflow-hidden touch-pan-y outline-none [perspective:1600px]"
          style={{
            height: "calc(var(--card) + 72px)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent 0%, #000 14%, #000 86%, transparent 100%)",
            maskImage:
              "linear-gradient(to right, transparent 0%, #000 14%, #000 86%, transparent 100%)",
          }}
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
          {/* soft halo behind the stage */}
          <div
            aria-hidden
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-[130%] rounded-full blur-3xl opacity-70"
            style={{ background: `radial-gradient(circle, ${ambient}, transparent 68%)`, transition: "background 800ms ease" }}
          />
          {/* subtle radial orange glow directly behind the active product */}
          {perf.enableGlow && (
            <div
              aria-hidden
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[70px] opacity-50"
              style={{ width: "calc(var(--card) * 1.2)", height: "calc(var(--card) * 1.2)", background: "radial-gradient(circle, oklch(0.74 0.19 49 / 0.42), transparent 70%)" }}
            />
          )}

          {items.length === 0 ? (
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[28px] glass-strong ring-1 ring-white/12 animate-pulse"
              style={{ width: "var(--card)", height: "var(--card)" }}
            />
          ) : (
            items.map((p, i) => {
              const n = items.length;
              // Shortest signed ring distance → smooth, jump-free looping.
              let rel = i - index;
              if (rel > n / 2) rel -= n;
              if (rel < -n / 2) rel += n;
              const depth = Math.abs(rel);
              const isCenter = rel === 0;
              const sign = rel === 0 ? 0 : rel < 0 ? -1 : 1;

              const maxDepth = perf.maxDepth;
              const onStage = depth <= maxDepth;
              const parked = depth === maxDepth + 1;
              const visible = onStage || parked;
              const di = Math.min(depth, 5);

              // ── Cinematic size pattern ──
              // Explicit per-position scale tables so products grow smoothly
              // toward the center: S→M→L→XL(center)→L→M→S.
              //   mobile  (3/side): XL, L,  M,  S
              //   desktop (4/side): XL, L,  M,  MS, S
              const SCALE = isMobile
                ? [1.0, 0.8, 0.62, 0.48]
                : [1.0, 0.85, 0.7, 0.58, 0.48];
              const last = SCALE.length - 1;
              const scale = SCALE[Math.min(di, last)];

              // Equal-spacing queue: cumulative center-to-center distance based
              // on adjacent card sizes so gaps stay even as cards shrink.
              const GAP = isMobile ? 0.46 : 0.54;
              let units = 0;
              for (let k = 1; k <= di; k++) {
                units += ((SCALE[Math.min(k - 1, last)] + SCALE[Math.min(k, last)]) / 2) * GAP;
              }
              const xUnits = sign * units;

              // Progressive depth falloff (blur / opacity / brightness / rotateY).
              const opacity = onStage ? Math.max(0.3, 1 - di * 0.18) : 0;
              const rawBlur = isCenter ? 0 : Math.min(3 + (di - 1) * 4, 22);
              const blur = isCenter || lowEnd ? 0 : Math.round(rawBlur * perf.blurScale);
              const gray = isCenter ? 0 : Math.min(0.12 + di * 0.1, 0.45);
              const bright = isCenter ? 1.05 : Math.max(0.62, 1 - di * 0.1);
              const rotateY = isCenter ? 0 : sign * -24;

              return (
                <Link
                  key={p.id}
                  to="/products/$slug"
                  params={{ slug: p.slug }}
                  aria-hidden={!isCenter}
                  tabIndex={isCenter ? 0 : -1}
                  draggable={false}
                  onClick={(e) => { if (drag.current.moved) e.preventDefault(); }}
                  className={`group absolute left-1/2 top-1/2 ${isCenter && !lowEnd ? "animate-float-soft" : ""}`}
                  style={{
                    width: "var(--card)",
                    height: "var(--card)",
                    marginLeft: "calc(var(--card) / -2)",
                    marginTop: "calc(var(--card) / -2)",
                    transform: `translate3d(calc(var(--card) * ${xUnits}), 0, 0) scale(${scale}) rotateY(${rotateY}deg)`,
                    opacity,
                    filter: lowEnd
                      ? "none"
                      : `blur(${blur}px) grayscale(${gray}) brightness(${bright}) drop-shadow(0 ${isCenter ? 26 : 12}px ${isCenter ? 44 : 22}px oklch(0 0 0 / ${isCenter ? 0.5 : 0.34}))`,
                    zIndex: 10 - depth,
                    pointerEvents: isCenter ? "auto" : "none",
                    visibility: visible ? "visible" : "hidden",
                    transition: lowEnd
                      ? `opacity ${DUR}ms ease`
                      : `transform ${DUR}ms ${EASE}, opacity ${DUR}ms ${EASE}, filter ${DUR}ms ${EASE}`,
                    willChange: visible && !lowEnd ? "transform, opacity, filter" : "auto",
                  }}
                >
                  <div
                    className="relative z-[1] size-full overflow-hidden rounded-[26px]"
                    style={{
                      background: isCenter
                        ? `linear-gradient(160deg, ${ambientSoft}, color-mix(in srgb, ${primary} 30%, transparent))`
                        : "color-mix(in srgb, oklch(0.2 0.01 262) 60%, transparent)",
                      boxShadow: isCenter && perf.enableGlow
                        ? `0 0 0 1px oklch(1 0 0 / 0.06), 0 0 40px -6px oklch(0.74 0.19 49 / 0.55)`
                        : "0 0 0 1px oklch(1 0 0 / 0.04)",
                    }}
                  >
                    <ProductImage
                      src={p.image}
                      alt={isCenter ? p.name : ""}
                      width={640}
                      height={640}
                      priority={i === 0}
                      sizes="(min-width: 1025px) 480px, (min-width: 768px) 50vw, 60vw"
                      className="block size-full object-cover object-center transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                    />
                  </div>
                </Link>

              );
            })
          )}
        </div>

        {/* product name + CTA */}
        {current && (
          <div className="mt-5 min-h-[2.5rem] animate-fade-in" key={current.id}>
            <p className="text-sm font-medium text-foreground line-clamp-2 max-w-[280px] mx-auto leading-snug">{current.name}</p>
            <Link
              to="/products/$slug"
              params={{ slug: current.slug }}
              className="view-product-cta group relative mt-3 inline-flex h-11 items-center justify-center gap-1.5 overflow-hidden rounded-full px-6 text-[12px] font-semibold tracking-wide text-foreground outline-none transition-transform duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 active:scale-[0.98]"
            >
              <span aria-hidden className="view-product-cta__shine pointer-events-none absolute inset-0 rounded-full" />
              <span className="relative z-[1]">View Product</span>
              <ArrowRight className="relative z-[1] size-3.5 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </div>
        )}

        {/* dots — active dot fills with a liquid-style progress */}
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
                  className={`relative h-1.5 overflow-hidden rounded-full transition-[width,background-color] duration-300 ${isActive ? "w-6 bg-white/20" : "w-1.5 bg-white/25 hover:bg-white/40"}`}
                >
                  {isActive && !lowEnd && (
                    <span
                      key={index}
                      aria-hidden
                      className="absolute inset-y-0 left-0 rounded-full bg-accent"
                      style={{
                        animation: `dot-fill ${ROTATE_MS}ms linear forwards`,
                        boxShadow: "0 0 10px -2px oklch(0.74 0.19 49 / 0.8)",
                      }}
                    />
                  )}
                  {isActive && lowEnd && (
                    <span aria-hidden className="absolute inset-0 rounded-full bg-accent" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* search + chips slot */}
      {children}
    </div>
  );
}
