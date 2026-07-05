import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Flame, Award, Sparkles } from "lucide-react";
import { fetchProducts, type Product } from "@/lib/products";
import { ProductCard } from "@/components/site/ProductCard";
import { VirtualizedProductGrid } from "@/components/site/VirtualizedProductGrid";
import { LazyMount } from "@/components/site/LazyMount";
import { SectionTracker } from "@/components/site/SectionTracker";
import { Reveal } from "@/components/site/Reveal";
import type { BadgeKey } from "@/lib/badges";
import { useOrderRotationSeed, seededShuffle } from "@/lib/rotation";
import { useRotationNonce } from "@/lib/use-rotation-nonce";

/**
 * RUNTIME-FREEZE-RAF EXPERIMENT — Android Chrome scroll-corruption investigation.
 *
 * Renders the EXACT same DOM/CSS/providers/Stage-3 layout as the reproducing
 * /runtime-isolation page. After the initial render settles, disables ONLY
 * requestAnimationFrame:
 *   - cancels all pending rAF callbacks
 *   - replaces future requestAnimationFrame with a no-op
 *
 * Everything else stays ACTIVE: ResizeObserver, MutationObserver,
 * IntersectionObserver, timers, and scroll listeners. DOM is unchanged. Goal:
 * determine whether rAF specifically is the runtime activity driving the bug.
 */

const STAGE = 3 as 1 | 2 | 3 | 4;
const NEW_ARRIVALS_BOX_HEIGHT = 190;

function disableRaf() {
  if (typeof window === "undefined") return;
  // Cancel any outstanding rAF ids, then no-op all future scheduling.
  const probe = requestAnimationFrame(() => {});
  for (let i = 0; i <= probe; i++) {
    try {
      cancelAnimationFrame(i);
    } catch {
      /* noop */
    }
  }
  window.requestAnimationFrame = ((_cb: FrameRequestCallback) =>
    0) as typeof window.requestAnimationFrame;
}

export const Route = createFileRoute("/runtime-freeze-raf")({
  head: () => ({
    meta: [
      { title: "Runtime Freeze rAF Harness" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RuntimeFreezeRafPage,
});

function TrendingSection({ products }: { products: Product[] }) {
  const rotationSeed = useOrderRotationSeed();
  const rotationNonce = useRotationNonce();
  const trending = useMemo(
    () =>
      seededShuffle(
        products.filter((p) => p.trending),
        rotationSeed + rotationNonce,
      ).slice(0, 8),
    [products, rotationSeed, rotationNonce],
  );
  const preview = trending.slice(0, 4);
  if (preview.length === 0) return null;
  return (
    <SectionTracker
      sectionKey="trending"
      className="px-4 sm:px-6 py-6 sm:py-8 max-w-7xl mx-auto scroll-mt-24 block"
    >
      <div className="mb-4 flex items-center gap-2">
        <Flame className="size-5 text-accent" />
        <h2 className="text-lg font-semibold text-white">Trending</h2>
      </div>
      <LazyMount minHeight={320}>
        <VirtualizedProductGrid
          items={preview}
          virtualizeThreshold={0}
          cols={{ base: 2, lg: 4 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
          getKey={(p) => p.id ?? p.slug}
          getImageSrc={(p) => p.image}
          renderItem={(p) => (
            <ProductCard product={p} compact forceBadge="trending" />
          )}
        />
      </LazyMount>
    </SectionTracker>
  );
}

function RailSection({
  sectionKey,
  title,
  icon: Icon,
  items,
  badge,
}: {
  sectionKey: string;
  title: string;
  icon: typeof Flame;
  items: Product[];
  badge: BadgeKey;
}) {
  const preview = items.slice(0, 4);
  if (preview.length === 0) return null;
  return (
    <SectionTracker
      sectionKey={sectionKey}
      className="px-4 sm:px-6 py-6 sm:py-8 max-w-7xl mx-auto scroll-mt-24 block"
    >
      <div className="mb-4 flex items-center gap-2">
        <Icon className="size-5 text-accent" />
        <h2 className="text-lg font-semibold text-white">{title}</h2>
      </div>
      <LazyMount minHeight={260}>
        <div data-product-grid className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {preview.map((p, i) => (
            <Reveal key={p.id ?? p.slug} delay={i} className="h-full" productCardFrame>
              <ProductCard product={p} compact forceBadge={badge} />
            </Reveal>
          ))}
        </div>
      </LazyMount>
    </SectionTracker>
  );
}

function HomeSections({ products }: { products: Product[] }) {
  const rotationSeed = useOrderRotationSeed();
  const rotationNonce = useRotationNonce();

  const bestSellers = useMemo(
    () =>
      seededShuffle(
        products.filter((p) => p.bestseller),
        rotationSeed + rotationNonce + 1,
      ).slice(0, 8),
    [products, rotationSeed, rotationNonce],
  );

  return (
    <>
      <TrendingSection products={products} />
      {STAGE >= 2 && (
        <RailSection
          sectionKey="best_sellers"
          title="Best Sellers"
          icon={Award}
          items={bestSellers}
          badge="bestseller"
        />
      )}
      {/* New Arrivals rendered EXACTLY as the reproducing runtime-isolation
          config: grid of 8 plain boxes with a border (BOX_MODE "D"). */}
      {STAGE >= 3 && (
        <div className="px-4 sm:px-6 py-6 sm:py-8 max-w-7xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: "100%",
                  height: NEW_ARRIVALS_BOX_HEIGHT,
                  backgroundColor: i % 2 ? "#334155" : "#475569",
                  border: "1px solid #64748b",
                }}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function RuntimeFreezeRafPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const frozen = useRef(false);

  useEffect(() => {
    let active = true;
    fetchProducts(60).then((rows) => {
      if (active) setProducts(rows);
    });
    return () => {
      active = false;
    };
  }, []);

  // Once products render and children effects have run, disable ONLY rAF.
  useEffect(() => {
    if (products.length === 0 || frozen.current) return;
    frozen.current = true;
    const id = window.setTimeout(() => {
      disableRaf();
      // eslint-disable-next-line no-console
      console.log("[runtime-freeze-raf] requestAnimationFrame disabled");
    }, 1500);
    return () => clearTimeout(id);
  }, [products.length]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <HomeSections products={products} />
      <h1 className="mb-6 text-lg font-semibold text-white">Runtime Freeze rAF ({products.length})</h1>
      <div data-product-grid className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
        {products.map((p) => (
          <div key={p.id ?? p.slug} data-product-card-frame className="h-full min-w-0 [&>*]:h-full">
            <ProductCard product={p} compact />
          </div>
        ))}
      </div>
    </div>
  );
}
