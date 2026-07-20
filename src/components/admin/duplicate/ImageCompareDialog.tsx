import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { resolveImage } from "@/lib/products";
import { imageSimilarity, type DupMatch } from "@/lib/duplicate-detection";
import { cn } from "@/lib/utils";

export function ImageCompareDialog({
  open,
  onOpenChange,
  draftImage,
  draftPhash,
  match,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  draftImage: string | null;
  draftPhash: string | null;
  match: DupMatch | null;
}) {
  const [overlay, setOverlay] = useState(false);
  if (!match) return null;
  const existing = match.product.image ? resolveImage(match.product.image) : null;
  const current = draftImage ? resolveImage(draftImage) : null;
  const sim = imageSimilarity(draftPhash, match.product.imagePhash);
  const simPct = sim != null ? Math.round(sim * 100) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            Image comparison
            {simPct != null && (
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 font-mono text-sm",
                  simPct >= 90
                    ? "bg-red-500/15 text-red-400"
                    : simPct >= 70
                      ? "bg-amber-500/15 text-amber-400"
                      : "bg-emerald-500/15 text-emerald-400",
                )}
              >
                {simPct}% similar
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {overlay ? (
          <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-xl border border-border bg-background">
            {current && <img loading="lazy" decoding="async" src={current} alt="current" className="absolute inset-0 size-full object-contain" />}
            {existing && (
              <img loading="lazy" decoding="async"
                src={existing}
                alt="existing"
                className="absolute inset-0 size-full object-contain mix-blend-difference"
              />
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <ImgCol label="Current product" src={current} />
            <ImgCol label="Existing product" src={existing} />
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {simPct == null
              ? "Fingerprint unavailable for one image — upload a photo to compare."
              : "Difference overlay highlights edited, cropped or recoloured regions."}
          </p>
          <button
            onClick={() => setOverlay((v) => !v)}
            disabled={!current || !existing}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:text-foreground disabled:opacity-40"
          >
            {overlay ? "Side by side" : "Difference overlay"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ImgCol({ label, src }: { label: string; src: string | null }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="aspect-square overflow-hidden rounded-xl border border-border bg-background">
        {src ? (
          <img loading="lazy" decoding="async" src={src} alt={label} className="size-full object-contain" />
        ) : (
          <div className="grid size-full place-items-center text-xs text-muted-foreground">No image</div>
        )}
      </div>
    </div>
  );
}
