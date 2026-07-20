import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Gauge, Image as ImageIcon, ShieldCheck, Sparkles, ChevronRight } from "lucide-react";
import {
  scoreCatalogHealth,
  type HealthInput,
  type CatalogHealth,
  type ImageQuality,
} from "@/lib/catalog-intelligence";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function ringColor(score: number) {
  if (score >= 85) return "text-emerald-400";
  if (score >= 70) return "text-sky-400";
  if (score >= 45) return "text-amber-400";
  return "text-red-400";
}

function ScoreCard({
  label,
  score,
  icon,
  onClick,
}: {
  label: string;
  score: number;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 items-center gap-2 rounded-2xl border border-border/60 bg-background/40 p-3 text-left transition hover:border-accent/50"
    >
      <span className={cn("grid size-9 place-items-center rounded-xl bg-accent/10", ringColor(score))}>{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn("font-mono text-lg font-bold tabular-nums leading-none", ringColor(score))}>{score}</p>
      </div>
      <ChevronRight className="ml-auto size-4 text-muted-foreground" />
    </button>
  );
}

function DimensionBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("font-mono font-semibold", ringColor(score))}>{score}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-border/40">
        <div className={cn("h-full rounded-full bg-current transition-all", ringColor(score))} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

/**
 * Marketplace Readiness — clickable Catalog Health, Image Health and Duplicate
 * Risk scores with detailed, explainable breakdowns. Advisory only; publishing
 * is never blocked.
 */
export function CatalogReadinessPanel({
  health: healthInput,
  imageQuality,
  duplicateRisk,
  className,
}: {
  health: HealthInput;
  imageQuality: { images: ImageQuality[]; score: number; loading: boolean };
  duplicateRisk: number;
  className?: string;
}) {
  const [open, setOpen] = useState<null | "health" | "image">(null);
  const health: CatalogHealth = useMemo(
    () => scoreCatalogHealth({ ...healthInput, duplicateRisk, imageQuality: imageQuality.images.length ? imageQuality.score : null }),
    [healthInput, duplicateRisk, imageQuality.images.length, imageQuality.score],
  );

  const readiness = Math.round(health.score * 0.7 + (imageQuality.images.length ? imageQuality.score : 70) * 0.3);

  return (
    <div className={cn("flex flex-col gap-3 rounded-3xl border border-border/70 bg-card/40 p-4 backdrop-blur-xl", className)}>
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-xl bg-accent/15 text-accent">
          <Sparkles className="size-4" />
        </span>
        <div>
          <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-accent">Catalog Intelligence</p>
          <p className="text-sm font-semibold">Marketplace Readiness · {readiness}%</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <ScoreCard label="Catalog Health" score={health.score} icon={<Gauge className="size-4" />} onClick={() => setOpen("health")} />
        <ScoreCard label="Image Health" score={imageQuality.images.length ? imageQuality.score : 0} icon={<ImageIcon className="size-4" />} onClick={() => setOpen("image")} />
        <ScoreCard label="Trust / Dup" score={Math.max(0, 100 - duplicateRisk)} icon={<ShieldCheck className="size-4" />} onClick={() => setOpen("health")} />
      </div>

      {health.suggestions.length > 0 && (
        <ul className="space-y-1">
          {health.suggestions.slice(0, 3).map((s) => (
            <li key={s.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={s.severity === "critical" ? "text-red-400" : s.severity === "warning" ? "text-amber-400" : "text-sky-400"}>•</span>
              {s.label}
            </li>
          ))}
        </ul>
      )}

      {/* Catalog Health detail */}
      <Dialog open={open === "health"} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gauge className="size-4 text-accent" /> Catalog Health · {health.score}% ({health.grade})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {health.dimensions.map((d) => (
              <DimensionBar key={d.key} label={d.label} score={d.score} />
            ))}
            {health.suggestions.length > 0 && (
              <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                <p className="mb-1.5 text-xs font-semibold">Suggestions</p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {health.suggestions.map((s) => (
                    <li key={s.key}>• {s.label} <span className="text-muted-foreground/60">(+{s.impact})</span></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Health detail */}
      <Dialog open={open === "image"} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="size-4 text-accent" /> Image Health · {imageQuality.score}%
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {imageQuality.images.length === 0 && <p className="text-sm text-muted-foreground">No images to analyse yet.</p>}
            {imageQuality.images.map((img, i) => (
              <div key={img.url + i} className="flex gap-3 rounded-xl border border-border/60 bg-background/40 p-2">
                <img loading="lazy" decoding="async" src={img.url} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-semibold", ringColor(img.score))}>Score {img.score} · {img.width}×{img.height}</p>
                  {img.issues.length === 0 ? (
                    <p className="text-xs text-emerald-400">Looks great — no issues detected.</p>
                  ) : (
                    <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                      {img.issues.map((iss) => (
                        <li key={iss.key}>• {iss.label} — {iss.recommendation}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
