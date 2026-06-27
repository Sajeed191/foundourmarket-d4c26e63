import { useEffect, useMemo, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { detectAndroid } from "@/lib/use-low-end-device";

type Cols = { base: number; sm?: number; md?: number; lg?: number; xl?: number };

type Props<T> = {
  items: T[];
  /** Render a single item. Must return a keyed React element. */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Column counts per Tailwind breakpoint, used by the virtualized path. */
  cols: Cols;
  /** Fallback grid className used for small lists (SSR-safe, no virtualization). */
  className?: string;
  /** Rough row height estimate; corrected by measurement after first paint. */
  estimateRowHeight?: number;
  /** Overscan rows above/below the viewport. */
  overscan?: number;
  /** Only virtualize once the list exceeds this size. */
  virtualizeThreshold?: number;
};

function colsForWidth(cols: Cols, w: number): number {
  if (w >= 1280 && cols.xl) return cols.xl;
  if (w >= 1024 && cols.lg) return cols.lg;
  if (w >= 768 && cols.md) return cols.md;
  if (w >= 640 && cols.sm) return cols.sm;
  return cols.base;
}

// Mirrors the gap-3 / sm:gap-5 / lg:gap-6 rhythm used across the storefront.
function gapForWidth(w: number): number {
  if (w >= 1024) return 24;
  if (w >= 640) return 20;
  return 12;
}

/**

 * Android / low-end rendering path: NO virtualization, NO transform offsets,
 * NO promoted compositor layers. Items render in normal document flow inside a
 * plain CSS grid and are revealed incrementally in small batches via an
 * IntersectionObserver sentinel. This sidesteps the Android Chrome/WebView
 * compositor bug where transform-positioned, layer-promoted virtual rows fail
 * to invalidate during fast scroll (ghosting / duplicated cards / glitch
 * lines). SEO is preserved — real items are rendered, just grown over time.
 */
function IncrementalGrid<T>({
  items,
  renderItem,
  className,
  batchSize,
}: {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  className?: string;
  batchSize: number;
}) {
  const [visible, setVisible] = useState(() => Math.min(items.length, batchSize));
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Reset the window when the dataset changes (filter/sort/navigation).
  useEffect(() => {
    setVisible(Math.min(items.length, batchSize));
  }, [items, batchSize]);

  useEffect(() => {
    if (visible >= items.length) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible((v) => Math.min(items.length, v + batchSize));
        }
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, items.length, batchSize]);

  const shown = items.slice(0, visible);

  return (
    <>
      <div className={className}>{shown.map((item, i) => renderItem(item, i))}</div>
      {visible < items.length && (
        <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />
      )}
    </>
  );
}

/**
 * Adaptive product grid.
 *
 * - Desktop / high-performance browsers: window virtualization keeps the DOM
 *   tiny for large catalogs.
 * - Android (Chrome / WebView / Samsung Internet): switches to a transform-free
 *   incremental grid to eliminate GPU compositor corruption on fast scroll.
 * - Small lists everywhere: a plain responsive grid (also the SSR output).
 */
export function VirtualizedProductGrid<T>({
  items,
  renderItem,
  cols,
  className,
  estimateRowHeight = 340,
  overscan = 4,
  virtualizeThreshold = 32,
}: Props<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [isAndroid, setIsAndroid] = useState(false);
  // Track the container's distance from the document top as LIVE state. The
  // window virtualizer needs this as `scrollMargin` to place rows correctly.
  const [offsetTop, setOffsetTop] = useState(0);

  useEffect(() => {
    setIsAndroid(detectAndroid());
  }, []);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const measure = () => {
      setWidth(el.clientWidth);
      const rect = el.getBoundingClientRect();
      setOffsetTop(rect.top + window.scrollY);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, []);

  const big = items.length > virtualizeThreshold;
  // Only the desktop / non-Android path uses the transform-based virtualizer.
  const shouldVirtualize = big && width > 0 && !isAndroid;
  const colCount = useMemo(() => colsForWidth(cols, width || 1280), [cols, width]);
  const gap = gapForWidth(width || 1280);
  const rowCount = Math.ceil(items.length / colCount);

  const rowVirtualizer = useWindowVirtualizer({
    count: shouldVirtualize ? rowCount : 0,
    estimateSize: () => estimateRowHeight + gap,
    overscan,
    scrollMargin: offsetTop,
  });

  // Android (or any non-virtualized large list): transform-free incremental grid.
  if (isAndroid && big) {
    return (
      <div ref={parentRef}>
        <IncrementalGrid
          items={items}
          renderItem={renderItem}
          className={className}
          // ~30 cards per batch keeps memory and paint cost low on 2–4GB phones.
          batchSize={30}
        />
      </div>
    );
  }

  // Fallback: plain responsive grid (also the SSR / first-paint output).
  if (!shouldVirtualize) {
    return (
      <div ref={parentRef} className={className}>
        {items.map((item, i) => renderItem(item, i))}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      style={{
        position: "relative",
        height: rowVirtualizer.getTotalSize(),
        contain: "layout paint style",
      }}
    >
      {rowVirtualizer.getVirtualItems().map((vRow) => {
        const start = vRow.index * colCount;
        const rowItems = items.slice(start, start + colCount);
        const rowKey = (rowItems[0] as { id?: string | number; slug?: string } | undefined);
        return (
          <div
            key={rowKey?.id ?? rowKey?.slug ?? vRow.key}
            data-index={vRow.index}
            ref={rowVirtualizer.measureElement}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${vRow.start - rowVirtualizer.options.scrollMargin}px)`,
              display: "grid",
              gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
              gap,
              paddingBottom: gap,
              alignItems: "stretch",
              // Desktop-only path. Paint containment keeps row repaints isolated;
              // we deliberately omit `will-change`/`backface-visibility` here to
              // avoid promoting an extra compositor layer per row.
              contain: "layout paint style",
            }}
          >
            {rowItems.map((item, i) => renderItem(item, start + i))}
          </div>
        );
      })}
    </div>
  );
}

export default VirtualizedProductGrid;
