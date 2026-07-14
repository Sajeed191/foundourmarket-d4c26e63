import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import type { HealthBand, HealthScore, ImageAnalysis } from "@/lib/image-normalization";
import { computeHealthScore } from "@/lib/image-normalization";
import { cn } from "@/lib/utils";

/**
 * Compact chip that renders an image's health score plus a hover-revealed
 * suggestions list. Non-blocking: purely informational for admins.
 */

const BAND_STYLES: Record<HealthBand, { label: string; ring: string; text: string; bg: string; icon: React.ComponentType<{ className?: string }> }> = {
  excellent: { label: "Excellent", ring: "ring-emerald-500/50", text: "text-emerald-300", bg: "bg-emerald-500/10", icon: CheckCircle2 },
  good: { label: "Good", ring: "ring-sky-500/50", text: "text-sky-300", bg: "bg-sky-500/10", icon: CheckCircle2 },
  "needs-work": { label: "Needs work", ring: "ring-amber-500/50", text: "text-amber-300", bg: "bg-amber-500/10", icon: AlertTriangle },
  poor: { label: "Poor", ring: "ring-rose-500/50", text: "text-rose-300", bg: "bg-rose-500/10", icon: ShieldAlert },
};

export function ImageHealthBadge({
  analysis,
  className,
  compact = false,
}: {
  analysis: ImageAnalysis | null | undefined;
  className?: string;
  compact?: boolean;
}) {
  if (!analysis) return null;
  const health: HealthScore = computeHealthScore(analysis);
  const style = BAND_STYLES[health.band];
  const Icon = style.icon;
  const suggestions = health.suggestions;

  return (
    <div className={cn("group relative inline-flex", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 backdrop-blur-md",
          style.bg, style.text, style.ring,
        )}
        title={`Image health ${health.score}/100 — ${style.label}`}
      >
        <Icon className="size-3" />
        <span className="tabular-nums">{health.score}</span>
        {!compact && <span className="opacity-80">{style.label}</span>}
      </span>

      {suggestions.length > 0 && (
        <div className="pointer-events-none absolute left-0 top-full z-30 mt-1 hidden w-64 rounded-xl border border-white/10 bg-black/85 p-2.5 text-[11px] text-white/90 shadow-xl backdrop-blur-xl group-hover:block">
          <p className="mb-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wider text-white/60">
            <Info className="size-3" /> Suggestions
          </p>
          <ul className="space-y-1">
            {suggestions.map((s) => (
              <li key={s.key} className="flex gap-1.5">
                <span
                  className={cn(
                    "mt-1 size-1.5 shrink-0 rounded-full",
                    s.severity === "warning" ? "bg-amber-400" : "bg-sky-400",
                  )}
                />
                <span>{s.label}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-3 border-t border-white/10 pt-2 text-[10px] text-white/60">
            <span>{analysis.width}×{analysis.height}</span>
            <span>· {analysis.occupancy}% product</span>
            <span>· {analysis.backgroundType}</span>
          </div>
        </div>
      )}
    </div>
  );
}
