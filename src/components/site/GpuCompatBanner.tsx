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
import { toast } from "sonner";
import { AlertTriangle, ChevronRight, Chrome, Flame, LifeBuoy, X } from "lucide-react";

/** External help destinations (stable, vendor-neutral pages). */
const BROWSER_UPDATE_URL = "https://browsehappy.com/";
const FIREFOX_URL = "https://www.mozilla.org/firefox/new/";

const DISMISS_KEY = "fom-compat-banner-dismissed";
const DISMISS_TS_KEY = "fom-compat-banner-dismissed-at";
const DISMISS_DAYS = 30;



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
    gpuUnsafe && !bannerDismissed && !compatDialogOpen && !advancedOpen && !leaving;

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

  // Hide floating support/chat widgets while either dialog is open.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const d = document.documentElement;
    if (compatDialogOpen || advancedOpen) d.setAttribute("data-compat-dialog-open", "true");
    else d.removeAttribute("data-compat-dialog-open");
    return () => d.removeAttribute("data-compat-dialog-open");
  }, [compatDialogOpen, advancedOpen]);

  // Refresh diagnostics whenever the advanced dialog opens.
  useEffect(() => {
    if (advancedOpen) {
      setDiagnostics(collectCompatDiagnostics());
    }
  }, [advancedOpen]);

  function openAdvanced() {
    setCompatDialogOpen(false);
    setAdvancedOpen(true);
  }

  async function copyDiagnostics() {
    const text = formatDiagnostics(diagnostics ?? collectCompatDiagnostics());
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // Clipboard API unavailable/blocked — fall back to a hidden textarea.
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        ok = true;
      } catch {
        /* give up silently */
      }
    }
    if (ok) toast.success("Diagnostics copied successfully.");
    else toast.error("Couldn't copy diagnostics.");
  }

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
            <DialogTitle id="compat-dialog-title">Graphics Compatibility</DialogTitle>
            <DialogDescription id="compat-dialog-desc">
              We&apos;ve detected a graphics rendering issue in your browser and
              automatically enabled Compatibility Mode to improve stability. Your
              shopping experience, account, and payments are not affected. If you
              still notice visual issues, you can try one of the options below.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5">
            {/* Card 1 — Update Browser */}
            <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 p-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                <Chrome className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">Update Browser</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  Browser updates often include graphics rendering fixes.
                </p>
                <Button
                  variant="link"
                  className="mt-1 h-auto p-0 text-xs"
                  onClick={() => window.open(BROWSER_UPDATE_URL, "_blank", "noopener")}
                >
                  Learn More
                </Button>
              </div>
            </div>

            {/* Card 2 — Try Firefox */}
            <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 p-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                <Flame className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">Try Firefox</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  Firefox uses a different graphics rendering engine and may
                  display the site correctly.
                </p>
                <Button
                  variant="link"
                  className="mt-1 h-auto p-0 text-xs"
                  onClick={() => window.open(FIREFOX_URL, "_blank", "noopener")}
                >
                  Open Firefox Website
                </Button>
              </div>
            </div>

            {/* Card 3 — Advanced Help */}
            <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 p-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                <LifeBuoy className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">Advanced Help</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  For users who continue experiencing rendering issues.
                </p>
                <Button
                  variant="link"
                  className="mt-1 h-auto p-0 text-xs"
                  onClick={openAdvanced}
                >
                  Show Advanced Information
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter className="sm:justify-end">
            <Button onClick={() => setCompatDialogOpen(false)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Advanced Help — all technical detail lives here. Web pages CANNOT
          disable GPU rasterization / hardware acceleration (no Web API, CSS,
          WebGL, WebGPU, or Permissions API exposes that; it is a browser-level
          setting), so we never fake it — we only explain honestly. */}
      <Dialog open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <DialogContent
          className="gpu-compat-dialog max-w-lg"
          aria-labelledby="compat-advanced-title"
          aria-describedby="compat-advanced-desc"
        >
          <DialogHeader>
            <DialogTitle id="compat-advanced-title">Advanced Information</DialogTitle>
            <DialogDescription id="compat-advanced-desc">
              Technical details about this graphics issue and Compatibility Mode.
            </DialogDescription>
          </DialogHeader>

          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="why">
              <AccordionTrigger>Why this happens</AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                Some browser and graphics-driver combinations contain a bug in how
                the browser draws (rasterizes) the page on the GPU. This can cause
                visual artifacts such as flickering, striping, or corrupted images
                on certain devices, even though the website itself is working
                correctly.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="cannot-disable">
              <AccordionTrigger>
                Why websites cannot disable GPU Rasterization
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                GPU Rasterization and Hardware Acceleration are browser-level
                settings. For security and privacy reasons, browsers do not expose
                any web API, CSS, or JavaScript capability that lets a website turn
                them off. They can only be changed manually inside the browser&apos;s
                own settings, and this page will never attempt to change them for
                you.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="why-compat">
              <AccordionTrigger>Why Compatibility Mode exists</AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                When we detect a high likelihood that your device is affected, we
                automatically reduce the graphics workload (fewer blur, glow, and
                layering effects) to sidestep the rendering bug and keep the site
                stable. Your data, orders, and payments are never affected.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="limitations">
              <AccordionTrigger>Browser graphics limitations</AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                A website can only work around these issues — it cannot fix the
                underlying browser bug. The permanent fix comes from the browser
                vendor: newer Chromium versions often include graphics fixes, and
                Firefox uses a different rendering pipeline that may avoid the issue
                entirely.
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={copyDiagnostics}>
              Copy Diagnostics
            </Button>
            <Button onClick={() => setAdvancedOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
