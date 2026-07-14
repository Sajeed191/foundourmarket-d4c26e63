/**
 * ProductGuardBanner — the always-on AI Product Guard.
 *
 * A sticky, cross-tab warning card that sits at the very top of the Product
 * Editor. It reuses the existing Duplicate Detection + Relationship engines
 * (no new scoring here) and surfaces the single most important match in real
 * time while the admin types. It never blocks — it warns, explains WHY, and
 * offers relationship-aware smart actions. The banner stays visible until the
 * admin dismisses it or the confidence drops below the threshold.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { resolveImage } from "@/lib/products";
import {
  AlertTriangle,
  Loader2,
  ShieldCheck,
  Columns2,
  ImageIcon,
  ExternalLink,
  GitMerge,
  EyeOff,
  Layers,
  Link2,
  Boxes,
  ArrowRight,
  X,
  Check,
} from "lucide-react";
import {
  logDuplicateEvent,
  invalidateDetectionIndex,
  type DraftProduct,
  type DupMatch,
  type DupResult,
} from "@/lib/duplicate-detection";
import {
  classifyRelationship,
  RELATIONSHIP_LABEL,
  isDuplicateRisk,
} from "@/lib/catalog-intelligence";
import type { RelationshipKind } from "@/lib/catalog-intelligence";
import { DuplicateCompareDialog } from "./DuplicateCompareDialog";
import { ImageCompareDialog } from "./ImageCompareDialog";

/** Confidence at/above which the guard raises a sticky warning. */
export const GUARD_THRESHOLD = 70;

function toneFor(kind: RelationshipKind, score: number) {
  if (isDuplicateRisk(kind) || score >= 90) {
    return {
      wrap: "border-red-500/40 bg-red-500/10",
      accent: "text-red-400",
      chip: "bg-red-500/15 text-red-300 border-red-500/30",
    };
  }
  if (kind.startsWith("variant")) {
    return {
      wrap: "border-emerald-500/40 bg-emerald-500/10",
      accent: "text-emerald-400",
      chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    };
  }
  return {
    wrap: "border-amber-500/40 bg-amber-500/10",
    accent: "text-amber-400",
    chip: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  };
}

