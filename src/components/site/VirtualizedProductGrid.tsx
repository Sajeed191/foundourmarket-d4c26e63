import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { publishWindowMetrics, resetWindowMetrics } from "@/lib/window-metrics";
import { ProductSkeletonGrid } from "@/components/site/ProductSkeleton";
import { getResponsiveImage } from "@/lib/product-images";
import { getStorageResponsive } from "@/lib/storage-image";
import { publishGridTelemetry, isScrollRestoring } from "@/lib/grid-telemetry";

/** How gridReady was reached (mirrors telemetry `committedVia`). */
type GridReadyReason = "decode-complete" | "safety-timeout" | "empty" | "instant";

/** Resolve the active column count for the current viewport width. */
function resolveColsWidth(cols: Cols, width: number): number {
  let c = cols.base;
  if (width >= 640 && cols.sm) c = cols.sm;
  if (width >= 768 && cols.md) c = cols.md;
  if (width >= 1024 && cols.lg) c = cols.lg;
  if (width >= 1280 && cols.xl) c = cols.xl;
  return Math.max(1, c);
}

/** Default responsive `sizes` used by ProductImage — mirror it so the in-memory
 * preloader warms the exact same srcset candidate the real grid will request. */
const DEFAULT_SIZES = "(min-width: 1024px) 300px, (min-width: 640px) 45vw, 76vw";

/**
 * Warm one image entirely in memory (HTTP + decode caches) using a detached
 * HTMLImageElement — NO DOM insertion, so the browser allocates zero GPU
 * compositor tiles for it during Phase 1. We mirror ProductImage's src/srcset/
 * sizes resolution so the candidate the browser picks here is the same one the
 * real <img> requests, guaranteeing a warm cache hit on the atomic swap.
 */
function warmImage(rawSrc: string): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof window === "undefined" || !rawSrc) return resolve();
    const bundled = getResponsiveImage(rawSrc);
    const storage = bundled ? null : getStorageResponsive(rawSrc);
    const srcset = bundled?.srcset ?? storage?.srcset;
    const src = storage?.src ?? rawSrc;

    const img = new Image();
    img.decoding = "async";
    if (srcset) {
      img.sizes = DEFAULT_SIZES;
      img.srcset = srcset;
    }
    img.src = src;

    const finish = () => {
      if (typeof img.decode === "function") {
        img.decode().then(() => resolve()).catch(() => resolve());
      } else {
        resolve();
      }
    };
    if (img.complete && img.naturalWidth > 0) return finish();
    img.addEventListener("load", finish, { once: true });
    img.addEventListener("error", () => resolve(), { once: true });
  });
}

/**
 * Run async tasks with a bounded concurrency pool instead of all-at-once.
 *
 * WHY: firing `Promise.all` over the whole first batch decodes every image in
 * parallel, then the atomic swap uploads all their textures in a SINGLE commit
 * frame. On Chromium Android that one-frame multi-texture upload overflows the
 * GPU tile manager and produces rainbow banding / duplicated strips / partial
 * bottom rows. Staggering decodes into a small pool spreads the texture uploads
 * across a few frames so the tile budget is never saturated at once. Desktop and
 * Firefox are unaffected (they just decode a hair less parallel).
 *
 * Rollback: `?ff-decode-all` restores the original unbounded parallel decode.
 */
function decodeConcurrency(): number {
  if (typeof window !== "undefined") {
    try {
      if (/[?&]ff-decode-all\b/.test(window.location.search)) return Infinity;
    } catch {
      /* ignore */
    }
  }
  return 3;
}

function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (!Number.isFinite(limit) || limit >= items.length) {
    return Promise.all(items.map((it, i) => task(it, i))).then(() => undefined);
  }
  let cursor = 0;
  const worker = (): Promise<void> => {
    const i = cursor++;
    if (i >= items.length) return Promise.resolve();
    return task(items[i], i).then(worker);
  };
  return Promise.all(Array.from({ length: limit }, worker)).then(() => undefined);
}

