import { useEffect, useState } from "react";
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
import { X } from "lucide-react";

const DISMISS_KEY = "fom-compat-banner-dismissed";

/**
 * Compatibility Mode notice — shown ONCE on gpu-unsafe devices only.
 *
 * The WebGL boot gate (src/routes/__root.tsx) flags a very small number of
 * devices with a known Chromium GPU-rasterization issue and enables
 * Compatibility Mode (GPU-pressure reductions in src/styles.css). This banner
 * tells the user why, offers to continue, and links a "Learn More" dialog with
 * the full explanation. Dismissal is remembered in localStorage.
 */
export function GpuCompatBanner() {
  const gpuUnsafe = useGpuUnsafe();
  const [visible, setVisible] = useState(false);
  const [learnMore, setLearnMore] = useState(false);

  useEffect(() => {
    if (!gpuUnsafe) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* storage disabled — still show this session */
    }
    setVisible(true);
  }, [gpuUnsafe]);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  if (!gpuUnsafe || !visible) return null;

  return (
    <>
      <div
        role="status"
        className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-md rounded-2xl border border-border/60 bg-card/95 p-4 shadow-lg backdrop-blur-none sm:inset-x-auto sm:right-4 sm:bottom-4"
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="pr-6 text-sm leading-relaxed text-foreground">
          Your browser has a known graphics compatibility issue on this device.
          We&apos;ve enabled Compatibility Mode to improve stability. Updating to
          a newer Chromium-based browser may completely resolve the issue.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" onClick={dismiss}>
            Continue
          </Button>
          <Button size="sm" variant="outline" onClick={() => setLearnMore(true)}>
            Learn More
          </Button>
        </div>
      </div>

      <Dialog open={learnMore} onOpenChange={setLearnMore}>
        <DialogContent className="max-w-md">
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
            <Button
              onClick={() => {
                setLearnMore(false);
                dismiss();
              }}
            >
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
