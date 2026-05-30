import { motion, AnimatePresence } from "framer-motion";
import { Pencil, X } from "lucide-react";
import { useAdminEditing } from "@/lib/admin-overlay";
import { useAdminMode } from "@/lib/admin-mode";

/**
 * Global visual indicator for the admin overlay. When a staff member turns on
 * Admin Mode, the whole storefront becomes inline-editable — this banner makes
 * that state obvious and offers a one-tap exit. Renders nothing for customers
 * or when the overlay is off.
 */
export function AdminOverlayIndicator() {
  const { canEdit } = useAdminEditing();
  const { setAdminMode } = useAdminMode();

  return (
    <AnimatePresence>
      {canEdit && (
        <>
          {/* Subtle accent frame around the viewport while editing is active. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-hidden
            className="pointer-events-none fixed inset-0 z-[55] rounded-[inherit] border-2 border-accent/30 print:hidden"
          />
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed left-1/2 top-3 z-[56] -translate-x-1/2 print:hidden"
          >
            <div className="flex items-center gap-2 rounded-full border border-accent/40 bg-background/80 px-3 py-1.5 backdrop-blur-2xl shadow-[0_10px_30px_-10px_oklch(0.74_0.19_49/0.5)]">
              <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-accent">
                <Pencil className="size-3" /> Editing live
              </span>
              <button
                onClick={() => setAdminMode(false)}
                className="grid size-5 place-items-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Exit admin editing"
              >
                <X className="size-3" />
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
