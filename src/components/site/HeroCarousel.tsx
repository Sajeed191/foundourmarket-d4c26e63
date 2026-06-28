import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles, ArrowRight } from "lucide-react";
import { ProductImage } from "@/components/site/ProductImage";
import { useImagePalette } from "@/lib/use-image-palette";
import { useLowEndDevice } from "@/lib/use-low-end-device";
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

  const items = useMemo(() => {
    const pool =
      (featured.length && featured) ||
      (trending.length && trending) ||
      (bestSellers.length && bestSellers) ||
      newArrivals;
    return (pool || []).filter((p) => !!p?.image).slice(0, 6);
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

  // Preload the next and previous images for a seamless, jump-free transition.
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
        {/* dark gradient overlays for a premium, immersive frame */}
        <div className="absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-background/90 to-transparent" />
        <div className="absolute inset-y-0 right-0 w-1/4 bg-gradient-to-l from-background/90 to-transparent" />
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
          className="hero-stage relative mt-6 sm:mt-8 w-full max-w-[560px] sm:max-w-[760px] select-none overflow-hidden [perspective:1400px]"
          style={{ ["--card" as string]: "clamp(132px, 52vw, 258px)", height: "calc(var(--card) + 56px)" }}
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
          {/* subtle radial orange glow directly behind the active product */}
          <div
            aria-hidden
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[70px] opacity-50"
            style={{ width: "calc(var(--card) * 1.2)", height: "calc(var(--card) * 1.2)", background: "radial-gradient(circle, oklch(0.74 0.19 49 / 0.42), transparent 70%)" }}
          />

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
              const isCenter = rel === 0;
              const isSide = rel === -1 || rel === 1;
              const visible = isCenter || isSide;
              const sign = rel === 0 ? 0 : rel < 0 ? -1 : 1;
              // Side cards peek ~30% from each edge; far cards park just offscreen.
              const xFactor = isCenter ? 0 : sign * (isSide ? 0.6 : 1.05);
              const scale = isCenter ? 1 : isSide ? 0.83 : 0.72;
              const opacity = isCenter ? 1 : isSide ? 0.4 : 0;
              const blur = isCenter || lowEnd ? 0 : isSide ? 14 : 18;
              const rot = isCenter ? 0 : sign * -5;
              return (
                <Link
                  key={p.id}
                  to="/products/$slug"
                  params={{ slug: p.slug }}
                  aria-hidden={!isCenter}
                  tabIndex={isCenter ? 0 : -1}
                  className={`group absolute left-1/2 top-1/2 overflow-hidden rounded-[28px] glass-strong ring-1 ring-white/15 ${isCenter ? "shadow-[var(--shadow-float),0_0_80px_-16px_oklch(0.74_0.19_49/0.55)]" : "shadow-[var(--shadow-float)]"} ${isCenter && !lowEnd ? "animate-float-soft" : ""}`}
                  style={{
                    width: "var(--card)",
                    height: "var(--card)",
                    marginLeft: "calc(var(--card) / -2)",
                    marginTop: "calc(var(--card) / -2)",
                    transform: `translate3d(calc(var(--card) * ${xFactor}), 0, 0) scale(${scale}) rotate(${rot}deg)`,
                    opacity,
                    filter: blur ? `blur(${blur}px)` : "blur(0px)",
                    zIndex: isCenter ? 5 : isSide ? 2 : 0,
                    pointerEvents: isCenter ? "auto" : "none",
                    visibility: visible ? "visible" : "hidden",
                    background: palette.background,
                    transition: lowEnd
                      ? "opacity 300ms ease"
                      : `transform 800ms ${EASE}, opacity 800ms ${EASE}, filter 800ms ${EASE}`,
                    willChange: "transform, opacity, filter",
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
                  <ProductImage
                    src={p.image}
                    alt={isCenter ? p.name : ""}
                    width={560}
                    height={560}
                    priority={i === 0}
                    sizes="(min-width: 640px) 258px, 52vw"
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
