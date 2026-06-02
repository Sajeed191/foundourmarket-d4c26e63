import { useNavigate, useRouterState } from "@tanstack/react-router";
import { User } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useAdminMode } from "@/lib/admin-mode";
import { useIsAdmin } from "@/lib/use-admin";

const POS_KEY = "fom_account_dock_pos";
const DEFAULT_POS = { x: 20, y: 20 }; // distance from right/bottom edges (px)
const BTN = 52; // approx button footprint for clamping

type Pos = { x: number; y: number };

function clampPos(p: Pos): Pos {
  if (typeof window === "undefined") return p;
  const maxX = Math.max(0, window.innerWidth - BTN);
  const maxY = Math.max(0, window.innerHeight - BTN);
  return { x: Math.min(Math.max(0, p.x), maxX), y: Math.min(Math.max(0, p.y), maxY) };
}

function readPos(): Pos {
  if (typeof window === "undefined") return DEFAULT_POS;
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.x === "number" && typeof parsed?.y === "number") return clampPos(parsed);
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_POS;
}

/**
 * Draggable, position-persistent account dock for tablet/desktop only.
 * Position is stored in localStorage so it stays put across refresh and login,
 * and is shared across all accounts on the device. Hidden on mobile.
 */
export function DesktopAccountDock() {
  const { user } = useAuth();
  const { adminMode } = useAdminMode();
  const { isAdmin } = useIsAdmin();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [pos, setPos] = useState<Pos>(DEFAULT_POS);
  const [ready, setReady] = useState(false);
  const dragging = useRef(false);
  const moved = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  // Load persisted position after mount (avoids SSR mismatch).
  useEffect(() => {
    setPos(readPos());
    setReady(true);
  }, []);

  // Keep the button on-screen when the viewport resizes.
  useEffect(() => {
    const onResize = () => setPos((p) => clampPos(p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    dragging.current = true;
    moved.current = false;
    offset.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging.current) return;
    const dx = e.clientX - offset.current.x;
    const dy = e.clientY - offset.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved.current = true;
    offset.current = { x: e.clientX, y: e.clientY };
    setPos((p) => clampPos({ x: p.x - dx, y: p.y - dy }));
  }, []);

  const endDrag = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    setPos((p) => {
      const next = clampPos(p);
      try {
        localStorage.setItem(POS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const onClick = useCallback(() => {
    if (moved.current) return; // ignore click that ended a drag
    navigate({ to: user ? "/account" : "/auth" });
  }, [navigate, user]);

  // Stay out of the way while staff are actively managing the store.
  if (adminMode && isAdmin) return null;

  const active = pathname === "/account" || pathname === "/auth";
  const label = user ? "Account" : "Sign in";

  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={onClick}
      style={{ right: pos.x, bottom: pos.y, visibility: ready ? "visible" : "hidden" }}
      className={`hidden md:flex fixed z-[var(--z-bottom-nav)] touch-none cursor-grab active:cursor-grabbing select-none items-center gap-2 rounded-full glass-strong border border-white/10 px-4 py-2.5 text-sm font-medium shadow-[0_8px_28px_-12px_oklch(0_0_0/0.6)] transition-colors print:hidden ${
        active ? "text-accent ring-1 ring-accent/40" : "text-white/80 hover:text-foreground"
      }`}
    >
      <span className="grid place-items-center size-7 rounded-full bg-accent/15 ring-1 ring-accent/30">
        <User className={`size-4 ${active ? "text-accent" : "text-white/80"}`} strokeWidth={active ? 2.4 : 2} />
      </span>
      {label}
    </button>
  );
}
