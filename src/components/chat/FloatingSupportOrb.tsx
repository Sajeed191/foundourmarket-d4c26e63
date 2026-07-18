import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Headset, ShieldCheck, X } from "lucide-react";
import type { Availability } from "@/lib/crisp";
import { useIsAdmin } from "@/lib/use-admin";

/**
 * Premium floating support widget.
 *
 * • Perfect 60px circle, orange gradient, soft glow, gentle breathing.
 * • Customers: fixed position, tap opens a compact "Live Chat" panel.
 * • Admins: long-press (250ms) enters drag mode, position persists in
 *   localStorage (`chat_widget_x`, `chat_widget_y`) and applies site-wide
 *   on that device.
 * • Safe-area / bottom-nav aware, keyboard-aware, always clamped on-screen.
 * • GPU-only translate3d transforms, passive touch, honours reduced motion.
 */

const LS_X = "chat_widget_x";
const LS_Y = "chat_widget_y";
const ORB_SIZE = 60;
const EDGE = 12; // min gap to any screen edge
const LONG_PRESS_MS = 250;
const DRAG_ACTIVATE_PX = 8;

type Pos = { x: number; y: number } | null;

function readSavedPos(): Pos {
  if (typeof window === "undefined") return null;
  try {
    const x = Number(localStorage.getItem(LS_X));
    const y = Number(localStorage.getItem(LS_Y));
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  } catch { /* ignore */ }
  return null;
}

function clampToViewport(x: number, y: number, size = ORB_SIZE) {
  if (typeof window === "undefined") return { x, y };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const kb = window.visualViewport ? vh - window.visualViewport.height : 0;
  const bottomInset = Math.max(kb, getBottomInset());
  return {
    x: Math.max(EDGE, Math.min(vw - size - EDGE, x)),
    y: Math.max(EDGE + getTopInset(), Math.min(vh - size - EDGE - bottomInset, y)),
  };
}

function getTopInset(): number {
  if (typeof getComputedStyle === "undefined") return 0;
  const v = getComputedStyle(document.documentElement).getPropertyValue("--mobile-safe-top").trim();
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function getBottomInset(): number {
  if (typeof getComputedStyle === "undefined") return 90;
  const v = getComputedStyle(document.documentElement).getPropertyValue("--floating-bottom-offset").trim();
  const n = parseFloat(v);
  return Number.isFinite(n) ? n + 8 : 90;
}

function defaultPos(): { x: number; y: number } {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: vw - ORB_SIZE - 16,
    y: vh - ORB_SIZE - getBottomInset(),
  };
}

function hapticTap() {
  try { navigator.vibrate?.(15); } catch { /* ignore */ }
}

const STATUS_LABEL: Record<Availability, string> = {
  online: "Online",
  away: "Away",
  offline: "Offline",
};

const STATUS_DOT: Record<Availability, string> = {
  online: "bg-emerald-400",
  away: "bg-amber-400",
  offline: "bg-muted-foreground",
};

