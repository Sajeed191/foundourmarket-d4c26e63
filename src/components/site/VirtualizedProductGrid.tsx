import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { publishWindowMetrics, resetWindowMetrics } from "@/lib/window-metrics";

/** Resolve the active column count for the current viewport width. */
function resolveColsWidth(cols: Cols, width: number): number {
  let c = cols.base;
  if (width >= 640 && cols.sm) c = cols.sm;
  if (width >= 768 && cols.md) c = cols.md;
  if (width >= 1024 && cols.lg) c = cols.lg;
  if (width >= 1280 && cols.xl) c = cols.xl;
  return Math.max(1, c);
}

/**
 * Hydration gate — block the grid's first *visible* paint until the first
 * viewport batch of product images is fully decoded.
 *
 * WHY: on refresh the browser mounts cards and starts decoding images
 * asynchronously; the compositor was presenting the grid before the top rows
 * finished decoding, so users saw partial rows, a bottom flicker and a
 * "first-scroll correction". We manually compute the first visible batch
 * (visible rows × columns — never relying on IntersectionObserver, which is
 * unreliable right after a refresh), await `img.decode()` on exactly those
 * images, and only then reveal the grid in a single commit.
 */
function useHydrationGate(
  containerRef: React.RefObject<HTMLElement | null>,
  cols: Cols,
  itemCount: number,
): boolean {
  const [hydrated, setHydrated] = useState(false);

  useLayoutEffect(() => {
    if (hydrated) return;
    const container = containerRef.current;
    if (!container || itemCount === 0 || typeof window === "undefined") {
      setHydrated(true);
      return;
    }

    let cancelled = false;
    const reveal = () => {
      if (!cancelled) setHydrated(true);
    };

    // K = first visible batch = visible rows × columns (+1 row of slack).
    const colCount = resolveColsWidth(cols, window.innerWidth);
    const visibleRows = Math.max(1, Math.ceil(window.innerHeight / 320));
    const k = Math.min(itemCount, colCount * (visibleRows + 1));

    const imgs = Array.from(
      container.querySelectorAll<HTMLImageElement>("img[data-product-image]"),
    ).slice(0, k);

    if (imgs.length === 0) {
      reveal();
      return;
    }

    const settle = (img: HTMLImageElement): Promise<void> => {
      const decode = () => {
        if (typeof img.decode === "function") {
          return img.decode().catch(() => undefined);
        }
        // Older WebViews without decode(): resolve on the next frame.
        return new Promise<void>((res) => {
          if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(() => res());
          } else {
            setTimeout(res, 32);
          }
        });
      };
      if (img.complete && img.naturalWidth > 0) return decode();
      return new Promise<void>((res) => {
        const done = () => res();
        img.addEventListener("load", () => decode().then(done), { once: true });
        img.addEventListener("error", done, { once: true });
      });
    };

    // Never leave the grid hidden forever — reveal after a hard safety cap.
    const safety = new Promise<void>((res) => setTimeout(res, 3000));

    Promise.race([Promise.all(imgs.map(settle)).then(() => undefined), safety]).then(
      reveal,
    );

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, cols, itemCount, hydrated]);

  return hydrated;
}

/**
 * Wraps grid content and keeps it invisible (opacity 0) until the first visible
 * image batch decodes, then reveals the whole grid in one commit. Layout is
 * fully mounted underneath the entire time, so lazy images still start loading
 * and there is zero layout shift on reveal.
 */
function HydrationGate({
  cols,
  itemCount,
  children,
}: {
  cols: Cols;
  itemCount: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const hydrated = useHydrationGate(ref, cols, itemCount);
  return (
    <div
      ref={ref}
      data-grid-hydrated={hydrated ? "true" : "false"}
      style={{
        opacity: hydrated ? 1 : 0,
        transition: hydrated ? "opacity 220ms ease-out" : undefined,
        // Avoid interaction with a not-yet-revealed grid.
        pointerEvents: hydrated ? undefined : "none",
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
}: {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  getKey: (item: T) => string;
  className?: string;
  cols: Cols;
  batchSize: number;
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
      <div data-product-grid className={className}>
        {shown.map((item, i) => (
          <div key={getKey(item)} data-product-card-frame className="h-full min-w-0 [&>*]:h-full">
            {renderItem(item, i)}
          </div>
        ))}
      </div>
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
}: {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  getKey: (item: T) => string;
  className?: string;
  cols: Cols;
  estimateRowHeight?: number;
  overscanRows?: number;
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
}: Props<T>) {
  const windowExperiment = useWindowExperiment();
  const big = items.length > virtualizeThreshold;
  const stableKey = getKey ?? ((item: T) => {
    const candidate = item as { id?: string | null; slug?: string | null };
    const key = candidate.id || candidate.slug;
    if (!key) throw new Error("VirtualizedProductGrid requires getKey for items without id/slug");
    return key;
  });

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
        />
      );
    }
    return (
      <IncrementalGrid
        items={items}
        renderItem={renderItem}
        getKey={stableKey}
        className={className}
        // 16 cards per batch keeps paint/memory cost low while feeling like
        // infinite scroll on low-end phones.
        batchSize={16}
      />
    );
  }

  // Small lists: plain responsive grid (also the SSR / first-paint output).
  return (
    <div data-product-grid className={className}>
      {items.map((item, i) => (
        <div key={stableKey(item)} data-product-card-frame className="h-full min-w-0 [&>*]:h-full">
          {renderItem(item, i)}
        </div>
      ))}
    </div>
  );
}

export default memo(VirtualizedProductGrid) as typeof VirtualizedProductGrid;