/** Grid hydration debug logging — opt-in only.
 * Enable via `?debug-grid` in the URL or `window.__DEBUG_GRID = true`.
 * Zero cost in production when disabled. */
function gridDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      (window as unknown as { __DEBUG_GRID?: boolean }).__DEBUG_GRID === true ||
      /[?&]debug-grid\b/.test(window.location.search)
    );
  } catch {
    return false;
  }
}

function gridLog(...args: unknown[]): void {
  if (gridDebugEnabled()) console.log("%c[ZeroFlickerGrid]", "color:#f59e0b", ...args);
}

/** Wait N animation frames — a "decode barrier flush" so the compositor and
 * rasterizer are synced before we mount the real grid. */
function nextFrames(n: number): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame !== "function") return resolve();
    let left = n;
    const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  });
}

/**
 * Wait until scroll restoration has settled before releasing the hydration gate.
 * On refresh/back-forward the browser may restore a non-zero scroll offset a few
 * frames after mount; committing before that lands can cause an early-render
 * correction frame. We poll scrollY until it stops moving (or a short cap), so
 * gridReady is delayed until scroll is stable. No-op when not restoring.
 */
function waitForScrollSettled(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof window === "undefined" || !isScrollRestoring()) return resolve();
    let last = window.scrollY;
    let stableFrames = 0;
    const start = performance.now();
    const tick = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) <= 1) stableFrames += 1;
      else stableFrames = 0;
      last = y;
      // Settled = 2 consecutive stable frames, or hard cap at 400ms.
      if (stableFrames >= 2 || performance.now() - start > 400) return resolve();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/**
 * Perceived-load optimization: after the current batch commits, pre-warm the
 * NEXT viewport batch in the background so a first scroll paints from cache.
 * Idle-scheduled and non-blocking — never gates the UI and never touches the DOM.
 */
function prewarmNextBatch(preloadSrcs: string[] | undefined, currentK: number): void {
  if (typeof window === "undefined" || !preloadSrcs) return;
  const next = preloadSrcs.slice(currentK, currentK + currentK);
  if (next.length === 0) return;
  const run = () => {
    // Sequential to avoid a decode burst competing with the just-painted grid.
    next.reduce<Promise<void>>((chain, src) => chain.then(() => warmImage(src)), Promise.resolve());
  };
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback;
  if (typeof ric === "function") ric(run);
  else setTimeout(run, 200);
}



/**
 * Two-phase rendering engine — skeleton → atomic swap grid.
 *
 * Phase 1 (fast paint): render ONLY a `ProductSkeletonGrid`. In parallel, warm
 * the first visible batch of images fully in memory via detached
 * `HTMLImageElement`s (no DOM, no GPU tiles). Phase 2 (atomic commit): once the
 * batch is decoded AND a two-frame barrier has flushed, unmount the skeleton and
 * mount the real grid in a single commit — images paint instantly from cache.
 *
 * This splits the DOM into two trees (SkeletonGrid vs RealGrid) so there is zero
 * hidden GPU work during Phase 1, and eliminates partial rows, bottom flicker
 * and the first-scroll correction on refresh.
 *
 * When `preloadSrcs` is unavailable we fall back to the lighter opacity gate:
 * the real grid mounts hidden and reveals after its own images decode.
 */
