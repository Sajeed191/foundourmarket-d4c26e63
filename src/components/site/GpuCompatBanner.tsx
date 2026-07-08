import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGpuUnsafe } from "@/lib/gpu-compat";
import { AlertTriangle, X } from "lucide-react";

const DISMISS_KEY = "fom-compat-banner-dismissed";

/**
 * Compatibility Mode notice — shown ONCE on gpu-unsafe devices only.
 *
 * UI/UX ONLY. Detection (useGpuUnsafe) and Compatibility Mode logic are
 * untouched. Compact bottom sheet on mobile, small bottom-right toast on
 * desktop. Never covers the bottom nav or floating support buttons.
 *
 * State management:
 *   - bannerDismissed → persisted in localStorage
 *   - isCompatDialogOpen → single boolean; while the "Learn More" dialog is
 *     open the banner is fully unmounted (renders only when
 *     gpuUnsafe && !isCompatDialogOpen && !bannerDismissed) and floating
 *     support widgets are hidden via a document flag. Closing the dialog
 *     restores the banner without replaying its entrance animation.
 */
export function GpuCompatBanner() {
  const gpuUnsafe = useGpuUnsafe();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [isCompatDialogOpen, setIsCompatDialogOpen] = useState(false);
  const [entered, setEntered] = useState(false);

  // Remembers whether the entrance animation already played, so returning from
  // the dialog does not replay it.
  const hasAnimatedIn = useRef(false);

  // Swipe-to-dismiss tracking
  const dragStartY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  // Read persisted dismissal once.
  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") setBannerDismissed(true);
    } catch {
      /* storage disabled — still show this session */
    }
  }, []);

  const shouldRenderBanner = gpuUnsafe && !isCompatDialogOpen && !bannerDismissed;

  // Play the entrance animation only the first time the banner appears.
  useEffect(() => {
    if (!shouldRenderBanner) return;
    if (hasAnimatedIn.current) {
      setEntered(true);
      return;
    }
    setEntered(false);
    const id = requestAnimationFrame(() => {
      setEntered(true);
      hasAnimatedIn.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, [shouldRenderBanner]);

  // Hide floating support/chat widgets while the dialog is open.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const d = document.documentElement;
    if (isCompatDialogOpen) d.setAttribute("data-compat-dialog-open", "true");
    else d.removeAttribute("data-compat-dialog-open");
    return () => d.removeAttribute("data-compat-dialog-open");
  }, [isCompatDialogOpen]);

  function dismiss() {
    setBannerDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    dragStartY.current = e.clientY;
  }
  function onPointerMove(e: React.PointerEvent) {
    if (dragStartY.current === null) return;
    const delta = e.clientY - dragStartY.current;
    if (delta > 0) setDragY(delta);
  }
  function onPointerUp() {
    if (dragStartY.current === null) return;
    if (dragY > 40) {
      dismiss();
    } else {
      setDragY(0);
    }
    dragStartY.current = null;
  }

  const translateY = entered ? dragY : 8;

  return (
    <>
      {shouldRenderBanner && (
        <div
          role="status"
          aria-live="polite"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="gpu-compat-banner"
          style={{
            opacity: entered ? 1 : 0,
            transform: `translateY(${translateY}px)`,
            transition:
              dragStartY.current !== null
                ? "none"
                : "opacity 180ms ease-out, transform 180ms ease-out",
          }}
        >
          <span className="gpu-compat-banner__icon" aria-hidden="true">
            <AlertTriangle className="h-4 w-4" />
          </span>

          <div className="gpu-compat-banner__text">
            <p className="gpu-compat-banner__title">Graphics Compatibility Mode</p>
            <p className="gpu-compat-banner__desc">
              Some graphics effects have been reduced for better stability.
            </p>
          </div>

          <div className="gpu-compat-banner__actions">
            <button
              type="button"
              onClick={() => setIsCompatDialogOpen(true)}
              className="gpu-compat-banner__learn"
            >
              Learn More
            </button>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss"
              className="gpu-compat-banner__close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <Dialog open={isCompatDialogOpen} onOpenChange={setIsCompatDialogOpen}>
        <DialogContent className="gpu-compat-dialog max-w-md">
          <DialogHeader>
            <DialogTitle>About Compatibility Mode</DialogTitle>
            <DialogDescription>Why you&apos;re seeing this notice</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              This is a graphics rendering issue in your current browser&apos;s
              GPU engine on this device — not a problem with the website itself.
            </p>
            <p>
              Firefox is unaffected, and newer Chromium-based browser versions
              have already fixed similar rendering issues.
            </p>
            <p>
              Compatibility Mode reduces the graphics workload to improve
              stability, but it cannot fully correct a browser rendering bug.
              Updating your browser is the most reliable fix.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setIsCompatDialogOpen(false)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
