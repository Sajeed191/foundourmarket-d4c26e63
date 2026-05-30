import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/** Global open/close state for the Admin Command Center palette. */
type Ctx = {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
};

const CommandCenterContext = createContext<Ctx | null>(null);

export function CommandCenterProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo(() => ({ open, setOpen, toggle }), [open, toggle]);
  return <CommandCenterContext.Provider value={value}>{children}</CommandCenterContext.Provider>;
}

export function useCommandCenter() {
  const ctx = useContext(CommandCenterContext);
  if (!ctx) throw new Error("useCommandCenter must be inside CommandCenterProvider");
  return ctx;
}

/* ---------------- persistent recents / pinned (per-device) ---------------- */

const RECENT_SEARCH_KEY = "fom_cmd_recent_searches";
const RECENT_ACTION_KEY = "fom_cmd_recent_actions";
const PINNED_KEY = "fom_cmd_pinned";

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / SSR */
  }
}

export function pushRecentSearch(q: string) {
  const term = q.trim();
  if (term.length < 2) return;
  const list = read<string[]>(RECENT_SEARCH_KEY, []).filter((x) => x !== term);
  list.unshift(term);
  write(RECENT_SEARCH_KEY, list.slice(0, 8));
}

export function getRecentSearches(): string[] {
  return read<string[]>(RECENT_SEARCH_KEY, []);
}

export type RecentAction = { id: string; label: string; to?: string; icon?: string };

export function pushRecentAction(a: RecentAction) {
  const list = read<RecentAction[]>(RECENT_ACTION_KEY, []).filter((x) => x.id !== a.id);
  list.unshift(a);
  write(RECENT_ACTION_KEY, list.slice(0, 10));
}

export function getRecentActions(): RecentAction[] {
  return read<RecentAction[]>(RECENT_ACTION_KEY, []);
}

export function getPinned(): RecentAction[] {
  return read<RecentAction[]>(PINNED_KEY, []);
}

export function togglePinned(a: RecentAction): RecentAction[] {
  const list = read<RecentAction[]>(PINNED_KEY, []);
  const exists = list.some((x) => x.id === a.id);
  const next = exists ? list.filter((x) => x.id !== a.id) : [a, ...list].slice(0, 12);
  write(PINNED_KEY, next);
  return next;
}
