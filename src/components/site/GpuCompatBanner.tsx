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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useGpuUnsafe } from "@/lib/gpu-compat";
import {
  collectCompatDiagnostics,
  formatDiagnostics,
  type CompatDiagnostics,
} from "@/lib/compat-diagnostics";
import { AlertTriangle, Check, Copy, X } from "lucide-react";

const DISMISS_KEY = "fom-compat-banner-dismissed";
const DISMISS_TS_KEY = "fom-compat-banner-dismissed-at";
const DISMISS_DAYS = 30;

/**
 * Optional browser-update URL. Rendered as a secondary modal action ONLY when
 * present. Left null by default (no reliable per-browser update deep-link);
 * set to a support URL if one becomes available.
 */
const UPDATE_BROWSER_URL: string | null = null;

/**
 * Compatibility Mode notice — shown on gpu-unsafe devices only.
 *
 * UI/UX ONLY. Detection (useGpuUnsafe) and Compatibility Mode logic are
 * untouched. Compact notification card: bottom-right toast on desktop, compact
 * bottom sheet above the nav on mobile. Never covers the bottom nav or floating
 * support widgets.
 *
 * State:
 *   - bannerDismissed → localStorage, suppressed for 30 days
 *   - compatDialogOpen → single boolean. Banner renders only when
 *     gpuUnsafe && !bannerDismissed && !compatDialogOpen. While the dialog is
 *     open, floating support widgets are hidden via a document flag. Radix
 *     Dialog provides focus trap, ESC-to-close, and focus restore.
 */
export function GpuCompatBanner() {
  const gpuUnsafe = useGpuUnsafe();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [compatDialogOpen, setCompatDialogOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<CompatDiagnostics | null>(null);
  const [copied, setCopied] = useState(false);
  const [entered, setEntered] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const hasAnimatedIn = useRef(false);
  const dragStartY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  // Read persisted dismissal once — honor the 30-day suppression window.
  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") {
        const at = Number(localStorage.getItem(DISMISS_TS_KEY) || 0);
        if (at && Date.now() - at < DISMISS_DAYS * 86400_000) {
          setBannerDismissed(true);
        } else {
          // Window expired — clear so it can show again.
          localStorage.removeItem(DISMISS_KEY);
          localStorage.removeItem(DISMISS_TS_KEY);
        }
      }
    } catch {
      /* storage disabled — still show this session */
    }
  }, []);

  const shouldRenderBanner =
    gpuUnsafe && !bannerDismissed && !compatDialogOpen && !leaving;

  // Entrance animation plays only the first time the banner appears.
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
    if (compatDialogOpen) d.setAttribute("data-compat-dialog-open", "true");
    else d.removeAttribute("data-compat-dialog-open");
    return () => d.removeAttribute("data-compat-dialog-open");
  }, [compatDialogOpen]);

  function persistDismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
      localStorage.setItem(DISMISS_TS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }

  function dismiss() {
    // Fade-out (150ms) then unmount + persist.
    setLeaving(true);
    setEntered(false);
    window.setTimeout(() => {
      setBannerDismissed(true);
      persistDismiss();
    }, 150);
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
    if (dragY > 40) dismiss();
    else setDragY(0);
    dragStartY.current = null;
  }

  const translateY = entered ? dragY : 8;

  return (
    <>
      {(shouldRenderBanner || leaving) && gpuUnsafe && !bannerDismissed && (
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
                : "opacity 200ms ease-out, transform 200ms ease-out",
          }}
        >
          <span className="gpu-compat-banner__icon" aria-hidden="true">
            <AlertTriangle className="h-4 w-4" />
          </span>

          <div className="gpu-compat-banner__text">
            <p className="gpu-compat-banner__title">
              Graphics Compatibility Mode Enabled
            </p>
            <p className="gpu-compat-banner__desc">
              Some visual effects have been reduced to improve stability on your
              browser.
            </p>
          </div>

          <div className="gpu-compat-banner__actions">
            <button
              type="button"
              onClick={() => setCompatDialogOpen(true)}
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

      <Dialog open={compatDialogOpen} onOpenChange={setCompatDialogOpen}>
        <DialogContent
          className="gpu-compat-dialog max-w-md"
          aria-labelledby="compat-dialog-title"
          aria-describedby="compat-dialog-desc"
        >
          <DialogHeader>
            <DialogTitle id="compat-dialog-title">
              About Compatibility Mode
            </DialogTitle>
            <DialogDescription id="compat-dialog-desc">
              Why you&apos;re seeing this notice
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li>Your browser has a known graphics rendering issue on this device.</li>
            <li>Your data and purchases are completely safe.</li>
            <li>The website is functioning normally.</li>
            <li>Compatibility Mode reduces the graphics workload for stability.</li>
            <li>Firefox and newer Chromium versions already include fixes.</li>
            <li>Updating your browser is the recommended fix.</li>
          </ul>
          <DialogFooter className="gap-2 sm:gap-2">
            {UPDATE_BROWSER_URL && (
              <Button
                variant="outline"
                onClick={() => window.open(UPDATE_BROWSER_URL!, "_blank", "noopener")}
              >
                Update Browser
              </Button>
            )}
            <Button onClick={() => setCompatDialogOpen(false)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
