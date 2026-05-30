import { useCallback, useEffect, useRef, useState } from "react";
import {
  writeLocalDraft,
  syncDraft,
  clearLocalDraft,
  type SaveState,
} from "@/lib/drafts";

interface UseAutosaveOptions<T> {
  entityType: string;
  entityId: string;
  value: T;
  /** Whether the value differs from the last saved baseline. */
  enabled?: boolean;
  /** Debounce before persisting (ms). Default 1500. */
  debounceMs?: number;
  baseSnapshot?: unknown;
  /** Called when a remote sync succeeds. */
  onSynced?: () => void;
}

interface UseAutosaveReturn {
  state: SaveState;
  lastSavedAt: Date | null;
  /** Force an immediate flush (e.g. on blur / explicit save). */
  flush: () => Promise<void>;
  /** Mark the current value as committed (after a real publish/save). */
  markClean: () => void;
}

/**
 * Debounced background autosave: instant localStorage write for crash
 * recovery + throttled database sync. Never blocks the UI.
 */
export function useAutosave<T>({
  entityType,
  entityId,
  value,
  enabled = true,
  debounceMs = 1500,
  baseSnapshot,
  onSynced,
}: UseAutosaveOptions<T>): UseAutosaveReturn {
  const [state, setState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(value);
  const inFlight = useRef(false);
  latest.current = value;

  const doSync = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState("saving");
    try {
      await syncDraft(entityType, entityId, latest.current, baseSnapshot);
      setState("saved");
      setLastSavedAt(new Date());
      onSynced?.();
    } catch {
      setState("error");
    } finally {
      inFlight.current = false;
    }
  }, [entityType, entityId, baseSnapshot, onSynced]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    await doSync();
  }, [doSync]);

  const markClean = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    clearLocalDraft(entityType, entityId);
    setState("idle");
  }, [entityType, entityId]);

  useEffect(() => {
    if (!enabled) return;
    // Instant local persistence on every keystroke.
    writeLocalDraft(entityType, entityId, value);
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void doSync();
    }, debounceMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value), enabled]);

  // Flush pending work when the tab is hidden / closed.
  useEffect(() => {
    if (!enabled) return;
    const onHide = () => {
      writeLocalDraft(entityType, entityId, latest.current);
      void doSync();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [enabled, entityType, entityId, doSync]);

  return { state, lastSavedAt, flush, markClean };
}
