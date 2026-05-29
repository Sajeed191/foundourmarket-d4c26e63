import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

interface VirtualTableProps<T> {
  rows: T[];
  rowKey: (row: T) => string;
  /** Estimated row height in px (desktop). */
  estimateSize?: number;
  /** Max height of the scroll viewport. */
  maxHeight?: number;
  header?: ReactNode;
  renderRow: (row: T, index: number) => ReactNode;
  empty?: ReactNode;
  /** Grid template applied to header + each row for column alignment. */
  gridTemplate?: string;
}

/**
 * Lightweight virtualized list for large admin datasets.
 * Renders only visible rows, preserves scroll position, and avoids full
 * re-renders on realtime appends. GPU-accelerated transforms only.
 */
export function VirtualTable<T>({
  rows,
  rowKey,
  estimateSize = 56,
  maxHeight = 560,
  header,
  renderRow,
  empty,
  gridTemplate,
}: VirtualTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 8,
  });

  if (!rows.length) {
    return <div className="p-8 text-center text-sm text-muted-foreground">{empty ?? "Nothing here yet."}</div>;
  }

  const items = virtualizer.getVirtualItems();

  return (
    <div>
      {header && (
        <div
          className="sticky top-0 z-10 border-b border-white/10 bg-background/80 backdrop-blur text-[10px] font-mono uppercase tracking-widest text-muted-foreground"
          style={gridTemplate ? { display: "grid", gridTemplateColumns: gridTemplate } : undefined}
        >
          {header}
        </div>
      )}
      <div
        ref={parentRef}
        className="overflow-auto overscroll-contain"
        style={{ maxHeight, contain: "strict" }}
      >
        <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
          {items.map((vi) => {
            const row = rows[vi.index];
            return (
              <div
                key={rowKey(row)}
                data-index={vi.index}
                ref={virtualizer.measureElement}
                className="absolute left-0 top-0 w-full"
                style={{ transform: `translateY(${vi.start}px)`, willChange: "transform" }}
              >
                <div
                  className="border-b border-white/5"
                  style={gridTemplate ? { display: "grid", gridTemplateColumns: gridTemplate } : undefined}
                >
                  {renderRow(row, vi.index)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
