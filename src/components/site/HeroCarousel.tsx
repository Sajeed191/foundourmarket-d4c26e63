import { useEffect, useMemo, useRef, useState } from "react";
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

const ROTATE_MS = 3000;
// Apple/Stripe-style premium easing for the showcase crossfade.
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";


/**
 * Premium rotating hero showcase. Picks real products (Featured → Trending →
 * Best Sellers → New Arrivals), rotates every 4s with a cinematic fade/zoom/
 * blur transition, and derives the ambient background from each product image's
 * dominant color. UI only — no data fetching, no routing changes.
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

  // Reset when the pool changes.
  useEffect(() => {
    setIndex(0);
  }, [items.length]);

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
    // Cards per side: high 4/3, mid 3/2, low 2/1 (desktop/mobile).
    const sideByTier: Record<string, [number, number]> = {
      high: [4, 3],
      mid: [3, 2],
      low: [2, 1],
    };
    const maxDepth = sideByTier[tier][isMobile ? 1 : 0];
    // Blur strength per depth index, attenuated for weaker devices.
    const blurScale = tier === "high" ? 1 : tier === "mid" ? 0.6 : 0.25;
    return {
      maxDepth,
      blurScale,
      // Heavy glow only on high-end; reduced shadows on mid; none on low.
      enableGlow: tier === "high",
      shadowFloat: tier === "low",
    };
  }, [tier, isMobile]);


  return (
    <div className="relative mx-auto max-w-[1280px]">
      {/* ── Dynamic ambient background derived from the product image ── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
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
        {/* warm orange anchor glow so the brand accent always reads */}
        <div className="absolute left-1/2 -top-[28%] -translate-x-1/2 size-[360px] sm:size-[460px] rounded-full blur-[100px] opacity-40" style={{ background: "radial-gradient(circle, oklch(0.74 0.19 49 / 0.30), transparent 70%)" }} />
        {/* subtle bottom fade only — sides stay uniform with the page background */}
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

        {/* ── premium infinite product carousel: prev / active / next ── */}
        {/* `--card` drives every element so the stage scales fluidly and stays
            centered from 320px → 4K, never cropping, overflowing, or shifting. */}
        <div
          className="hero-stage relative mt-6 sm:mt-8 w-full max-w-none select-none overflow-hidden [perspective:1600px]"
          style={{ ["--card" as string]: "clamp(100px, 38vw, 240px)", height: "calc(var(--card) + 56px)" }}
          role="group"
          aria-roledescription="carousel"
          aria-label="Featured products"
          onMouseEnter={() => { pausedRef.current = true; }}
          onMouseLeave={() => { pausedRef.current = false; }}
        >
          {/* soft halo behind the stage */}
          <div
            aria-hidden
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-[130%] rounded-full blur-3xl opacity-70"
            style={{ background: `radial-gradient(circle, ${ambient}, transparent 68%)`, transition: "background 800ms ease" }}
          />
          {/* subtle radial orange glow directly behind the active product
              (heavy glow on high-end devices only) */}
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

              // Cards per side scale with device tier (see `perf`).
              const maxDepth = perf.maxDepth;

              // Progressive depth tables (index 0 == first side card).
              // POS = horizontal offset in card-widths. Spaced so each card
              // overlaps its neighbour by only ~15-20% and stays clearly
              // visible — never fully hidden behind the center card.
              const POS = [0.0, 0.8, 1.46, 2.04, 2.54];
              const SCALE = [1, 0.9, 0.82, 0.74, 0.66];
              const OPACITY = [1, 0.7, 0.55, 0.4, 0.25];
              const BLUR = [0, 4, 8, 12, 16];

              const onStage = depth <= maxDepth;
              const di = Math.min(depth, 4);
              // Cards just past the visible range park offscreen so they can
              // slide in seamlessly (no flicker / jump on loop).
              const parked = depth === maxDepth + 1;

              const parkedX = POS[Math.min(maxDepth, 4)] + 0.6;
              const xFactor = isCenter ? 0 : sign * (parked ? parkedX : POS[di]);
              const scale = parked ? SCALE[Math.min(maxDepth, 4)] : SCALE[di];
              const opacity = onStage ? OPACITY[di] : 0;
              const rawBlur = onStage ? BLUR[di] : BLUR[Math.min(maxDepth, 4)];
              const blur = isCenter || lowEnd ? 0 : Math.round(rawBlur * perf.blurScale);
              const rot = isCenter ? 0 : sign * -(di * 4);
              const darken = isCenter ? 0 : Math.min(0.12 * di, 0.5);
              const visible = onStage || parked;
              return (
                <Link
                  key={p.id}
                  to="/products/$slug"
                  params={{ slug: p.slug }}
                  aria-hidden={!isCenter}
                  tabIndex={isCenter ? 0 : -1}
                  className={`group absolute left-1/2 top-1/2 overflow-hidden rounded-[28px] glass-strong ring-1 ring-white/15 ${isCenter ? (perf.enableGlow ? "shadow-[var(--shadow-float),0_0_80px_-16px_oklch(0.74_0.19_49/0.55)]" : "shadow-[var(--shadow-float)]") : ""} ${isCenter && !lowEnd ? "animate-float-soft" : ""}`}
                  style={{
                    width: "var(--card)",
                    height: "var(--card)",
                    marginLeft: "calc(var(--card) / -2)",
                    marginTop: "calc(var(--card) / -2)",
                    transform: `translate3d(calc(var(--card) * ${xFactor}), 0, 0) scale(${scale}) rotate(${rot}deg)`,
                    opacity,
                    filter: blur ? `blur(${blur}px)` : "blur(0px)",
                    zIndex: 10 - depth,
                    pointerEvents: isCenter ? "auto" : "none",
                    visibility: visible ? "visible" : "hidden",
                    background: palette.background,
                    transition: lowEnd
                      ? "opacity 300ms ease"
                      : `transform 800ms ${EASE}, opacity 800ms ${EASE}, filter 800ms ${EASE}`,
                    willChange: visible && !lowEnd ? "transform, opacity, filter" : "auto",
                  }}
                >
                  {isCenter && (
                    <>
                      {/* glossy top sheen */}
                      <div className="pointer-events-none absolute inset-x-0 top-0 z-[3] h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
                      {/* gentle reflection at the base */}
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-1/3 bg-gradient-to-t from-white/5 to-transparent" />
                    </>
                  )}
                  {/* progressive darkening on side cards for depth */}
                  {darken > 0 && (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 z-[2] rounded-[28px]"
                      style={{ background: `oklch(0.12 0.02 270 / ${darken})` }}
                    />
                  )}
                  <ProductImage
                    src={p.image}
                    alt={isCenter ? p.name : ""}
                    width={560}
                    height={560}
                    priority={i === 0}
                    sizes="(min-width: 640px) 244px, 44vw"
                    className="relative z-[1] block size-full object-contain object-center p-[7%] transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                  />
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
              {/* periodic shine sweep */}
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
