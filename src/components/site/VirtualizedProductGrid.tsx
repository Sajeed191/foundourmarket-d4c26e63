import { useEffect, useMemo, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";

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
 * Window-virtualized product grid. Renders only the rows near the viewport
 * (plus a small overscan), keeping the DOM tiny even for catalogs with
 * hundreds of products — critical for 2–4GB Android devices where a large
 * card count causes jank and memory pressure.
 *
 * Small lists fall back to a plain responsive grid so layout/SSR stay
 * identical to before and there is zero virtualization overhead.
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
  // Track the container's distance from the document top as LIVE state. The
  // window virtualizer needs this as `scrollMargin` to place rows correctly.
  // Reading `parentRef.current.offsetTop` only at render time goes stale when
  // content above the grid reflows (lazy images decoding, async banners) — on
  // Android that stale offset mis-positions rows so they overlap previously
  // painted rows, which reads as duplicated / ghosted cards.
  const [offsetTop, setOffsetTop] = useState(0);

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

  const shouldVirtualize = items.length > virtualizeThreshold && width > 0;
  const colCount = useMemo(() => colsForWidth(cols, width || 1280), [cols, width]);
  const gap = gapForWidth(width || 1280);
  const rowCount = Math.ceil(items.length / colCount);

  const rowVirtualizer = useWindowVirtualizer({
    count: shouldVirtualize ? rowCount : 0,
    estimateSize: () => estimateRowHeight + gap,
    overscan,
    scrollMargin: offsetTop,
  });

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
        // Isolate paint/layout for the scroll body so the compositor only
        // repaints the rows that actually change.
        contain: "layout paint style",
      }}
    >
      {rowVirtualizer.getVirtualItems().map((vRow) => {
        const start = vRow.index * colCount;
        const rowItems = items.slice(start, start + colCount);
        // Stable key derived from the row's actual content (not the virtual
        // index) so React never reuses a row's DOM node for a different set of
        // products — preventing recycled nodes from showing stale cards.
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
              // Per-row paint containment + an explicit compositor layer. This
              // is the key fix for Android Chrome/WebView "ghost row" artifacts:
              // without it, the GPU fails to invalidate the old tile when a row
              // is repositioned during fast scroll, leaving duplicated cards.
              contain: "layout paint style",
              willChange: "transform",
              backfaceVisibility: "hidden",
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