export function ProductGuardBanner({
  draft,
  result,
  draftPhash,
  onCreateVariant,
  onIgnored,
  onLinkRelated,
}: {
  draft: DraftProduct;
  result: DupResult;
  draftPhash: string | null;
  onCreateVariant?: (match: DupMatch) => void;
  onIgnored?: () => void;
  onLinkRelated?: (match: DupMatch, relation: "related" | "accessory" | "successor" | "bundle") => void;
}) {
  const navigate = useNavigate();
  const [compare, setCompare] = useState<DupMatch | null>(null);
  const [imageCompare, setImageCompare] = useState<DupMatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  const top = useMemo(() => result.matches.find((m) => !m.ignored) ?? null, [result.matches]);
  const rel = useMemo(() => (top ? classifyRelationship(draft, top) : null), [draft, top]);

  // The identity of the current warning: which product + which relationship.
  const warningKey = top && rel ? `${top.product.slug}:${rel.kind}` : null;

  // Auto-clear the dismissal when the warning identity changes so a new/raised
  // risk re-surfaces without the admin re-opening anything.
  const prevKey = useRef<string | null>(null);
  useEffect(() => {
    if (warningKey !== prevKey.current) {
      prevKey.current = warningKey;
      if (warningKey !== dismissedKey) setDismissedKey(null);
    }
  }, [warningKey, dismissedKey]);

  if (!top || !rel) return null;
  if (top.score < GUARD_THRESHOLD) return null;
  if (dismissedKey === warningKey) return null;

  const p = top.product;
  const tone = toneFor(rel.kind, top.score);
  const price = p.priceInr != null ? `₹${p.priceInr}` : p.priceUsd != null ? `$${p.priceUsd}` : "—";
  const added = p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "—";
  const reasons = top.signals.filter((s) => s.matched).slice(0, 6);

  function openProduct(m: DupMatch) {
    navigate({ to: "/admin-product/$slug", params: { slug: m.product.slug } });
  }

  async function logAnd(action: "ignored" | "merged", m: DupMatch, after?: () => void) {
    setBusy(true);
    const { error } = await logDuplicateEvent({ draft, match: m, action });
    setBusy(false);
    if (error) {
      toast.error("Couldn't record action", { description: error.message });
      return;
    }
    if (action === "merged") invalidateDetectionIndex();
    after?.();
  }

  function ignore(m: DupMatch) {
    logAnd("ignored", m, () => {
      m.ignored = true;
      setDismissedKey(warningKey);
      toast.success("Ignored", { description: "We won't warn about this pair again." });
      onIgnored?.();
    });
  }

  function merge(m: DupMatch) {
    logAnd("merged", m, () => {
      toast.success("Merge recorded", { description: "Opening the existing product to finish the merge." });
      openProduct(m);
    });
  }

  // Relationship-aware smart actions — only what makes sense for this match.
  const actions: React.ReactNode[] = [];
  const push = (node: React.ReactNode) => actions.push(node);

  push(<GuardBtn key="compare" icon={Columns2} label="Compare" onClick={() => setCompare(top)} />);
  if (p.image || draft.image) {
    push(<GuardBtn key="images" icon={ImageIcon} label="Images" onClick={() => setImageCompare(top)} />);
  }

  if (isDuplicateRisk(rel.kind) || top.score >= 90) {
    push(<GuardBtn key="open" icon={ExternalLink} label="Open Existing" onClick={() => openProduct(top)} />);
    push(<GuardBtn key="merge" icon={GitMerge} label="Merge" accent onClick={() => merge(top)} disabled={busy} />);
  } else if (rel.kind.startsWith("variant")) {
    push(<GuardBtn key="variant" icon={Layers} label="Create Variant" accent onClick={() => onCreateVariant?.(top)} />);
    push(<GuardBtn key="merge" icon={GitMerge} label="Merge Into Existing" onClick={() => merge(top)} disabled={busy} />);
    push(<GuardBtn key="open" icon={ExternalLink} label="Open Existing" onClick={() => openProduct(top)} />);
  } else if (rel.kind === "accessory") {
    push(<GuardBtn key="link" icon={Link2} label="Link Accessory" accent onClick={() => onLinkRelated?.(top, "accessory")} />);
    push(<GuardBtn key="open" icon={ExternalLink} label="Open Existing" onClick={() => openProduct(top)} />);
  } else if (rel.kind === "bundle") {
    push(<GuardBtn key="bundle" icon={Boxes} label="Create Bundle" accent onClick={() => onLinkRelated?.(top, "bundle")} />);
    push(<GuardBtn key="open" icon={ExternalLink} label="Open Existing" onClick={() => openProduct(top)} />);
  } else if (rel.kind === "successor" || rel.kind === "replacement") {
    push(<GuardBtn key="successor" icon={ArrowRight} label="Link Successor" accent onClick={() => onLinkRelated?.(top, "successor")} />);
    push(<GuardBtn key="open" icon={ExternalLink} label="Open Existing" onClick={() => openProduct(top)} />);
  } else {
    push(<GuardBtn key="link" icon={Link2} label="Link Related" onClick={() => onLinkRelated?.(top, "related")} />);
    push(<GuardBtn key="open" icon={ExternalLink} label="Open Existing" onClick={() => openProduct(top)} />);
  }

  push(<GuardBtn key="ignore" icon={EyeOff} label="Ignore" onClick={() => ignore(top)} disabled={busy} />);

  return (
    <div className={cn("sticky top-[76px] z-30 rounded-2xl border p-3 backdrop-blur-xl", tone.wrap)}>
      <div className="flex items-start gap-3">
        {/* Preview image */}
        <div className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-background">
          {p.image ? (
            <img src={resolveImage(p.image)} alt={p.name} loading="lazy" className="size-full object-cover" />
          ) : (
            <div className="grid size-full place-items-center text-muted-foreground"><ImageIcon className="size-5" /></div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isDuplicateRisk(rel.kind) || top.score >= 90 ? (
              <AlertTriangle className={cn("size-4 shrink-0", tone.accent)} />
            ) : (
              <ShieldCheck className={cn("size-4 shrink-0", tone.accent)} />
            )}
            <p className={cn("text-sm font-semibold", tone.accent)}>
              {isDuplicateRisk(rel.kind)
                ? "Possible Duplicate Detected"
                : rel.kind.startsWith("variant")
                  ? "Looks like a Variant"
                  : "Similar Product Found"}
            </p>
            <span className={cn("ml-auto shrink-0 rounded-full border px-2 py-0.5 font-mono text-xs font-bold tabular-nums", tone.chip)}>
              {top.score}%
            </span>
            {result.loading && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />}
            <button
              type="button"
              aria-label="Dismiss warning"
              onClick={() => setDismissedKey(warningKey)}
              className="grid size-6 shrink-0 place-items-center rounded-full hover:bg-white/10"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <p className="mt-0.5 truncate text-xs text-foreground/90">
            <span className="font-medium">{p.name}</span> · {p.brand || "—"} · {p.category || "—"}
          </p>
          <p className="text-[11px] text-muted-foreground">{rel.message}</p>

          {/* Preview meta */}
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
            <span>SKU {p.sku || "—"}</span>
            <span>Barcode {p.barcode || "—"}</span>
            <span>{price}</span>
            <span>Stock {p.stockQuantity}</span>
            <span>Variants {p.variantCount}</span>
            <span className="capitalize">{p.status}</span>
            <span>Added {added}</span>
          </div>

          {/* Explainability — matched reasons with per-signal similarity */}
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5">
            {reasons.map((s) => (
              <li key={s.key} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Check className="size-3 shrink-0 text-emerald-400" />
                {s.reason}
                <span className="font-mono text-[9px] opacity-70">{Math.round(s.similarity * 100)}%</span>
              </li>
            ))}
          </ul>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={cn("rounded-md border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider", tone.chip)}>
              {RELATIONSHIP_LABEL[rel.kind]}
            </span>
            {actions}
          </div>
        </div>
      </div>

      <DuplicateCompareDialog
        open={!!compare}
        onOpenChange={(v) => !v && setCompare(null)}
        draft={draft}
        match={compare}
      />
      <ImageCompareDialog
        open={!!imageCompare}
        onOpenChange={(v) => !v && setImageCompare(null)}
        draftImage={draft.image ?? null}
        draftPhash={draftPhash}
        match={imageCompare}
      />
    </div>
  );
}

function GuardBtn({
  icon: Icon,
  label,
  onClick,
  accent,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  accent?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-medium transition-colors disabled:opacity-50",
        accent
          ? "border-accent/50 bg-accent/15 text-accent hover:bg-accent/25"
          : "border-white/15 bg-background/40 text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-3" /> {label}
    </button>
  );
}
