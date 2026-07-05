import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Flame, Award, Sparkles } from "lucide-react";
import { fetchProducts, type Product } from "@/lib/products";
import { ProductCard } from "@/components/site/ProductCard";
import { VirtualizedProductGrid } from "@/components/site/VirtualizedProductGrid";
import { LazyMount } from "@/components/site/LazyMount";
import { SectionTracker } from "@/components/site/SectionTracker";
import { Reveal } from "@/components/site/Reveal";
import { FlashDeals } from "@/components/site/FlashDeals";
import type { BadgeKey } from "@/lib/badges";
import { useOrderRotationSeed, seededShuffle } from "@/lib/rotation";
import { useRotationNonce } from "@/lib/use-rotation-nonce";

/**
 * BINARY-ISOLATION HARNESS — Android Chrome scroll-corruption investigation.
 *
 * FINAL EXPERIMENT: cumulatively recreate the Home page sections on top of the
 * existing 60-card isolation grid to find the smallest section combination that
 * reproduces the production corruption. Stages are gated by STAGE below:
 *   1 = Trending
 *   2 = Trending + Best Sellers
 *   3 = Trending + Best Sellers + New Arrivals
 *   4 = Trending + Best Sellers + New Arrivals + Flash Deals
 * Each section is replicated EXACTLY as production renders it in
 * src/routes/index.tsx. No providers or startup effects restored.
 */
const STAGE = 3 as 1 | 2 | 3 | 4;
// HEIGHT-THRESHOLD EXPERIMENT knobs. New Arrivals rendered height ≈ 846px.
const NEW_ARRIVALS_MODE = "boxes" as "section" | "spacer" | "boxes";
const NEW_ARRIVALS_HEIGHT = 846;
const NEW_ARRIVALS_BOX_HEIGHT = 190; // 4 rows × 190 + gaps/padding ≈ 846
// FINAL COMPOSITOR EXPERIMENT: "A" = 8 boxes stacked vertically (no grid),
// "B" = grid with only 4 boxes, "C" = grid with 8 boxes, minimal styles only.
const BOX_MODE = "C" as "A" | "B" | "C";

export const Route = createFileRoute("/runtime-isolation")({
  head: () => ({
    meta: [
      { title: "Runtime Isolation Harness" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RuntimeIsolationPage,
});

/**
 * Trending — replicated EXACTLY as production ProductSection sectionKey="trending"
 * (SectionTracker → LazyMount → VirtualizedProductGrid virtualizeThreshold={0}).
 */
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

/**
 * Best Sellers / New Arrivals — replicated EXACTLY as production ProductSection
 * non-trending branch (SectionTracker → LazyMount → plain grid of Reveal-wrapped
 * ProductCards with productCardFrame).
 */
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

  const newArrivals = useMemo(
    () =>
      products
        .filter((p) => p.newArrival)
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
        .slice(0, 8),
    [products],
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
      {STAGE >= 3 && NEW_ARRIVALS_MODE === "section" && (
        <RailSection
          sectionKey="new_arrivals"
          title="New Arrivals"
          icon={Sparkles}
          items={newArrivals}
          badge="new"
        />
      )}
      {/* HEIGHT-THRESHOLD EXPERIMENT: New Arrivals replaced by an equivalent-height
          spacer — no ProductCards, images, observers, LazyMount, or grid. */}
      {STAGE >= 3 && NEW_ARRIVALS_MODE === "spacer" && (
        <div style={{ height: NEW_ARRIVALS_HEIGHT }} />
      )}
      {/* HEIGHT-THRESHOLD EXPERIMENT: New Arrivals replaced by 8 plain colored
          boxes of the same total height — no ProductCard, images, observers, hooks. */}
      {STAGE >= 3 && NEW_ARRIVALS_MODE === "boxes" && BOX_MODE === "A" && (
        // Test A: 8 boxes stacked vertically, NO grid.
        <div className="px-4 sm:px-6 py-6 sm:py-8 max-w-7xl mx-auto">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              style={{ height: NEW_ARRIVALS_BOX_HEIGHT, background: i % 2 ? "#334155" : "#475569" }}
            />
          ))}
        </div>
      )}
      {STAGE >= 3 && NEW_ARRIVALS_MODE === "boxes" && BOX_MODE === "B" && (
        // Test B: grid restored, only 4 boxes.
        <div className="px-4 sm:px-6 py-6 sm:py-8 max-w-7xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                style={{ height: NEW_ARRIVALS_BOX_HEIGHT, background: i % 2 ? "#334155" : "#475569" }}
              />
            ))}
          </div>
        </div>
      )}
      {STAGE >= 3 && NEW_ARRIVALS_MODE === "boxes" && BOX_MODE === "C" && (
        // Test C: grid, 8 boxes, ONLY width/height/background-color.
        <div className="px-4 sm:px-6 py-6 sm:py-8 max-w-7xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                style={{ width: "100%", height: NEW_ARRIVALS_BOX_HEIGHT, backgroundColor: i % 2 ? "#334155" : "#475569" }}
              />
            ))}
          </div>
        </div>
      )}
      {STAGE >= 4 && (
        <LazyMount minHeight={360}>
          <FlashDeals />
        </LazyMount>
      )}
    </>
  );
}

function RuntimeIsolationPage() {
  const [products, setProducts] = useState<Product[]>([]);

  // The ONLY effect on this page: fetch the same data Browse uses, once.
  useEffect(() => {
    let active = true;
    fetchProducts(60).then((rows) => {
      if (active) setProducts(rows);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <HomeSections products={products} />
      <h1 className="mb-6 text-lg font-semibold text-white">Runtime Isolation ({products.length})</h1>
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
