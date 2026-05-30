import { useCallback, useEffect, useRef, useState } from "react";

interface UseUndoRedoReturn<T> {
  state: T;
  set: (next: T | ((prev: T) => T), commit?: boolean) => void;
  /** Push the current state onto the history stack as a discrete step. */
  commit: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  reset: (next: T) => void;
}

/**
 * Multi-level undo/redo with keyboard shortcuts (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z
 * or Ctrl+Y). Touch/mobile editors call undo()/redo() directly from buttons.
 */
export function useUndoRedo<T>(
  initial: T,
  { maxDepth = 100, enableShortcuts = true } = {},
): UseUndoRedoReturn<T> {
  const [past, setPast] = useState<T[]>([]);
  const [present, setPresent] = useState<T>(initial);
  const [future, setFuture] = useState<T[]>([]);
  const presentRef = useRef(present);
  presentRef.current = present;

  const set = useCallback(
    (next: T | ((prev: T) => T), commit = true) => {
      setPresent((prev) => {
        const value =
          typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        if (commit && JSON.stringify(value) !== JSON.stringify(prev)) {
          setPast((p) => [...p, prev].slice(-maxDepth));
          setFuture([]);
        }
        return value;
      });
    },
    [maxDepth],
  );

  const commit = useCallback(() => {
    setPast((p) => [...p, presentRef.current].slice(-maxDepth));
    setFuture([]);
  }, [maxDepth]);

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const previous = p[p.length - 1];
      setFuture((f) => [presentRef.current, ...f]);
      setPresent(previous);
      return p.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setPast((p) => [...p, presentRef.current]);
      setPresent(next);
      return f.slice(1);
    });
  }, []);

  const reset = useCallback((next: T) => {
    setPast([]);
    setFuture([]);
    setPresent(next);
  }, []);

  useEffect(() => {
    if (!enableShortcuts) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enableShortcuts, undo, redo]);

  return {
    state: present,
    set,
    commit,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    reset,
  };
}
