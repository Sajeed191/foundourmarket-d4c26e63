// ─────────────────────────────────────────────────────────────────────────────
// TEMPORARY FORENSIC DIAGNOSTIC ROUTE — /home-lite
//
// Purpose: isolate whether the Chrome 149 Android GPU-raster corruption depends
// on SPECIFIC page content or on TOTAL PAINTED AREA of the document scroll layer.
//
// This route reuses the EXACT production application shell automatically — Nav,
// Footer, MobileBottomNav, LiveChat, every provider and the root layout are
// injected by src/routes/__root.tsx for every route, so nothing shell-related is
// copied here. Only the minimum Hero + Trending JSX/logic is DUPLICATED (copied,
// not moved) from src/routes/index.tsx so production Home stays byte-for-byte
// untouched.
//
// The whole experiment is removable by deleting THIS FILE only.
//
//   TEST_STAGE controls how much painted content is mounted:
//     >= 1  → Hero
//     >= 2  → Hero + Trending Products grid
// ─────────────────────────────────────────────────────────────────────────────
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useProducts } from "@/lib/use-products";
import { useOrderRotationSeed, seededShuffle } from "@/lib/rotation";
import { useRotationNonce } from "@/lib/use-rotation-nonce";
import { ProductCard } from "@/components/site/ProductCard";
import { Reveal } from "@/components/site/Reveal";
import { LazyMount } from "@/components/site/LazyMount";
import { SearchOverlay } from "@/components/site/SearchOverlay";

// ⇩ Flip this to grow the painted area one section at a time during testing.
const TEST_STAGE = 2;

export const Route = createFileRoute("/home-lite")({
  head: () => ({
    meta: [
      { title: "Home Lite (diagnostic)" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: HomeLite,
});

// Copied verbatim from index.tsx (temporary; do not extract into a shared file).
const PLACEHOLDERS = [
  "Search 2,400+ curated products...",
  "Try 'wireless headphones'...",
  "Discover 'linen shirt'...",
  "Find 'ceramic mug'...",
  "Explore 'smart watch'...",
];

function useRotatingPlaceholder(active: boolean) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % PLACEHOLDERS.length), 2800);
    return () => clearInterval(id);
  }, [active]);
  return PLACEHOLDERS[idx];
}

function HomeLite() {
  const { products } = useProducts();
  const [query] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const rotatingPlaceholder = useRotatingPlaceholder(!query);

  const rotationSeed = useOrderRotationSeed();
  const rotationNonce = useRotationNonce();

  // Copied from index.tsx trending logic.
  const trending = useMemo(
    () =>
      seededShuffle(
        products.filter((p) => p.trending),
        rotationSeed + rotationNonce,
      ).slice(0, 8),
    [products, rotationSeed, rotationNonce],
  );

  return (
    <>
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} query={query} onQueryChange={() => {}} />

      {/* ── HERO (copied verbatim from index.tsx lines 536–614) ── */}
      {TEST_STAGE >= 1 && (
        <section
          className="relative z-30 px-3 sm:px-6 lg:px-10 pb-3 sm:pb-5"
          style={{
            background: "var(--gradient-hero)",
            marginTop: "calc(-1 * var(--app-header-h, 4.75rem))",
            paddingTop: "calc(var(--app-header-h, 4.75rem) + 1rem)",
          }}
        >
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
            <div
              className="absolute left-1/2 -top-[6%] -translate-x-1/2 h-[420px] w-[140%] opacity-70"
              style={{ background: "radial-gradient(ellipse at 50% 0%, oklch(0.74 0.19 49 / 0.16), transparent 60%)" }}
            />
          </div>
          <div className="relative z-10 mx-auto max-w-3xl px-1 pt-1 sm:pt-4 pb-2 text-center">
            <h1 className="font-display font-semibold tracking-[-0.02em] leading-[1.02] text-[clamp(2.6rem,11vw,4.5rem)]">
              <span className="block text-foreground">Whatever you need.</span>
              <span className="block bg-gradient-to-r from-foreground via-accent to-accent bg-clip-text text-transparent">
                All in one place.
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-[15px] sm:text-lg leading-relaxed text-muted-foreground">
              A premium independent marketplace, sourcing top-quality products from
              across the world — delivered with cinematic precision.
            </p>

            <div className="relative z-10 mx-auto mt-8 max-w-2xl">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Open search"
                className="group relative w-full rounded-full border border-white/10 shadow-[0_16px_40px_-20px_oklch(0_0_0/0.7)] transition-[border-color,box-shadow,transform] duration-300 hover:border-accent/40 active:scale-[0.995]"
                style={{ background: "oklch(0.19 0.008 60)" }}
              >
                <span className="absolute left-2 sm:left-2.5 top-1/2 -translate-y-1/2 grid size-10 sm:size-11 place-items-center rounded-full bg-white/[0.05] text-muted-foreground transition-colors duration-300 group-hover:bg-accent/15 group-hover:text-accent">
                  <Search className="size-[19px] sm:size-[21px]" />
                </span>
                <span className="flex h-14 sm:h-16 w-full items-center pl-14 sm:pl-16 pr-[120px] sm:pr-[140px] text-left text-base sm:text-[17px] font-medium tracking-[-0.01em] text-muted-foreground/65">
                  {query.trim() || rotatingPlaceholder}
                </span>
                <span className="pointer-events-none absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 inline-flex h-11 sm:h-12 items-center gap-1.5 rounded-full bg-accent px-5 sm:px-6 text-sm font-semibold uppercase tracking-[0.06em] text-accent-foreground shadow-[0_8px_24px_-8px_oklch(0.74_0.19_49/0.7)]">
                  Search
                </span>
              </button>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/search"
                search={{ q: "" }}
                className="inline-flex h-12 items-center justify-center rounded-full bg-accent px-8 text-sm font-semibold uppercase tracking-[0.08em] text-accent-foreground shadow-[0_10px_30px_-10px_oklch(0.74_0.19_49/0.7)] transition-transform duration-200 hover:scale-[1.03] active:scale-95"
              >
                Shop Now
              </Link>
              <a
                href="#categories"
                className="inline-flex h-12 items-center justify-center rounded-full glass-strong px-8 text-sm font-semibold uppercase tracking-[0.08em] text-foreground ring-1 ring-white/12 transition-colors duration-200 hover:ring-accent/40"
              >
                Browse Categories
              </a>
            </div>
          </div>
        </section>
      )}

      {/* ── TRENDING (copied from index.tsx ProductSection grid, lines 226–231) ── */}
      {TEST_STAGE >= 2 && (
        <section className="px-4 sm:px-6 py-6 sm:py-8 max-w-7xl mx-auto scroll-mt-24 block">
          <Reveal className="flex justify-between items-end mb-4 sm:mb-6 gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Hot right now</p>
              <h2 className="mt-1 font-display text-2xl sm:text-3xl font-semibold tracking-[-0.02em]">Trending Products</h2>
            </div>
          </Reveal>
          <LazyMount minHeight={260}>
            <div data-product-grid className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {trending.map((p, i) => (
                <Reveal key={p.id ?? p.slug} delay={i} className="h-full" productCardFrame>
                  <ProductCard product={p} compact forceBadge="trending" />
                </Reveal>
              ))}
            </div>
          </LazyMount>
        </section>
      )}
    </>
  );
}
