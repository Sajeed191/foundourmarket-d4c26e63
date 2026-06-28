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

  // Preload the next image for a seamless transition.
  useEffect(() => {
    if (items.length <= 1) return;
    const next = items[(index + 1) % items.length];
    if (next?.image) {
      const img = new Image();
      img.src = next.image;
    }
  }, [index, items]);

  const primary = palette.primary || "#ffffff";
  const ambient = `color-mix(in srgb, ${primary} 38%, transparent)`;
  const ambientSoft = `color-mix(in srgb, ${primary} 18%, transparent)`;

  return (
    <div className="relative mx-auto max-w-[1100px]">
      {/* ── Dynamic ambient background derived from the product image ── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
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

        {/* ── layered product showcase ── */}
        <div
          className="relative mt-6 sm:mt-8 w-full max-w-[440px] sm:max-w-[560px] h-[260px] sm:h-[320px] select-none overflow-hidden"
          style={{ perspective: "1200px" }}
          role="group"
          aria-roledescription="carousel"
          aria-label="Featured products"
          onMouseEnter={() => { pausedRef.current = true; }}
          onMouseLeave={() => { pausedRef.current = false; }}
        >
          {/* soft halo behind the stage */}
          <div
            aria-hidden
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-[110%] rounded-full blur-3xl opacity-70"
            style={{ background: `radial-gradient(circle, ${ambient}, transparent 70%)`, transition: "background 700ms ease" }}
          />

          {items.length === 0 ? (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-[220px] sm:size-[300px] rounded-[24px] glass-strong ring-1 ring-white/12 animate-pulse" />
          ) : (
            items.map((p, i) => {
              const len = items.length;
              // relative position: 0 = center, 1 = right, len-1 = left, else hidden
              const offset = (i - index + len) % len;
              const isCenter = offset === 0;
              const isRight = offset === 1 && len > 1;
              const isLeft = offset === len - 1 && len > 2;
              const visible = isCenter || isRight || isLeft;

              // depth transform per role — all anchored at left:50%/top:50% then
              // nudged sideways in px so side cards stay clipped inside the stage
              // (no horizontal page overflow on small screens).
              let transform = "translate(-50%, -50%) scale(0.6)";
              let opacity = 0;
              let blur = "blur(16px)";
              let z = 0;
              if (isCenter) {
                transform = "translate(-50%, -50%) scale(1) rotate(0deg)";
                opacity = 1;
                blur = "blur(0px)";
                z = 3;
              } else if (isRight) {
                transform = lowEnd
                  ? "translate(calc(-50% + 92px), -50%) scale(0.8)"
                  : "translate(calc(-50% + 116px), -50%) scale(0.8) rotate(8deg)";
                opacity = lowEnd ? 0.2 : 0.25;
                blur = lowEnd ? "blur(0px)" : "blur(14px)";
                z = 1;
              } else if (isLeft) {
                transform = lowEnd
                  ? "translate(calc(-50% - 92px), -50%) scale(0.8)"
                  : "translate(calc(-50% - 116px), -50%) scale(0.8) rotate(-8deg)";
                opacity = lowEnd ? 0.2 : 0.25;
                blur = lowEnd ? "blur(0px)" : "blur(14px)";
                z = 1;
              }


              return (
                <Link
                  key={p.id}
                  to="/products/$slug"
                  params={{ slug: p.slug }}
                  aria-hidden={!isCenter}
                  tabIndex={isCenter ? 0 : -1}
                  className={`group absolute left-1/2 top-1/2 size-[240px] sm:size-[300px] overflow-hidden rounded-[24px] glass-strong ring-1 ${isCenter ? "ring-white/15 shadow-[var(--shadow-float),0_0_70px_-16px_oklch(0.74_0.19_49/0.6)]" : "ring-white/8 shadow-[0_20px_50px_-20px_oklch(0_0_0/0.8),0_0_50px_-20px_oklch(0.74_0.19_49/0.5)]"} ${isCenter && !lowEnd ? "animate-float-soft" : ""}`}
                  style={{
                    transform,
                    opacity,
                    filter: blur,
                    zIndex: z,
                    pointerEvents: isCenter ? "auto" : "none",
                    visibility: visible ? "visible" : "hidden",
                    background: isCenter ? palette.background : undefined,
                    transition: `transform 850ms ${EASE}, opacity 850ms ${EASE}, filter 850ms ${EASE}`,
                    willChange: "transform, opacity, filter",
                  }}
                >
                  {isCenter && (
                    <div className="pointer-events-none absolute inset-x-0 top-0 z-[3] h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
                  )}
                  <ProductImage
                    src={p.image}
                    alt={p.name}
                    width={520}
                    height={520}
                    priority={i === 0}
                    className="relative z-[1] block size-full object-contain object-center p-[6%] transition-transform duration-500 ease-out group-hover:scale-[1.04]"
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
              className="group relative mt-3 inline-flex items-center justify-center gap-1.5 h-10 px-6 rounded-full text-accent-foreground text-[12px] font-semibold tracking-wide overflow-hidden transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.97]"
              style={{
                background: "var(--gradient-ember, linear-gradient(135deg, oklch(0.78 0.18 55), oklch(0.68 0.2 38)))",
                boxShadow: "0 8px 24px -8px oklch(0.74 0.19 49 / 0.7), inset 0 1px 0 oklch(1 0 0 / 0.25)",
              }}
            >
              <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              <span className="relative">View Product</span>
              <ArrowRight className="relative size-3.5 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </div>
        )}

        {/* dots */}
        {items.length > 1 && (
          <div className="mt-3 flex items-center justify-center gap-1.5">
            {items.map((p, i) => (
              <button
                key={p.id}
                aria-label={`Show product ${i + 1}`}
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? "w-5 bg-accent shadow-[0_0_10px_-2px_oklch(0.74_0.19_49/0.8)]" : "w-1.5 bg-white/25 hover:bg-white/40"}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* search + chips slot */}
      {children}
    </div>
  );
}
