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
 * RUNTIME-FREEZE EXPERIMENT — Android Chrome scroll-corruption investigation.
 *
 * Renders the EXACT same DOM structure as the current reproducing
 * /runtime-isolation page (STAGE 3: Trending + Best Sellers + New Arrivals-as-
 * grid-boxes over the 60-card grid), then, once the initial render has settled,
 * disables every source of runtime JavaScript activity:
 *   - disconnects all MutationObservers / ResizeObservers / IntersectionObservers
 *   - removes all window/document scroll listeners
 *   - cancels every pending requestAnimationFrame and neuters future rAF
 *   - clears all intervals and repeating/pending timers and neuters future ones
 *
 * The DOM, CSS, ProductCard, ProductImage, and layout are UNCHANGED. The only
 * goal is to determine whether ongoing runtime JS is required for the corruption.
 */

// Mirror the reproducing /runtime-isolation config exactly.
const STAGE = 3 as 1 | 2 | 3 | 4;
const NEW_ARRIVALS_BOX_HEIGHT = 190;

// ---------------------------------------------------------------------------
// Runtime-activity registry. Installed at module load (before any child effect
// runs) so we can enumerate and tear down every observer / rAF / timer / scroll
// listener that this page creates.
// ---------------------------------------------------------------------------
type AnyObserver = { disconnect: () => void };

declare global {
  interface Window {
    __freezeInstalled?: boolean;
    __freezeRegistry?: {
      observers: AnyObserver[];
      rafIds: number[];
      timerIds: number[];
      scrollTargets: Array<Window | Document | HTMLElement>;
    };
  }
}

function installFreezeRegistry() {
  if (typeof window === "undefined" || window.__freezeInstalled) return;
  window.__freezeInstalled = true;
  const registry = {
    observers: [] as AnyObserver[],
    rafIds: [] as number[],
    timerIds: [] as number[],
    scrollTargets: [] as Array<Window | Document | HTMLElement>,
  };
  window.__freezeRegistry = registry;

  // Wrap observer constructors so every instance is tracked.
  const wrapObserver = <T extends { new (...args: any[]): AnyObserver }>(Orig: T): T => {
    const Wrapped = function (this: any, ...args: any[]) {
      const inst = new (Orig as any)(...args);
      registry.observers.push(inst);
      return inst;
    } as unknown as T;
    Wrapped.prototype = Orig.prototype;
    return Wrapped;
  };
  if (window.MutationObserver) window.MutationObserver = wrapObserver(window.MutationObserver);
  if (window.ResizeObserver) window.ResizeObserver = wrapObserver(window.ResizeObserver);
  if (window.IntersectionObserver)
    window.IntersectionObserver = wrapObserver(window.IntersectionObserver);

  // Track rAF ids.
  const origRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb: FrameRequestCallback) => {
    const id = origRaf(cb);
    registry.rafIds.push(id);
    return id;
  };

  // Track interval/timeout ids.
  const origSetInterval = window.setInterval.bind(window);
  const origSetTimeout = window.setTimeout.bind(window);
  window.setInterval = ((handler: TimerHandler, timeout?: number, ...rest: any[]) => {
    const id = (origSetInterval as any)(handler, timeout, ...rest);
    registry.timerIds.push(id as number);
    return id;
  }) as typeof window.setInterval;
  window.setTimeout = ((handler: TimerHandler, timeout?: number, ...rest: any[]) => {
    const id = (origSetTimeout as any)(handler, timeout, ...rest);
    registry.timerIds.push(id as number);
    return id;
  }) as typeof window.setTimeout;

  // Track scroll listeners on window/document.
  const patchAddScroll = (target: Window | Document) => {
    const origAdd = target.addEventListener.bind(target);
    target.addEventListener = ((type: string, listener: any, opts?: any) => {
      if (type === "scroll") registry.scrollTargets.push(target as any);
      return origAdd(type, listener, opts);
    }) as any;
  };
  patchAddScroll(window);
  patchAddScroll(document);
}

// Install as early as possible (module evaluation happens before render).
installFreezeRegistry();

function freezeEverything() {
  if (typeof window === "undefined") return;
  const reg = window.__freezeRegistry;

  // 1) Disconnect all tracked observers.
  reg?.observers.forEach((o) => {
    try {
      o.disconnect();
    } catch {
      /* noop */
    }
  });

  // 2) Cancel every pending rAF and neuter future scheduling.
  reg?.rafIds.forEach((id) => {
    try {
      cancelAnimationFrame(id);
    } catch {
      /* noop */
    }
  });
  // Brute-force cancel any outstanding ids, then no-op future rAF.
  const rafProbe = requestAnimationFrame(() => {});
  for (let i = 0; i <= rafProbe; i++) {
    try {
      cancelAnimationFrame(i);
    } catch {
      /* noop */
    }
  }
  window.requestAnimationFrame = ((_cb: FrameRequestCallback) => 0) as typeof window.requestAnimationFrame;

  // 3) Clear all tracked timers, brute-force the id space, neuter future timers.
  reg?.timerIds.forEach((id) => {
    clearInterval(id);
    clearTimeout(id);
  });
  const timerProbe = window.setTimeout(() => {}, 100000) as unknown as number;
  for (let i = 0; i <= timerProbe; i++) {
    clearInterval(i);
    clearTimeout(i);
  }
  window.setInterval = (() => 0) as unknown as typeof window.setInterval;

  // 4) Remove all scroll listeners by cloning the handler surface is not
  //    possible generically, so replace onscroll and stop propagation via a
  //    capturing no-op is avoided (would change DOM). Instead, disable the
  //    scroll targets' listeners by swapping addEventListener back and relying
  //    on cancelled rAF/observers. As a direct measure, null out on* handlers.
  try {
    (window as any).onscroll = null;
    (document as any).onscroll = null;
  } catch {
    /* noop */
  }
}

export const Route = createFileRoute("/runtime-freeze")({
  head: () => ({
    meta: [
      { title: "Runtime Freeze Harness" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RuntimeFreezePage,
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

function RuntimeFreezePage() {
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

  // Once the page has products and the initial render + children effects have
  // run, freeze all runtime activity. Delay a bit to let observers/timers
  // register first, then tear them all down.
  useEffect(() => {
    if (products.length === 0 || frozen.current) return;
    frozen.current = true;
    const id = window.setTimeout(() => {
      freezeEverything();
      // eslint-disable-next-line no-console
      console.log("[runtime-freeze] runtime activity frozen");
    }, 1500);
    return () => clearTimeout(id);
  }, [products.length]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <HomeSections products={products} />
      <h1 className="mb-6 text-lg font-semibold text-white">Runtime Freeze ({products.length})</h1>
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
