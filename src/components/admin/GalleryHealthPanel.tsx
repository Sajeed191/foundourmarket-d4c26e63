import { AlertTriangle, CheckCircle2, Info, Sparkles, ShieldAlert } from "lucide-react";
import type {
  GalleryHealth,
  GalleryDimension,
  HealthBand,
  ImageAnalysis,
} from "@/lib/image-normalization";
import { computeGalleryHealth } from "@/lib/image-normalization";
import { cn } from "@/lib/utils";

/**
 * GalleryHealthPanel — cross-image quality summary for an admin uploader
 * or media manager. Purely presentational; scoring is deterministic and
 * lives in `computeGalleryHealth`.
 */

const BAND_TEXT: Record<HealthBand, string> = {
  excellent: "text-emerald-300",
  good: "text-sky-300",
  "needs-work": "text-amber-300",
  poor: "text-rose-300",
};

const BAND_BAR: Record<HealthBand, string> = {
  excellent: "bg-emerald-400",
  good: "bg-sky-400",
  "needs-work": "bg-amber-400",
  poor: "bg-rose-400",
};

const BAND_LABEL: Record<HealthBand, string> = {
  excellent: "Excellent",
  good: "Good",
  "needs-work": "Needs work",
  poor: "Poor",
};

export function GalleryHealthPanel({
  analyses,
  className,
  minImages = 1,
}: {
  analyses: (ImageAnalysis | null | undefined)[];
  className?: string;
  /** Only render when at least this many analyzed images exist. */
  minImages?: number;
}) {
  const present = analyses.filter((a): a is ImageAnalysis => !!a);
  if (present.length < minImages) return null;

  const health: GalleryHealth = computeGalleryHealth(present);
  const overallBand = health.band;

  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4 backdrop-blur-md",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent">
          <Sparkles className="size-4" />
        </span>
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground">
              Gallery Health
            </p>
            <span className={cn("text-[10px] font-semibold uppercase tracking-wider", BAND_TEXT[overallBand])}>
              {BAND_LABEL[overallBand]}
            </span>
          </div>
          <p className="mt-0.5 flex items-baseline gap-1.5">
            <span className={cn("font-display text-2xl font-semibold tabular-nums", BAND_TEXT[overallBand])}>
              {health.overall}
            </span>
            <span className="text-xs text-muted-foreground">/ 100</span>
            <span className="ml-2 text-[11px] text-muted-foreground">
              across {health.count} image{health.count === 1 ? "" : "s"}
            </span>
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {(Object.values(health.dimensions) as GalleryDimension[]).map((d) => (
          <DimensionRow key={d.key} dim={d} />
        ))}
      </div>

      {health.recommendations.length > 0 && (
        <div className="mt-4 rounded-xl border border-white/5 bg-black/20 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground">
            <Info className="size-3" /> Recommendations
          </p>
          <ul className="space-y-1.5">
            {health.recommendations.map((r) => (
              <li key={r.key} className="flex items-start gap-2 text-[11px] text-white/85">
                {r.severity === "warning" ? (
                  <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-400" />
                ) : (
                  <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-sky-400" />
                )}
                <span>{r.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DimensionRow({ dim }: { dim: GalleryDimension }) {
  const Icon =
    dim.band === "poor" ? ShieldAlert : dim.band === "needs-work" ? AlertTriangle : CheckCircle2;
  return (
    <div className="rounded-lg bg-white/[0.02] px-3 py-2">
      <div className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5 text-white/80">
          <Icon className={cn("size-3", BAND_TEXT[dim.band])} />
          {dim.label}
        </span>
        <span className={cn("font-mono font-semibold tabular-nums", BAND_TEXT[dim.band])}>
          {dim.score}
        </span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/5">
        <div
          className={cn("h-full rounded-full transition-all", BAND_BAR[dim.band])}
          style={{ width: `${dim.score}%` }}
        />
      </div>
    </div>
  );
}