export function FloatingSupportOrb({
  availability,
  unread,
  hidden,
  onStartChat,
}: {
  availability: Availability;
  unread: number;
  hidden?: boolean;
  onStartChat: () => void;
}) {
  const { isAdmin } = useIsAdmin();
  const [pos, setPos] = useState<Pos>(null);
  const [dragging, setDragging] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  // Refs for pointer tracking
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerStart = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);
  const moved = useRef(false);
  const suppressClick = useRef(false);

  // Hydrate saved / default position
  useEffect(() => {
    const saved = readSavedPos();
    setPos(saved ?? defaultPos());
  }, []);

  // Re-clamp on resize / viewport / keyboard events
  useEffect(() => {
    const reclamp = () => {
      setPos((p) => (p ? clampToViewport(p.x, p.y) : p));
    };
    window.addEventListener("resize", reclamp);
    window.addEventListener("orientationchange", reclamp);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", reclamp);
    vv?.addEventListener("scroll", reclamp);
    return () => {
      window.removeEventListener("resize", reclamp);
      window.removeEventListener("orientationchange", reclamp);
      vv?.removeEventListener("resize", reclamp);
      vv?.removeEventListener("scroll", reclamp);
    };
  }, []);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isAdmin) return; // customers don't drag
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    pointerStart.current = { x: e.clientX, y: e.clientY, posX: rect.left, posY: rect.top };
    moved.current = false;
    suppressClick.current = false;
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      setDragging(true);
      hapticTap();
      try { target.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }, LONG_PRESS_MS);
  }, [isAdmin, clearLongPress]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const start = pointerStart.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!moved.current && Math.hypot(dx, dy) > DRAG_ACTIVATE_PX) {
      moved.current = true;
      // If user moved before long-press fired, cancel the long-press — this is a tap-scroll.
      if (!dragging) clearLongPress();
    }
    if (!dragging) return;
    e.preventDefault();
    const next = clampToViewport(start.posX + dx, start.posY + dy);
    setPos(next);
  }, [dragging, clearLongPress]);

  const onPointerEnd = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    clearLongPress();
    const wasDragging = dragging;
    if (wasDragging) {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      setDragging(false);
      suppressClick.current = true;
      const cur = pos ?? defaultPos();
      const snapped = clampToViewport(cur.x, cur.y);
      setPos(snapped);
      try {
        localStorage.setItem(LS_X, String(Math.round(snapped.x)));
        localStorage.setItem(LS_Y, String(Math.round(snapped.y)));
      } catch { /* ignore */ }
      // Clear the click-suppression on the next tick so future taps still work.
      setTimeout(() => { suppressClick.current = false; }, 0);
    }
    pointerStart.current = null;
    moved.current = false;
  }, [dragging, pos, clearLongPress]);

  const onClick = useCallback((e: React.MouseEvent) => {
    if (suppressClick.current) { e.preventDefault(); e.stopPropagation(); return; }
    setPanelOpen(true);
  }, []);

  const style = useMemo<React.CSSProperties>(() => {
    if (!pos) return { visibility: "hidden" };
    return {
      transform: `translate3d(${pos.x}px, ${pos.y}px, 0)${dragging ? " scale(1.08)" : ""}`,
      transition: dragging ? "none" : "transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease",
      opacity: dragging ? 0.95 : 1,
      willChange: "transform",
    };
  }, [pos, dragging]);

  const panelStyle = useMemo<React.CSSProperties>(() => {
    if (!pos || typeof window === "undefined") return {};
    const vw = window.innerWidth;
    const panelWidth = Math.min(280, vw - 24);
    // Prefer to open above the orb; anchor by right edge of orb.
    const rightAnchor = vw - (pos.x + ORB_SIZE);
    const bottomAnchor = window.innerHeight - pos.y + 12;
    return {
      right: `${Math.max(12, rightAnchor)}px`,
      bottom: `${Math.max(12, bottomAnchor)}px`,
      width: `${panelWidth}px`,
    };
  }, [pos]);

  return (
    <>
      {/* Backdrop for the compact panel — click anywhere else to dismiss. */}
      {panelOpen && (
        <div
          className="fixed inset-0 z-[64] bg-transparent"
          onClick={() => setPanelOpen(false)}
          aria-hidden
        />
      )}

      {/* Compact expand panel */}
      {panelOpen && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="FoundOurMarket™ Support"
          className="fixed z-[66] rounded-3xl border border-white/10 bg-card/95 backdrop-blur-xl shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)] p-4 animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200"
          style={panelStyle}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="grid place-items-center size-9 rounded-full bg-gradient-to-br from-primary to-[oklch(0.62_0.17_35)] text-primary-foreground shrink-0">
                <Headset className="size-4" strokeWidth={1.8} />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold leading-tight text-foreground truncate">Live Chat</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground leading-none">
                  <span className={`size-1.5 rounded-full ${STATUS_DOT[availability]}`} aria-hidden />
                  {availability === "online" ? "We're online" : availability === "away" ? "Away — leave a message" : "Offline — email backup"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              aria-label="Close support panel"
              className="size-7 grid place-items-center rounded-full text-muted-foreground hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg reply</p>
              <p className="mt-0.5 text-[12px] font-semibold text-foreground">&lt; 2 min</p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</p>
              <p className="mt-0.5 text-[12px] font-semibold text-foreground">{STATUS_LABEL[availability]}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => { setPanelOpen(false); onStartChat(); }}
            className="mt-3 w-full h-10 rounded-2xl bg-gradient-to-br from-primary to-[oklch(0.62_0.17_35)] text-primary-foreground text-sm font-semibold shadow-[0_8px_20px_-10px_rgba(255,140,0,0.6)] transition-transform duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            Start Chat
          </button>
        </div>
      )}

      {/* The orb */}
      <button
        ref={btnRef}
        type="button"
        data-floating-control
        aria-label={isAdmin ? "Support widget (long-press to move)" : "Open live chat"}
        aria-haspopup="dialog"
        aria-expanded={panelOpen}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        className={[
          "fixed left-0 top-0 z-[62] grid place-items-center rounded-full",
          "bg-gradient-to-br from-primary to-[oklch(0.62_0.17_35)] text-primary-foreground",
          "shadow-[0_10px_28px_-10px_rgba(0,0,0,0.55)] ring-1 ring-white/10",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70",
          "motion-safe:animate-orb-breathe touch-none select-none",
          hidden && !panelOpen && !dragging ? "orb-hidden" : "",
        ].join(" ")}
        style={{ width: ORB_SIZE, height: ORB_SIZE, ...style }}
      >
        {/* Soft glow ring */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            boxShadow: dragging
              ? "0 0 0 6px rgba(255,140,0,0.14), 0 0 40px 6px rgba(255,140,0,0.35)"
              : "0 0 0 3px rgba(255,140,0,0.08)",
          }}
        />
        <ShieldCheck className="size-6 relative" strokeWidth={1.8} aria-hidden />
        {unread > 0 && (
          <span
            aria-label={`${unread} unread`}
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold grid place-items-center ring-2 ring-background"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </>
  );
}
