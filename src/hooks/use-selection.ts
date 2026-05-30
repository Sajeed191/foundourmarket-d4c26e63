import { useCallback, useMemo, useRef, useState } from "react";

/**
 * Multi-select state for product grids/tables/lists.
 * - tap toggles when in selection mode
 * - long-press (mobile) enters selection mode and selects the item
 * - supports select-all / clear over a provided id universe
 */
export function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [active, setActive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => { setSelected(new Set()); setActive(false); }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelected((prev) => {
      const allSelected = ids.length > 0 && ids.every((i) => prev.has(i));
      return allSelected ? new Set() : new Set(ids);
    });
    setActive(true);
  }, []);

  const enterWith = useCallback((id: string) => {
    setActive(true);
    setSelected((prev) => new Set(prev).add(id));
  }, []);

  // long-press handlers for touch
  const longPress = useCallback((id: string) => ({
    onTouchStart: () => {
      timer.current = setTimeout(() => {
        if (navigator.vibrate) navigator.vibrate(15);
        enterWith(id);
      }, 450);
    },
    onTouchEnd: () => { if (timer.current) clearTimeout(timer.current); },
    onTouchMove: () => { if (timer.current) clearTimeout(timer.current); },
  }), [enterWith]);

  const ids = useMemo(() => Array.from(selected), [selected]);

  return { selected, ids, active, setActive, toggle, clear, selectAll, enterWith, longPress, has: (id: string) => selected.has(id) };
}