function TwoPhaseGrid({
  cols,
  itemCount,
  preloadSrcs,
  className,
  children,
}: {
  cols: Cols;
  itemCount: number;
  preloadSrcs?: string[];
  className?: string;
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const canTwoPhase = !!preloadSrcs && preloadSrcs.length > 0;

  // Compute the first visible batch size: visible rows × columns (+1 slack).
  // Never relies on IntersectionObserver (unreliable right after a refresh).
  const computeK = () => {
    if (typeof window === "undefined") return Math.min(itemCount, 8);
    const colCount = resolveColsWidth(cols, window.innerWidth);
    const visibleRows = Math.max(1, Math.ceil(window.innerHeight / 320));
    return Math.min(itemCount, colCount * (visibleRows + 1));
  };

  // Scroll stabilization lock — after the atomic swap, pin scrollY for a short
  // window so any last-frame tile settling can't nudge layout / cause a jump.
  const stabilizeScroll = () => {
    if (typeof window === "undefined") return;
    const y = window.scrollY;
    const start = performance.now();
    const LOCK_MS = 220;
    const hold = () => {
      if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
      if (performance.now() - start < LOCK_MS) requestAnimationFrame(hold);
    };
    requestAnimationFrame(hold);
    publishGridTelemetry({ scrollLockDurationMs: LOCK_MS });
  };

  // TWO-PHASE PATH: skeleton first, warm images off-DOM, atomic swap.
  useLayoutEffect(() => {
    if (!canTwoPhase || ready) return;
    if (itemCount === 0 || typeof window === "undefined") {
      publishGridTelemetry({ committedVia: "empty" });
      setReady(true);
      return;
    }
    let cancelled = false;
    const k = computeK();
    const srcs = (preloadSrcs ?? []).slice(0, k);
    const startedAt = performance.now();
    publishGridTelemetry({
      hydrationStartTime: Math.round(startedAt),
      viewportBatchSize: k,
    });
    gridLog("phase1 start →", {
      viewportBatch: k,
      itemCount,
      cols: resolveColsWidth(cols, window.innerWidth),
      viewport: { w: window.innerWidth, h: window.innerHeight },
    });

    const commit = (via: GridReadyReason) => {
      if (cancelled) return;
      const now = performance.now();
      const ms = Math.round(now - startedAt);
      publishGridTelemetry({
        gridReadyTimestamp: Math.round(now),
        skeletonDurationMs: ms,
        committedVia: via,
      });
      gridLog(`atomic commit (${via}) → gridReady`, {
        hydrationMs: ms,
        gridReadyTs: Math.round(now),
      });
      setReady(true);
      stabilizeScroll();
      // Background: overlap the NEXT viewport batch decode while the current
      // grid paints. Non-blocking, idle-scheduled, never gates the UI.
      prewarmNextBatch(preloadSrcs, k);
    };

    const decodeBatchStart = performance.now();
    publishGridTelemetry({ decodeBatchStart: Math.round(decodeBatchStart) });

    // Hard safety cap so we never sit on the skeleton forever (3s).
    const safety = new Promise<GridReadyReason>((res) =>
      setTimeout(() => res("safety-timeout"), 3000),
    );

    const decodeAll = mapWithConcurrency(srcs, decodeConcurrency(), (s, i) => {
      const t0 = performance.now();
      return warmImage(s).then(() => {
        if (gridDebugEnabled()) gridLog(`decode[${i}] ${Math.round(performance.now() - t0)}ms`);
      });
    })
      .then(() => {
        publishGridTelemetry({ decodeBatchEnd: Math.round(performance.now()) });
      })
      // Defer commit until scroll restoration is settled, then flush 2 frames.
      .then(() => waitForScrollSettled())
      .then(() => nextFrames(2)) // decode barrier flush
      .then<GridReadyReason>(() => "decode-complete");

    Promise.race([decodeAll, safety]).then(commit);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canTwoPhase, ready, itemCount, cols]);

  // FALLBACK PATH (no preloadSrcs): opacity gate the real grid after its own
  // in-DOM images decode.
  useLayoutEffect(() => {
    if (canTwoPhase || ready) return;
    const container = ref.current;
    if (!container || itemCount === 0 || typeof window === "undefined") {
      setReady(true);
      return;
    }
    let cancelled = false;
    const reveal = () => !cancelled && setReady(true);

    const k = computeK();
    const imgs = Array.from(
      container.querySelectorAll<HTMLImageElement>("img[data-product-image]"),
    ).slice(0, k);
    if (imgs.length === 0) {
      reveal();
      return;
    }
    const settle = (img: HTMLImageElement): Promise<void> => {
      const decode = () =>
        typeof img.decode === "function"
          ? img.decode().catch(() => undefined)
          : nextFrames(1);
      if (img.complete && img.naturalWidth > 0) return decode();
      return new Promise<void>((res) => {
        img.addEventListener("load", () => decode().then(() => res()), { once: true });
        img.addEventListener("error", () => res(), { once: true });
      });
    };
    const safety = new Promise<void>((res) => setTimeout(res, 3000));
    Promise.race([Promise.all(imgs.map(settle)).then(() => undefined), safety]).then(reveal);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canTwoPhase, ready, itemCount, cols]);

  // Phase 1 for two-phase mode: render only the skeleton (separate DOM tree).
  if (canTwoPhase && !ready) {
    return (
      <ProductSkeletonGrid
        count={Math.max(4, Math.min(itemCount, computeK()))}
        className={className ?? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5"}
      />
    );
  }

  // Two-phase Phase 2: mount the real grid directly (atomic commit).
  if (canTwoPhase) return <>{children}</>;

  // Fallback: opacity gate.
  return (
    <div
      ref={ref}
      data-grid-hydrated={ready ? "true" : "false"}
      style={{
        opacity: ready ? 1 : 0,
        transition: ready ? "opacity 220ms ease-out" : undefined,
        pointerEvents: ready ? undefined : "none",
      }}
    >
      {children}
    </div>
  );
}

type Cols = { base: number; sm?: number; md?: number; lg?: number; xl?: number };

type Props<T> = {
  items: T[];
  /** Render a single item. The grid owns stable keys; never key by index. */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Permanent item identity. Product grids must pass product.id (slug fallback only for legacy rows). */
  getKey?: (item: T) => string;
  /** Column counts per Tailwind breakpoint (kept for call-site compatibility). */
  cols: Cols;
  /** Responsive grid className (SSR-safe, normal document flow). */
  className?: string;
  /** Rough row height estimate (unused; kept for call-site compatibility). */
  estimateRowHeight?: number;
  /** Overscan rows (unused; kept for call-site compatibility). */
  overscan?: number;
  /** Only grow incrementally once the list exceeds this size. */
  virtualizeThreshold?: number;
  /**
   * Optional: resolve an item's primary image URL. When provided, the grid uses
   * the two-phase engine (skeleton → warm first batch off-DOM → atomic swap).
   * Without it, the grid falls back to opacity-gated reveal.
   */
  getImageSrc?: (item: T) => string | null | undefined;
};

/**
 * Transform-free incremental product grid (all platforms) — DEFAULT path.
 *
 * WHY no window virtualizer by default:
 * The previous transform-based `useWindowVirtualizer` path placed each row with
 * `position: absolute` + `transform: translateY()` + `contain: layout paint
 * style` and re-measured row heights with `measureElement`. When a card's
 * height changed after mount (e.g. the ProductCard static→rich swap, or image
 * decode), the virtualizer repositioned rows mid-scroll. On BOTH Chromium and
 * Safari this produces duplicated/overlapping titles, stale images and ghost
 * paint during fast fling scrolling.
 *
 * This append-only grid renders every item in normal document flow inside a
 * plain CSS grid (no transforms) and grows the visible window in small batches
 * via an IntersectionObserver sentinel. Its known trade-off is that scrolled-
 * past cards are NEVER unmounted — DOM/`<img>`/GPU-texture retention grows with
 * scroll distance. The `?ff-window=on` experiment (below) swaps this for a true
 * fixed-size sliding window to A/B test whether that retention is what triggers
 * Chromium-Android compositor corruption.
 */
function IncrementalGrid<T>({
  items,
  renderItem,
  getKey,
  className,
  cols,
  batchSize,
  preloadSrcs,
}: {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  getKey: (item: T) => string;
  className?: string;
  cols: Cols;
  batchSize: number;
  preloadSrcs?: string[];
}) {
  const [visible, setVisible] = useState(() => Math.min(items.length, batchSize));
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  // Reset the window when the dataset changes (filter/sort/navigation).
  useEffect(() => {
    setVisible(Math.min(items.length, batchSize));
  }, [items, batchSize]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && visibleRef.current < items.length) {
          setVisible((v) => Math.min(items.length, v + batchSize));
        }
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [items.length, batchSize]);

  const shown = items.slice(0, visible);

  return (
    <>
      <TwoPhaseGrid cols={cols} itemCount={shown.length} preloadSrcs={preloadSrcs} className={className}>
        <div data-product-grid className={className}>
          {shown.map((item, i) => (
            <div key={getKey(item)} data-product-card-frame className="h-full min-w-0 [&>*]:h-full">
              {renderItem(item, i)}
            </div>
          ))}
        </div>
      </TwoPhaseGrid>
      {visible < items.length && <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />}
    </>
  );
}

/** Resolve the active column count for the current viewport width. */
function resolveCols(cols: Cols, width: number): number {
  let c = cols.base;
  if (width >= 640 && cols.sm) c = cols.sm;
  if (width >= 768 && cols.md) c = cols.md;
  if (width >= 1024 && cols.lg) c = cols.lg;
  if (width >= 1280 && cols.xl) c = cols.xl;
  return Math.max(1, c);
}

/**
 * EXPERIMENTAL — true windowed virtualization (only via `?ff-window=on`).
 *
 * Keeps only the rows near the viewport mounted (~30–40 cards) and replaces the
 * scrolled-away rows with plain top/bottom spacer <div>s so total scroll height
 * and scroll position are preserved exactly. No transforms, no layer promotion:
 * the grid still lays out in normal flow, we just bound how many rows exist.
 *
 * This isolates one variable — unbounded retained ProductCards/<img>/GPU
 * textures — without touching ProductCard, ProductImage, srcset, decoding,
 * loading, SEO, or backend. Cards/images are identical; only their lifetime
 * changes.
 */
function WindowedGrid<T>({
  items,
  renderItem,
  getKey,
  className,
  cols,
  estimateRowHeight = 340,
  overscanRows = 6,
  preloadSrcs,
}: {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  getKey: (item: T) => string;
  className?: string;
  cols: Cols;
  estimateRowHeight?: number;
  overscanRows?: number;
  preloadSrcs?: string[];
}) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === "undefined" ? 900 : window.innerHeight,
  );
  const [rowStride, setRowStride] = useState(estimateRowHeight);
  const [scrollY, setScrollY] = useState(0);

  const colCount = resolveCols(cols, viewportWidth);
  const totalRows = Math.ceil(items.length / colCount);

  // Track viewport size.
  useEffect(() => {
    const onResize = () => {
      setViewportWidth(window.innerWidth);
      setViewportHeight(window.innerHeight);
    };
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Track scroll position (rAF-throttled).
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setScrollY(window.scrollY || window.pageYOffset || 0);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Measure the true row stride (card height + row gap) from a mounted card.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const first = grid.firstElementChild as HTMLElement | null;
    if (!first) return;
    const gap = parseFloat(getComputedStyle(grid).rowGap) || 0;
    const h = first.offsetHeight + gap;
    if (h > 0 && Math.abs(h - rowStride) > 1) setRowStride(h);
  });

  // Absolute document offset of the grid's top edge.
  const gridTopAbs =
    outerRef.current && typeof window !== "undefined"
      ? outerRef.current.getBoundingClientRect().top + (window.scrollY || 0)
      : 0;

  const relativeScroll = scrollY - gridTopAbs;
  const firstVisibleRow = Math.floor(relativeScroll / rowStride);
  const lastVisibleRow = Math.ceil((relativeScroll + viewportHeight) / rowStride);

  const startRow = Math.max(0, firstVisibleRow - overscanRows);
  const endRow = Math.min(totalRows, lastVisibleRow + overscanRows);

  const startIndex = startRow * colCount;
  const endIndex = Math.min(items.length, endRow * colCount);

  const topSpacer = startRow * rowStride;
  const bottomSpacer = Math.max(0, (totalRows - endRow) * rowStride);

  const windowItems = items.slice(startIndex, endIndex);

  // Publish live metrics for the A/B debug panel (instrumentation only).
  useEffect(() => {
    publishWindowMetrics({
      mode: "windowed",
      windowSize: windowItems.length,
      overscanRows,
      visibleRows: Math.max(0, lastVisibleRow - firstVisibleRow),
      startRow,
      endRow,
      totalRows,
      colCount,
      rowStride,
      topSpacer,
      bottomSpacer,
    });
    return () => resetWindowMetrics();
  }, [
    windowItems.length,
    overscanRows,
    firstVisibleRow,
    lastVisibleRow,
    startRow,
    endRow,
    totalRows,
    colCount,
    rowStride,
    topSpacer,
    bottomSpacer,
  ]);



  return (
    <div ref={outerRef}>
      {topSpacer > 0 && <div aria-hidden style={{ height: topSpacer }} />}
      <TwoPhaseGrid cols={cols} itemCount={windowItems.length} preloadSrcs={preloadSrcs} className={className}>
        <div ref={gridRef} data-product-grid data-windowed="on" className={className}>
          {windowItems.map((item, i) => {
            const index = startIndex + i;
            return (
              <div key={getKey(item)} data-product-card-frame className="h-full min-w-0 [&>*]:h-full">
                {renderItem(item, index)}
              </div>
            );
          })}
        </div>
      </TwoPhaseGrid>
      {bottomSpacer > 0 && <div aria-hidden style={{ height: bottomSpacer }} />}
    </div>
  );
}

