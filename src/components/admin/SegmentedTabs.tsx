import { useRef } from "react";
import { motion } from "framer-motion";

export type SegItem<T extends string> = { value: T; label: string; icon?: React.ReactNode };

export function SegmentedTabs<T extends string>({
  items, value, onChange, layoutId = "seg-active",
}: {
  items: SegItem<T>[];
  value: T;
  onChange: (v: T) => void;
  layoutId?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative">
      {/* edge fade masks */}
      <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 z-10 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 z-10 bg-gradient-to-l from-background to-transparent" />
      <div
        ref={scrollRef}
        className="flex gap-1 overflow-x-auto no-scrollbar p-1 rounded-full glass-strong"
        style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
      >
        {items.map((it) => {
          const active = it.value === value;
          return (
            <motion.button
              key={it.value}
              onClick={() => {
                onChange(it.value);
                requestAnimationFrame(() => {
                  const el = scrollRef.current?.querySelector(`[data-seg="${it.value}"]`);
                  el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
                });
              }}
              data-seg={it.value}
              whileTap={{ scale: 0.93 }}
              className={`relative shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[11px] font-mono uppercase tracking-widest whitespace-nowrap transition-colors ${
                active ? "text-accent-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {active && (
                <motion.span
                  layoutId={layoutId}
                  className="absolute inset-0 rounded-full bg-accent shadow-[var(--shadow-ember)]"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              {it.icon && <span className="relative z-10">{it.icon}</span>}
              <span className="relative z-10">{it.label}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
