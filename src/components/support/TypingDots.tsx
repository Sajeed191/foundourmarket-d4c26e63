import { AnimatePresence, motion } from "framer-motion";

/**
 * Subtle premium typing indicator — "Support is typing •••" with animated dots.
 * Realtime-only; rendered inside the active conversation when the other party
 * is composing a reply.
 */
export function TypingIndicator({ show, label }: { show: boolean; label: string }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="flex justify-start"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 rounded-2xl glass px-3.5 py-2.5">
            <span className="text-xs text-muted-foreground">{label} is typing</span>
            <span className="flex items-center gap-1">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="size-1.5 rounded-full bg-accent"
                  animate={{ opacity: [0.25, 1, 0.25], y: [0, -2, 0] }}
                  transition={{ duration: 1, repeat: Infinity, ease: "easeInOut", delay: i * 0.2 }}
                />
              ))}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
