import { useRef, useState, type ReactNode } from "react";
import { motion, useAnimation } from "framer-motion";
import { cn } from "@/lib/utils";

export type SwipeAction = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Tailwind-friendly background class for the revealed action. */
  tone?: "accent" | "danger" | "muted";
  onAction: () => void;
};

const TONE: Record<NonNullable<SwipeAction["tone"]>, string> = {
  accent: "bg-accent text-accent-foreground",
  danger: "bg-destructive text-destructive-foreground",
  muted: "bg-muted text-foreground",
};

/**
 * App-like swipeable row primitive for the mobile admin experience.
 *
 * - Swipe left to reveal trailing actions (e.g. archive / delete / hide).
 * - Swipe right to reveal a leading action (e.g. publish / approve).
 * - Long-press (550ms) opens a context menu of all actions.
 *
 * Pure UX surface — every callback should run through a staff-gated
 * server function / RLS-protected mutation. This component performs no writes.
 */
export function SwipeRow({
  children,
  leading,
  trailing = [],
  onLongPress,
  className,
}: {
  children: ReactNode;
  leading?: SwipeAction;
  trailing?: SwipeAction[];
  onLongPress?: () => void;
  className?: string;
}) {
  const controls = useAnimation();
  const [menuOpen, setMenuOpen] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragged = useRef(false);

  const trailingWidth = Math.min(trailing.length, 2) * 76;
  const leadingWidth = leading ? 76 : 0;

  function startPress() {
    dragged.current = false;
    pressTimer.current = setTimeout(() => {
      if (!dragged.current) {
        navigator.vibrate?.(12);
        setMenuOpen(true);
        onLongPress?.();
      }
    }, 550);
  }
  function endPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  }

  const allActions = [...(leading ? [leading] : []), ...trailing];

  return (
    <div className={cn("relative overflow-hidden rounded-2xl", className)}>
      {/* Revealed action rails */}
      {leading && (
        <button
          onClick={() => {
            leading.onAction();
            void controls.start({ x: 0 });
          }}
          className={cn(
            "absolute inset-y-0 left-0 flex w-[76px] flex-col items-center justify-center gap-1 text-[10px] font-mono uppercase tracking-widest",
            TONE[leading.tone ?? "accent"],
          )}
        >
          <leading.icon className="size-4" />
          {leading.label}
        </button>
      )}
      <div className="absolute inset-y-0 right-0 flex">
        {trailing.slice(0, 2).map((a) => (
          <button
            key={a.label}
            onClick={() => {
              a.onAction();
              void controls.start({ x: 0 });
            }}
            className={cn(
              "flex w-[76px] flex-col items-center justify-center gap-1 text-[10px] font-mono uppercase tracking-widest",
              TONE[a.tone ?? "muted"],
            )}
          >
            <a.icon className="size-4" />
            {a.label}
          </button>
        ))}
      </div>

      {/* Foreground draggable card */}
      <motion.div
        drag="x"
        dragConstraints={{ left: -trailingWidth, right: leadingWidth }}
        dragElastic={0.08}
        animate={controls}
        onDragStart={() => { dragged.current = true; endPress(); }}
        onDragEnd={(_, info) => {
          if (info.offset.x < -trailingWidth / 2 && trailingWidth) {
            void controls.start({ x: -trailingWidth });
          } else if (info.offset.x > leadingWidth / 2 && leadingWidth) {
            void controls.start({ x: leadingWidth });
          } else {
            void controls.start({ x: 0 });
          }
        }}
        onPointerDown={startPress}
        onPointerUp={endPress}
        onPointerCancel={endPress}
        className="relative z-10 touch-pan-y bg-card"
      >
        {children}
      </motion.div>

      {/* Long-press context menu */}
      {menuOpen && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={() => setMenuOpen(false)}>
          <div
            className="grid w-[min(20rem,90%)] gap-1.5 rounded-2xl border border-accent/25 bg-background/95 p-2 shadow-[0_20px_60px_-15px_oklch(0.74_0.19_49/0.45)]"
            onClick={(e) => e.stopPropagation()}
          >
            {allActions.map((a) => (
              <button
                key={a.label}
                onClick={() => { a.onAction(); setMenuOpen(false); }}
                className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 text-left text-sm transition-colors hover:border-accent/40 hover:bg-accent/10"
              >
                <a.icon className="size-4 text-accent" />
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
