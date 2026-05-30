import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import type { ProductImage } from "@/lib/products";

/**
 * Full-screen customer image viewer. Lets shoppers easily browse every
 * product image with swipe / arrow navigation, thumbnails and keyboard
 * controls. Pure presentation — opened from the product gallery.
 */
export function ImageLightbox({
  images,
  index,
  open,
  onClose,
  onIndexChange,
  alt,
}: {
  images: ProductImage[];
  index: number;
  open: boolean;
  onClose: () => void;
  onIndexChange: (i: number) => void;
  alt: string;
}) {
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const count = images.length;

  const next = useCallback(() => {
    if (count > 0) onIndexChange((index + 1) % count);
  }, [count, index, onIndexChange]);
  const prev = useCallback(() => {
    if (count > 0) onIndexChange((index - 1 + count) % count);
  }, [count, index, onIndexChange]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, next, prev, onClose]);

  if (typeof document === "undefined") return null;

  const current = images[index];

  return createPortal(
    <AnimatePresence>
      {open && current && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[140] flex flex-col bg-background/95 backdrop-blur-xl print:hidden"
        >
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
              {index + 1} / {count}
            </span>
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid size-10 place-items-center rounded-full border border-white/10 text-muted-foreground hover:text-foreground"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Stage */}
          <div
            className="relative flex flex-1 items-center justify-center px-4"
            onTouchStart={(e) => setTouchStart(e.touches[0].clientX)}
            onTouchEnd={(e) => {
              if (touchStart == null) return;
              const dx = e.changedTouches[0].clientX - touchStart;
              if (dx > 50) prev();
              else if (dx < -50) next();
              setTouchStart(null);
            }}
          >
            {count > 1 && (
              <button
                onClick={prev}
                aria-label="Previous image"
                className="absolute left-2 z-10 grid size-11 place-items-center rounded-full border border-white/10 bg-background/60 text-foreground hover:bg-accent/15 hover:text-accent"
              >
                <ChevronLeft className="size-5" />
              </button>
            )}
            <AnimatePresence mode="wait">
              <motion.img
                key={current.id}
                src={current.url}
                alt={current.alt || alt}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="max-h-[72vh] max-w-full rounded-2xl object-contain"
              />
            </AnimatePresence>
            {count > 1 && (
              <button
                onClick={next}
                aria-label="Next image"
                className="absolute right-2 z-10 grid size-11 place-items-center rounded-full border border-white/10 bg-background/60 text-foreground hover:bg-accent/15 hover:text-accent"
              >
                <ChevronRight className="size-5" />
              </button>
            )}
          </div>

          {/* Thumbnails */}
          {count > 1 && (
            <div className="flex justify-center gap-2 overflow-x-auto px-4 py-4">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  onClick={() => onIndexChange(i)}
                  aria-label={`View image ${i + 1}`}
                  className={`size-14 shrink-0 overflow-hidden rounded-lg border transition-all ${
                    i === index
                      ? "border-accent ring-2 ring-accent/30"
                      : "border-border opacity-60 hover:opacity-100"
                  }`}
                >
                  <img src={img.url} alt="" className="size-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
