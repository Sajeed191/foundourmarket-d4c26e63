import { memo, useEffect, useRef, useState } from "react";

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
 * Transform-free incremental product grid (all platforms).
 *
 * WHY no window virtualizer anymore:
 * The previous transform-based `useWindowVirtualizer` path placed each row with
 * `position: absolute` + `transform: translateY()` + `contain: layout paint
 * style` and re-measured row heights with `measureElement`. When a card's
 * height changed after mount (e.g. the ProductCard static→rich swap, or image
 * decode), the virtualizer repositioned rows mid-scroll. On BOTH Chromium and
 * Safari this produces duplicated/overlapping titles, stale images and ghost
 * paint during fast fling scrolling — the corruption reported on iPhone *and*
 * Android. Android was already excluded from the virtualizer, which is why the
 * iOS case persisted.
 *
 * The fix is to render every item in normal document flow inside a plain CSS
 * grid (no transforms, no promoted layers, no dynamic measurement) and simply
 * grow the visible window in small batches via an IntersectionObserver
 * sentinel. This:
 *   - eliminates the cross-platform compositor ghosting at its source,
 *   - keeps the DOM bounded on first paint (memory friendly on 2–8GB phones),
 *   - preserves SEO (real items are rendered, just grown over time),
 *   - keeps stable component identity (keys come from the caller's renderItem).
 */
function IncrementalGrid<T>({
  items,
  renderItem,
  getKey,
  className,
  batchSize,
}: {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  getKey: (item: T) => string;
  className?: string;
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

/**
 * Adaptive product grid — now a single, transform-free strategy for every
 * platform (desktop, iOS, Android). Small lists render as a plain responsive
 * grid (also the SSR output); large lists grow incrementally for bounded
 * memory. No virtualization, no transforms, no layer promotion.
 */
export function VirtualizedProductGrid<T>({
  items,
  renderItem,
  getKey,
  className,
  virtualizeThreshold = 32,
}: Props<T>) {
  const big = items.length > virtualizeThreshold;
  const stableKey = getKey ?? ((item: T) => {
    const candidate = item as { id?: string | null; slug?: string | null };
    const key = candidate.id || candidate.slug;
    if (!key) throw new Error("VirtualizedProductGrid requires getKey for items without id/slug");
    return key;
  });

  // Large catalogs: bounded, incremental, transform-free rendering.
  if (big) {
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
