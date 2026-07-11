import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Share2 } from "lucide-react";
import type { ProductImage } from "@/lib/products";
import { resizedStorageImage } from "@/lib/storage-image";

/**
 * Immersive full-screen product gallery.
 *
 * Behaves as an independent modal overlay that completely covers the site UI
 * (top nav, bottom nav, sticky buy bar, floating controls) via a very high
 * z-index portal on <body>. Pure black, edge-to-edge canvas with:
 *   • horizontal swipe between images (with rubber-band + snap)
 *   • pinch-to-zoom, double-tap-to-zoom, and panning while zoomed
 *   • swipe-down-to-close with a fading backdrop
 *   • image counter + close (and optional share) controls
 *   • adjacent-image preloading and async decoding, max-resolution sources
 *
 * The PDP never unmounts while this is open, so the previous scroll position is
 * preserved automatically on close. All motion uses GPU-friendly transforms.
 */

const MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;

type Point = { x: number; y: number };

export function ImageLightbox({
  images,
  index,
  open,
  onClose,
  onIndexChange,
  alt,
  onShare,
}: {
  images: ProductImage[];
  index: number;
  open: boolean;
  onClose: () => void;
  onIndexChange: (i: number) => void;
  alt: string;
  onShare?: () => void;
}) {
  const count = images.length;

  // Live view transform for the CURRENT slide (zoom + pan).
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const panRef = useRef<Point>({ x: 0, y: 0 });
  const stageRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Gesture bookkeeping (all in refs so pointer handlers never re-render).
  const pointers = useRef<Map<number, Point>>(new Map());
  const dragStart = useRef<Point | null>(null);
  const panStart = useRef<Point>({ x: 0, y: 0 });
  const axis = useRef<"x" | "y" | "zoom" | null>(null);
  const pinchStartDist = useRef(0);
  const pinchStartZoom = useRef(1);
  const lastTap = useRef(0);
  const swipeClosing = useRef(false);

  const setTransforms = useCallback((animate: boolean) => {
    const track = trackRef.current;
    const stage = stageRef.current;
    if (track) track.style.transition = animate ? "transform 320ms cubic-bezier(0.22,0.61,0.36,1)" : "none";
    if (stage) stage.style.transition = animate ? "transform 220ms cubic-bezier(0.22,0.61,0.36,1)" : "none";
    if (stage) {
      stage.style.transform = `translate3d(${panRef.current.x}px, ${panRef.current.y}px, 0) scale(${zoomRef.current})`;
    }
  }, []);

  const applyTrack = useCallback((dx: number, animate: boolean, currentIndex: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = animate ? "transform 320ms cubic-bezier(0.22,0.61,0.36,1)" : "none";
    track.style.transform = `translate3d(calc(${-currentIndex * 100}% + ${dx}px), 0, 0)`;
  }, []);

  const resetZoom = useCallback((animate = true) => {
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    setZoom(1);
    setTransforms(animate);
  }, [setTransforms]);

  const clampPan = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const scaledW = rect.width;
    const scaledH = rect.height;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxX = Math.max(0, (scaledW - vw) / 2);
    const maxY = Math.max(0, (scaledH - vh) / 2);
    panRef.current.x = Math.min(maxX, Math.max(-maxX, panRef.current.x));
    panRef.current.y = Math.min(maxY, Math.max(-maxY, panRef.current.y));
  }, []);

  // Sync track when index changes externally / on open.
  useEffect(() => {
    if (!open) return;
    resetZoom(false);
    applyTrack(0, false, index);
  }, [index, open, applyTrack, resetZoom]);

  // Lock body scroll + keyboard controls while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (zoomRef.current > 1) return;
      if (e.key === "ArrowRight" && count > 1) onIndexChange((index + 1) % count);
      if (e.key === "ArrowLeft" && count > 1) onIndexChange((index - 1 + count) % count);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, count, index, onClose, onIndexChange]);

  const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()];
      pinchStartDist.current = dist(p1, p2);
      pinchStartZoom.current = zoomRef.current;
      axis.current = "zoom";
      dragStart.current = null;
      return;
    }

    dragStart.current = { x: e.clientX, y: e.clientY };
    panStart.current = { ...panRef.current };
    axis.current = null;
    swipeClosing.current = false;

    // Double-tap to zoom.
    const now = Date.now();
    if (now - lastTap.current < 280) {
      lastTap.current = 0;
      const stage = stageRef.current;
      if (zoomRef.current > 1) {
        resetZoom(true);
      } else if (stage) {
        const rect = stage.getBoundingClientRect();
        const cx = e.clientX - (rect.left + rect.width / 2);
        const cy = e.clientY - (rect.top + rect.height / 2);
        zoomRef.current = DOUBLE_TAP_ZOOM;
        panRef.current = { x: -cx * (DOUBLE_TAP_ZOOM - 1), y: -cy * (DOUBLE_TAP_ZOOM - 1) };
        clampPan();
        setZoom(DOUBLE_TAP_ZOOM);
        setTransforms(true);
      }
      axis.current = "zoom";
    } else {
      lastTap.current = now;
    }
  }, [clampPan, resetZoom, setTransforms]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Pinch zoom.
    if (pointers.current.size >= 2) {
      const [p1, p2] = [...pointers.current.values()];
      const d = dist(p1, p2);
      if (pinchStartDist.current > 0) {
        const next = Math.min(MAX_ZOOM, Math.max(1, pinchStartZoom.current * (d / pinchStartDist.current)));
        zoomRef.current = next;
        clampPan();
        setZoom(next);
        setTransforms(false);
      }
      return;
    }

    if (!dragStart.current || axis.current === "zoom") return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;

    // Panning while zoomed.
    if (zoomRef.current > 1) {
      panRef.current = { x: panStart.current.x + dx, y: panStart.current.y + dy };
      clampPan();
      setTransforms(false);
      return;
    }

    // Lock axis on first meaningful movement.
    if (!axis.current && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }

    if (axis.current === "x") {
      let resist = dx;
      // Rubber-band at the ends.
      if ((index === 0 && dx > 0) || (index === count - 1 && dx < 0)) resist = dx * 0.35;
      applyTrack(resist, false, index);
    } else if (axis.current === "y") {
      swipeClosing.current = true;
      const c = containerRef.current;
      if (c) {
        c.style.transition = "none";
        c.style.transform = `translate3d(0, ${dy}px, 0)`;
        const bg = Math.max(0, 1 - Math.abs(dy) / 500);
        c.style.setProperty("--lb-bg", String(bg));
      }
    }
  }, [applyTrack, clampPan, count, index, setTransforms]);

  const endGesture = useCallback((e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);

    if (pointers.current.size >= 1) {
      // Coming out of pinch; keep remaining pointer as a fresh drag origin.
      const remaining = [...pointers.current.values()][0];
      dragStart.current = { ...remaining };
      panStart.current = { ...panRef.current };
      axis.current = zoomRef.current > 1 ? null : "zoom";
      return;
    }

    if (zoomRef.current <= 1.02 && zoomRef.current !== 1) {
      resetZoom(true);
    }

    // Finish vertical swipe-to-close.
    if (axis.current === "y" && swipeClosing.current) {
      const c = containerRef.current;
      const dy = e.clientY - (dragStart.current?.y ?? e.clientY);
      if (Math.abs(dy) > 110) {
        const dir = dy > 0 ? 1 : -1;
        if (c) {
          c.style.transition = "transform 240ms ease, opacity 240ms ease";
          c.style.transform = `translate3d(0, ${dir * window.innerHeight}px, 0)`;
          c.style.opacity = "0";
        }
        setTimeout(onClose, 200);
        return;
      }
      if (c) {
        c.style.transition = "transform 260ms cubic-bezier(0.22,0.61,0.36,1)";
        c.style.transform = "translate3d(0,0,0)";
        c.style.setProperty("--lb-bg", "1");
      }
    }

    // Finish horizontal swipe (snap / change image).
    if (axis.current === "x" && zoomRef.current === 1) {
      const dx = e.clientX - (dragStart.current?.x ?? e.clientX);
      const threshold = Math.min(90, window.innerWidth * 0.18);
      if (dx <= -threshold && index < count - 1) {
        onIndexChange(index + 1);
      } else if (dx >= threshold && index > 0) {
        onIndexChange(index - 1);
      } else {
        applyTrack(0, true, index);
      }
    }

    dragStart.current = null;
    axis.current = null;
    swipeClosing.current = false;
  }, [applyTrack, count, index, onClose, onIndexChange, resetZoom]);

  if (typeof document === "undefined" || !open) return null;

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 flex flex-col select-none print:hidden animate-fade-in"
      style={{
        zIndex: 2147483647,
        // Pure black canvas; --lb-bg drives the fade while swiping to close.
        backgroundColor: "rgb(0 0 0 / var(--lb-bg, 1))",
        touchAction: "none",
        willChange: "transform",
      }}
    >
      {/* Controls */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <button
          onClick={onClose}
          aria-label="Close gallery"
          className="pointer-events-auto grid size-10 place-items-center rounded-full bg-white/10 text-white backdrop-blur-md transition-transform active:scale-90"
        >
          <X className="size-5" />
        </button>
        <span className="pointer-events-none rounded-full bg-black/40 px-3 py-1 text-[12px] font-medium tabular-nums text-white/90 backdrop-blur-md">
          {index + 1} / {count}
        </span>
        {onShare ? (
          <button
            onClick={onShare}
            aria-label="Share"
            className="pointer-events-auto grid size-10 place-items-center rounded-full bg-white/10 text-white backdrop-blur-md transition-transform active:scale-90"
          >
            <Share2 className="size-5" />
          </button>
        ) : (
          <span className="size-10" />
        )}
      </div>

      {/* Swipe/zoom surface */}
      <div
        className="relative flex-1 overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
      >
        <div
          ref={trackRef}
          className="flex h-full w-full"
          style={{ willChange: "transform", transform: `translate3d(${-index * 100}%, 0, 0)` }}
        >
          {images.map((img, i) => {
            const near = Math.abs(i - index) <= 1;
            const isActive = i === index;
            return (
              <div key={img.id} className="flex h-full w-full shrink-0 items-center justify-center">
                {near ? (
                  <div
                    ref={isActive ? stageRef : undefined}
                    className="flex h-full w-full items-center justify-center"
                    style={
                      isActive
                        ? {
                            willChange: "transform",
                            transform: `translate3d(${panRef.current.x}px, ${panRef.current.y}px, 0) scale(${zoom})`,
                          }
                        : undefined
                    }
                  >
                    <img
                      src={resizedStorageImage(img.url, 1600, 78)}
                      alt={img.alt || alt}
                      draggable={false}
                      decoding="async"
                      loading="eager"
                      fetchPriority={isActive ? "high" : "low"}
                      onError={(e) => { if (e.currentTarget.src !== img.url) e.currentTarget.src = img.url; }}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