/** Read the `?ff-window=on` experiment flag (client-only). */
function useWindowExperiment(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    try {
      setOn(new URLSearchParams(window.location.search).get("ff-window") === "on");
    } catch {
      setOn(false);
    }
  }, []);
  return on;
}

/**
 * Adaptive product grid. Small lists render as a plain responsive grid (also
 * the SSR output). Large lists use the append-only IncrementalGrid by default;
 * with `?ff-window=on` they use the experimental true windowed virtualization
 * so the two architectures can be A/B tested on the same build.
 */
export function VirtualizedProductGrid<T>({
  items,
  renderItem,
  getKey,
  className,
  cols,
  virtualizeThreshold = 32,
  getImageSrc,
}: Props<T>) {
  const windowExperiment = useWindowExperiment();
  const big = items.length > virtualizeThreshold;
  const stableKey = getKey ?? ((item: T) => {
    const candidate = item as { id?: string | null; slug?: string | null };
    const key = candidate.id || candidate.slug;
    if (!key) throw new Error("VirtualizedProductGrid requires getKey for items without id/slug");
    return key;
  });

  // Resolve the first ~60 image URLs for the two-phase warm-up (off-DOM decode).
  // Only enabled when the caller provides getImageSrc.
  const preloadSrcs = getImageSrc
    ? items
        .slice(0, 60)
        .map((item) => getImageSrc(item) ?? "")
        .filter((s): s is string => !!s)
    : undefined;

  // Large catalogs: bounded, transform-free rendering.
  if (big) {
    if (windowExperiment) {
      return (
        <WindowedGrid
          items={items}
          renderItem={renderItem}
          getKey={stableKey}
          className={className}
          cols={cols}
          preloadSrcs={preloadSrcs}
        />
      );
    }
    return (
      <IncrementalGrid
        items={items}
        renderItem={renderItem}
        getKey={stableKey}
        className={className}
        cols={cols}
        preloadSrcs={preloadSrcs}
        // 16 cards per batch keeps paint/memory cost low while feeling like
        // infinite scroll on low-end phones.
        batchSize={16}
      />
    );
  }

  // Small lists: plain responsive grid (also the SSR / first-paint output).
  return (
    <TwoPhaseGrid cols={cols} itemCount={items.length} preloadSrcs={preloadSrcs} className={className}>
      <div data-product-grid className={className}>
        {items.map((item, i) => (
          <div key={stableKey(item)} data-product-card-frame className="h-full min-w-0 [&>*]:h-full">
            {renderItem(item, i)}
          </div>
        ))}
      </div>
    </TwoPhaseGrid>
  );
}

export default memo(VirtualizedProductGrid) as typeof VirtualizedProductGrid;
