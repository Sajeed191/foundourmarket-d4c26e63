import { useState } from "react";
import { resolveImage } from "@/lib/products";
import { cn } from "@/lib/utils";
import { VERDICT_LABEL, type DupBadge, type DupMatch } from "@/lib/duplicate-detection";
import {
  ExternalLink,
  GitMerge,
  EyeOff,
  Columns2,
  ImageIcon,
  Check,
  Layers,
} from "lucide-react";

const BADGE_STYLES: Record<DupBadge, string> = {
  EXACT: "bg-red-500/15 text-red-400 border-red-500/30",
  SIMILAR: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "IMAGE MATCH": "bg-violet-500/15 text-violet-300 border-violet-500/30",
  "SUBJECT MATCH": "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  "TITLE MATCH": "bg-sky-500/15 text-sky-300 border-sky-500/30",
  "SPEC MATCH": "bg-teal-500/15 text-teal-300 border-teal-500/30",
  "BARCODE MATCH": "bg-rose-500/15 text-rose-300 border-rose-500/30",
  VARIANT: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};

function scoreColor(score: number): string {
  if (score >= 97) return "text-red-400";
  if (score >= 80) return "text-orange-400";
  if (score >= 55) return "text-amber-400";
  if (score >= 30) return "text-sky-400";
  return "text-emerald-400";
}

export function DuplicateMatchCard({
  match,
  onCompare,
  onImageCompare,
  onOpen,
  onMerge,
  onIgnore,
}: {
  match: DupMatch;
  onCompare: (m: DupMatch) => void;
  onImageCompare: (m: DupMatch) => void;
  onOpen: (m: DupMatch) => void;
  onMerge: (m: DupMatch) => void;
  onIgnore: (m: DupMatch) => void;
}) {
  const [zoom, setZoom] = useState(false);
  const p = match.product;
  const price = p.priceInr != null ? `₹${p.priceInr}` : p.priceUsd != null ? `$${p.priceUsd}` : "—";
  const published = p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "—";

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card/60 p-3 backdrop-blur-sm transition-colors",
        match.ignored ? "border-border/40 opacity-60" : "border-border/70 hover:border-accent/40",
      )}
    >
      <div className="flex gap-3">
        <div
          className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-border bg-background"
          onMouseEnter={() => setZoom(true)}
          onMouseLeave={() => setZoom(false)}
        >
          {p.image ? (
            <img
              src={resolveImage(p.image)}
              alt={p.name}
              loading="lazy"
              className={cn("size-full object-cover transition-transform duration-300", zoom && "scale-150")}
            />
          ) : (
            <div className="grid size-full place-items-center text-muted-foreground">
              <ImageIcon className="size-5" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-semibold leading-tight">{p.name}</p>
            <span className={cn("shrink-0 font-mono text-base font-bold tabular-nums", scoreColor(match.score))}>
              {match.score}%
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {p.brand || "—"} · {p.category || "—"}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {match.badges.map((b) => (
              <span
                key={b}
                className={cn(
                  "rounded-md border px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wider",
                  BADGE_STYLES[b],
                )}
              >
                {b}
              </span>
            ))}
          </div>
        </div>
      </div>

      {match.isVariantOfSame && (
        <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-[11px] text-emerald-300">
          <Layers className="size-3.5 shrink-0" />
          Looks like a new variant of this product — consider adding a variant instead.
        </div>
      )}

      <div className="mt-2 grid grid-cols-4 gap-1.5 text-[10px]">
        <Meta label="Price" value={price} />
        <Meta label="Stock" value={String(p.stockQuantity)} />
        <Meta label="Status" value={p.status} />
        <Meta label="Variants" value={String(p.variantCount)} />
        <Meta label="Sold" value={String(p.soldCount)} />
        <Meta label="Orders" value={String(p.ordersCount)} />
        <Meta label="Rating" value={p.rating ? p.rating.toFixed(1) : "—"} />
        <Meta label="Added" value={published} />
      </div>

      {/* Reasons */}
      <ul className="mt-2 space-y-0.5">
        {match.signals
          .filter((s) => s.matched)
          .slice(0, 5)
          .map((s) => (
            <li key={s.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Check className="size-3 shrink-0 text-emerald-400" />
              {s.reason}
              <span className="ml-auto font-mono tabular-nums text-[9px] opacity-70">
                {Math.round(s.similarity * 100)}%
              </span>
            </li>
          ))}
      </ul>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <ActionBtn icon={Columns2} label="Compare" onClick={() => onCompare(match)} />
        <ActionBtn icon={ImageIcon} label="Images" onClick={() => onImageCompare(match)} />
        <ActionBtn icon={ExternalLink} label="Open" onClick={() => onOpen(match)} />
        <ActionBtn icon={GitMerge} label="Merge" onClick={() => onMerge(match)} accent />
        {!match.ignored && <ActionBtn icon={EyeOff} label="Ignore" onClick={() => onIgnore(match)} />}
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/50 bg-background/40 px-1.5 py-1">
      <p className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="truncate text-[10px] font-medium capitalize">{value}</p>
    </div>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-medium transition-colors",
        accent
          ? "border-accent/50 bg-accent/15 text-accent hover:bg-accent/25"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-3" /> {label}
    </button>
  );
}

export { VERDICT_LABEL };
