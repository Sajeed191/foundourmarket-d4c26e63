import { useState } from "react";
import { Sparkles, ChevronRight, ShieldCheck, RotateCcw, Info } from "lucide-react";
import type { ImageIntelligence, ImageRecommendation, TrafficLight } from "@/lib/image-intelligence-types";
import { cn } from "@/lib/utils";

/**
 * Marketplace AI Assistant — one prioritized recommendation per image.
 *
 * Design rules (from mem://design/ai-ux-principles):
 * - ONE message, plain language, traffic-light status.
 * - Advanced signals hidden behind "View details".
 * - Always shows the safety contract (immutable original, reversible action).
 */

const BAND_META: Record<TrafficLight, { emoji: string; text: string; ring: string; bg: string }> = {
  green: { emoji: "🟢", text: "text-emerald-300", ring: "ring-emerald-500/40", bg: "bg-emerald-500/10" },
  blue:  { emoji: "🔵", text: "text-sky-300",     ring: "ring-sky-500/40",     bg: "bg-sky-500/10" },
  amber: { emoji: "🟡", text: "text-amber-300",   ring: "ring-amber-500/40",   bg: "bg-amber-500/10" },
  red:   { emoji: "🔴", text: "text-rose-300",    ring: "ring-rose-500/40",    bg: "bg-rose-500/10" },
};

export function MarketplaceImageAssistant({
  intelligence,
  recommendation,
  className,
}: {
  intelligence: ImageIntelligence | null;
  recommendation: ImageRecommendation | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!intelligence || !recommendation) return null;
  const meta = BAND_META[recommendation.band];

  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-3 backdrop-blur-md",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg ring-1", meta.bg, meta.ring, meta.text)}>
          <Sparkles className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground">
            Marketplace AI · <span className={meta.text}>score {intelligence.qualityScore}</span>
          </p>
          <p className="mt-0.5 text-[13px] leading-snug text-white/95">
            <span className="mr-1.5">{meta.emoji}</span>{recommendation.headline}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground transition hover:text-foreground"
        >
          Details
          <ChevronRight className={cn("size-3 transition-transform", open && "rotate-90")} />
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-2.5 border-t border-white/5 pt-2.5 text-[11px]">
          {recommendation.reasons.length > 0 && (
            <ul className="space-y-1">
              {recommendation.reasons.map((r) => (
                <li key={r} className="flex items-start gap-1.5 text-white/80">
                  <Info className="mt-0.5 size-3 shrink-0 text-sky-400" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="grid grid-cols-2 gap-1.5 text-[10px] text-white/70">
            <MetricRow label="Dimensions" value={`${intelligence.width}×${intelligence.height}`} />
            <MetricRow label="Format" value={intelligence.format.toUpperCase()} />
            <MetricRow label="Weight" value={intelligence.fileWeightKb != null ? `${intelligence.fileWeightKb} KB` : "—"} />
            <MetricRow label="Aspect" value={intelligence.orientation} />
            <MetricRow label="Background" value={intelligence.background} />
            <MetricRow label="Category rule" value={intelligence.category} />
            <MetricRow
              label="Target frame"
              value={`${Math.round(intelligence.targetOccupancyMin * 100)}–${Math.round(intelligence.targetOccupancyMax * 100)}%`}
            />
            <MetricRow label="Analysis" value={intelligence.depth} />
          </div>

          <div className="flex flex-wrap gap-1.5 border-t border-white/5 pt-2 text-[10px] text-white/60">
            <SafetyChip icon={ShieldCheck} label="Original preserved" />
            <SafetyChip icon={RotateCcw} label="Reversible" />
            <SafetyChip icon={ShieldCheck} label="Product untouched" />
          </div>
        </div>
      )}
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-white/[0.02] px-2 py-1">
      <span className="text-white/50">{label}</span>
      <span className="font-mono tabular-nums text-white/85">{value}</span>
    </div>
  );
}

function SafetyChip({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5">
      <Icon className="size-3 text-emerald-400" />
      {label}
    </span>
  );
}
