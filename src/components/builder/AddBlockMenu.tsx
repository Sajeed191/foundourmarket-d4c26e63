import { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus } from "lucide-react";
import {
  BLOCK_TYPES,
  BLOCK_TYPE_META,
  type BlockType,
} from "@/lib/use-storefront-blocks";
import { BLOCK_ICON } from "@/components/builder/block-icons";

/** Block-type picker. Used both by the floating "+" and inline insert points. */
export function AddBlockMenu({
  open,
  onClose,
  onPick,
  title = "Add a block",
}: {
  open: boolean;
  onClose: () => void;
  onPick: (type: BlockType) => void;
  title?: string;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[140] grid place-items-center p-4 print:hidden">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-lg rounded-3xl border border-accent/25 bg-background/95 p-5 backdrop-blur-2xl shadow-[0_30px_80px_-20px_oklch(0.74_0.19_49/0.5)]"
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.25em] text-accent">
                <Plus className="size-3.5" /> {title}
              </p>
              <button onClick={onClose} aria-label="Close"
                className="grid size-7 place-items-center rounded-full text-muted-foreground hover:text-foreground">
                <X className="size-3.5" />
              </button>
            </div>
            <div className="grid max-h-[60vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
              {BLOCK_TYPES.map((t: BlockType) => {
                const meta = BLOCK_TYPE_META[t];
                const Icon = BLOCK_ICON[t];
                return (
                  <button
                    key={t}
                    onClick={() => { onPick(t); onClose(); }}
                    className="group flex flex-col items-start gap-2 rounded-2xl border border-white/5 bg-white/[0.02] p-3 text-left transition-all hover:border-accent/40 hover:bg-accent/10"
                  >
                    <span className="grid size-8 place-items-center rounded-xl bg-accent/10 text-accent transition-colors group-hover:bg-accent/20">
                      <Icon className="size-4" />
                    </span>
                    <span className="text-xs font-medium text-foreground">{meta.label}</span>
                    <span className="text-[10px] leading-tight text-muted-foreground">{meta.desc}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
