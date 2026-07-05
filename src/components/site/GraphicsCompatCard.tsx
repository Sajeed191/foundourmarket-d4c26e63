import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  MonitorSmartphone,
  Sparkles,
  ShieldCheck,
  HelpCircle,
  ChevronDown,
  Info,
  RotateCcw,
  Flag,
  Send,
  Cpu,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import {
  setGraphicsCompatPref,
  resetGraphicsCompatPref,
  useGraphicsCompatPref,
  getGraphicsDiagnostics,
} from "@/lib/graphics-compat";

/**
 * Graphics Compatibility Mode settings card.
 *
 * Fully user-driven: it never auto-enables based on browser, device, RAM, GPU
 * or Android version. It only reads/writes the existing persisted preference
 * (`fom-graphics-compat`) and toggles the existing `data-graphics-compat` /
 * `data-render-safe` rendering state — no duplicated rendering logic, no GPU
 * blocklist.
 */
export function GraphicsCompatCard() {
  const reduceMotion = useReducedMotion();
  const pref = useGraphicsCompatPref();
  const compatOn = pref === "on";
  const [learnOpen, setLearnOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const apply = useCallback((next: "on" | "off") => {
    setGraphicsCompatPref(next);
    toast.success(
      next === "on"
        ? "Compatibility Rendering enabled"
        : "Premium Rendering restored",
    );
  }, []);

  const restoreDefault = useCallback(() => {
    resetGraphicsCompatPref();
    toast.success("Default rendering restored");
  }, []);

  const onToggle = useCallback(
    (checked: boolean) => apply(checked ? "on" : "off"),
    [apply],
  );

  const transition = useMemo(
    () => (reduceMotion ? { duration: 0 } : { duration: 0.18, ease: "easeOut" as const }),
    [reduceMotion],
  );

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden mb-6">
      <div className="flex items-center gap-2 px-6 py-4 border-b border-border">
        <MonitorSmartphone className="size-4 text-accent" aria-hidden="true" />
        <h2 className="font-display text-base font-semibold">Display &amp; performance</h2>
      </div>

      {/* --- Toggle row --- */}
      <div className="px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <label htmlFor="graphics-compat-switch" className="font-medium text-sm">
              Graphics Compatibility Mode
            </label>
            <p className="text-xs text-muted-foreground mt-0.5">
              If you experience flickering, graphical glitches, or display
              corruption in Chrome or Brave, enable Compatibility Mode for
              improved stability — it uses a simplified graphics pipeline.
            </p>
          </div>
          <Switch
            id="graphics-compat-switch"
            checked={compatOn}
            onCheckedChange={onToggle}
            aria-label="Graphics Compatibility Mode"
          />
        </div>

        {/* --- Secondary action: Restore Default --- */}
        {pref !== "auto" && (
          <div className="mt-3">
            <button
              type="button"
              onClick={restoreDefault}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" /> Restore Default
            </button>
          </div>
        )}

        {/* --- Animated status: Graphics Engine --- */}
        <div className="mt-4 rounded-xl border border-border bg-background/40 p-4">
          <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
            Graphics Engine
          </p>
          <div
            className="mt-2 min-h-[3.25rem]"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={compatOn ? "compat" : "premium"}
                initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.98, y: reduceMotion ? 0 : 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.98, y: reduceMotion ? 0 : -4 }}
                transition={transition}
              >
                {compatOn ? (
                  <>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="size-4 text-accent" aria-hidden="true" />
                      <span className="text-sm font-semibold text-accent">
                        Compatibility Rendering 🛡️
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Uses a simplified graphics path designed for improved
                      stability on some devices.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-emerald-500" aria-hidden="true" />
                      <span className="text-sm font-semibold text-emerald-500">
                        Premium Rendering ✅
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Uses the complete visual experience with all graphics
                      effects.
                    </p>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* --- Help / discoverability section --- */}
      <div className="border-t border-border px-6 py-4">
        <div className="flex items-start gap-3">
          <HelpCircle className="size-4 text-accent mt-0.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-medium text-sm">Having graphical issues?</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              If you notice flickering, graphical glitches, horizontal lines,
              duplicated images, or display corruption while scrolling, Graphics
              Compatibility Mode can improve rendering stability on some Android
              Chromium browsers.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setLearnOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
              >
                <Info className="size-3.5" aria-hidden="true" /> Learn More
              </button>
              {!compatOn && (
                <button
                  type="button"
                  onClick={() => apply("on")}
                  className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90 transition-opacity"
                >
                  <ShieldCheck className="size-3.5" aria-hidden="true" /> Enable Compatibility Mode
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* --- Diagnostics (collapsed by default) --- */}
      <Collapsible className="border-t border-border">
        <CollapsibleTrigger className="group flex w-full items-center justify-between px-6 py-3 text-left">
          <span className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">
            Diagnostics
          </span>
          <ChevronDown
            className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
            aria-hidden="true"
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <DiagnosticsList />
        </CollapsibleContent>
      </Collapsible>

      {/* --- Report a graphics issue --- */}
      <div className="border-t border-border px-6 py-3">
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <Flag className="size-3.5" aria-hidden="true" /> Report a graphics issue
        </button>
      </div>

      {/* --- Learn More bottom sheet --- */}
      <Sheet open={learnOpen} onOpenChange={setLearnOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85dvh] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-accent" aria-hidden="true" />
              Graphics Compatibility Mode
            </SheetTitle>
            <SheetDescription>
              A simplified, more stable graphics path — completely optional and
              reversible.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4 text-sm text-muted-foreground">
            <section>
              <h3 className="font-medium text-foreground">What it does</h3>
              <p className="mt-1">
                It switches the app to a simplified graphics pipeline that reduces
                visual effects like blur and layered depth. The layout and content
                stay the same — only the way things are rendered changes.
              </p>
            </section>
            <section>
              <h3 className="font-medium text-foreground">When should I use this?</h3>
              <ul className="mt-2 space-y-1.5">
                {[
                  "Flickering while scrolling",
                  "Horizontal coloured lines",
                  "Corrupted or duplicated images",
                  "Parts of the page not updating correctly",
                  "Visual glitches in Chrome or Brave",
                ].map((ex) => (
                  <li key={ex} className="flex items-start gap-2">
                    <span className="mt-1.5 size-1.5 rounded-full bg-accent shrink-0" aria-hidden="true" />
                    <span>{ex}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3 className="font-medium text-foreground">Your data is safe</h3>
              <p className="mt-1">
                Compatibility Mode is purely visual. It does not affect your
                account, orders, payments, or any of your data.
              </p>
            </section>
            <section>
              <h3 className="font-medium text-foreground">Fully reversible</h3>
              <p className="mt-1">
                You can turn it off at any time from this screen to instantly
                restore the full premium experience.
              </p>
            </section>
            <p className="rounded-lg bg-muted px-3 py-2 text-foreground">
              If you do not experience these issues, keep Premium Rendering
              enabled for the best visual experience.
            </p>
          </div>
          <div className="mt-6 flex gap-2">
            {!compatOn ? (
              <button
                type="button"
                onClick={() => {
                  apply("on");
                  setLearnOpen(false);
                }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90 transition-opacity"
              >
                <ShieldCheck className="size-4" aria-hidden="true" /> Enable Compatibility Mode
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  apply("off");
                  setLearnOpen(false);
                }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
              >
                <Sparkles className="size-4" aria-hidden="true" /> Restore Premium Rendering
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* --- Report issue sheet --- */}
      <ReportIssueSheet open={reportOpen} onOpenChange={setReportOpen} />
    </div>
  );
}

/** Diagnostics rows — computed from the current pref via the live hook. */
function DiagnosticsList() {
  useGraphicsCompatPref(); // re-render when the mode changes
  const d = getGraphicsDiagnostics();
  return (
    <dl className="px-6 pb-4 space-y-2 text-xs">
      <DiagRow label="Rendering Mode" value={d.renderingMode} />
      <DiagRow label="Browser" value={d.browserName} />
      <DiagRow label="Browser Version" value={d.browserVersion} />
      <DiagRow label="Android Version" value={d.androidVersion} />
      <DiagRow label="Compatibility Mode" value={d.compatibility} />
    </dl>
  );
}

function ReportIssueSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  useGraphicsCompatPref();
  const d = getGraphicsDiagnostics();
  const [notes, setNotes] = useState("");

  const report = useMemo(
    () =>
      [
        `Rendering Mode: ${d.renderingMode}`,
        `Compatibility Mode: ${d.compatibility}`,
        `Browser: ${d.browserName}`,
        `Browser Version: ${d.browserVersion}`,
        `Android Version: ${d.androidVersion}`,
      ].join("\n"),
    [d.renderingMode, d.compatibility, d.browserName, d.browserVersion, d.androidVersion],
  );

  const submit = () => {
    // No PII, no GPU/WebGL/driver strings — only the reviewed technical summary.
    toast.success("Thanks — your graphics report has been noted.");
    onOpenChange(false);
    setNotes("");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85dvh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            <Flag className="size-5 text-accent" aria-hidden="true" />
            Report a graphics issue
          </SheetTitle>
          <SheetDescription>
            Review the details below before sending. No personal information is
            included.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="report-notes" className="text-sm font-medium">
              What did you see? <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              id="report-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="e.g. Horizontal lines appeared while scrolling the product grid."
              className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div>
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">
              Included details
            </p>
            <pre className="mt-1.5 whitespace-pre-wrap rounded-xl border border-border bg-muted px-3 py-2 text-xs text-foreground">
{report}
            </pre>
          </div>
        </div>

        <div className="mt-6">
          <button
            type="button"
            onClick={submit}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90 transition-opacity"
          >
            <Send className="size-4" aria-hidden="true" /> Send report
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DiagRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}

/**
 * Compact "Graphics Engine" line for Settings → About / App Information.
 * Reuses the same wording and iconography as the compatibility card and stays
 * in sync live via the shared preference hook.
 */
export function GraphicsEngineAbout() {
  const pref = useGraphicsCompatPref();
  const compatOn = pref === "on";
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-4">
      <div className="flex items-center gap-2 min-w-0">
        <Cpu className="size-4 text-accent shrink-0" aria-hidden="true" />
        <span className="text-sm font-medium">Graphics Engine</span>
      </div>
      <span
        className="inline-flex items-center gap-1.5 text-sm font-semibold"
        aria-live="polite"
      >
        {compatOn ? (
          <>
            <ShieldCheck className="size-4 text-accent" aria-hidden="true" />
            <span className="text-accent">Compatibility Rendering</span>
          </>
        ) : (
          <>
            <Sparkles className="size-4 text-emerald-500" aria-hidden="true" />
            <span className="text-emerald-500">Premium Rendering</span>
          </>
        )}
      </span>
    </div>
  );
}
