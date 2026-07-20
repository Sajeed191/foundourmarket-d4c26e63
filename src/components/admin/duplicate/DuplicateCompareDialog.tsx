import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { resolveImage } from "@/lib/products";
import { cn } from "@/lib/utils";
import { normalizeText, type DraftProduct, type DupMatch } from "@/lib/duplicate-detection";

type Diff = "same" | "different" | "missing" | "new";

function diffOf(a: string, b: string): Diff {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na && !nb) return "same";
  if (na && !nb) return "new"; // current has it, existing doesn't
  if (!na && nb) return "missing"; // existing has it, current doesn't
  return na === nb ? "same" : "different";
}

const DIFF_STYLE: Record<Diff, string> = {
  same: "text-muted-foreground",
  different: "text-amber-400",
  missing: "text-sky-400",
  new: "text-emerald-400",
};

const DIFF_LABEL: Record<Diff, string> = {
  same: "Same",
  different: "Different",
  missing: "Missing",
  new: "New",
};

function Row({ label, current, existing }: { label: string; current: string; existing: string }) {
  const d = diffOf(current, existing);
  return (
    <div className="grid grid-cols-[110px_1fr_1fr_64px] items-start gap-2 border-b border-border/40 py-1.5 text-xs">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="break-words">{current || <em className="opacity-40">—</em>}</span>
      <span className="break-words">{existing || <em className="opacity-40">—</em>}</span>
      <span className={cn("text-right text-[10px] font-medium", DIFF_STYLE[d])}>{DIFF_LABEL[d]}</span>
    </div>
  );
}

function specRows(a: Record<string, string> = {}, b: Record<string, string> = {}) {
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();
  return keys.map((k) => <Row key={k} label={k} current={a[k] ?? ""} existing={b[k] ?? ""} />);
}

export function DuplicateCompareDialog({
  open,
  onOpenChange,
  draft,
  match,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  draft: DraftProduct;
  match: DupMatch | null;
}) {
  if (!match) return null;
  const p = match.product;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Side-by-side comparison — {match.score}% match</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <ImgHead label="Current product" src={draft.image ?? null} title={draft.name} />
          <ImgHead label="Existing product" src={p.image} title={p.name} />
        </div>

        <div className="mt-2">
          <div className="grid grid-cols-[110px_1fr_1fr_64px] gap-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <span>Field</span>
            <span>Current</span>
            <span>Existing</span>
            <span className="text-right">Status</span>
          </div>
          <Row label="Title" current={draft.name ?? ""} existing={p.name} />
          <Row label="Brand" current={draft.brand ?? ""} existing={p.brand ?? ""} />
          <Row label="Category" current={draft.category ?? ""} existing={p.category ?? ""} />
          <Row label="SKU" current={draft.sku ?? ""} existing={p.sku ?? ""} />
          <Row label="Barcode" current={draft.barcode ?? ""} existing={p.barcode ?? ""} />
          <Row
            label="Price"
            current={draft.priceInr != null ? `₹${draft.priceInr}` : draft.priceUsd != null ? `$${draft.priceUsd}` : ""}
            existing={p.priceInr != null ? `₹${p.priceInr}` : p.priceUsd != null ? `$${p.priceUsd}` : ""}
          />
          <Row label="Description" current={draft.description ?? ""} existing={p.description ?? ""} />

          <p className="mt-3 mb-1 text-[10px] font-mono uppercase tracking-widest text-accent">Specifications</p>
          {specRows(draft.specifications, p.specifications)}

          <p className="mt-3 mb-1 text-[10px] font-mono uppercase tracking-widest text-accent">Attributes</p>
          {specRows(draft.attributes, p.attributes)}
        </div>

        <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
          <Legend d="same" /> <Legend d="different" /> <Legend d="missing" /> <Legend d="new" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Legend({ d }: { d: Diff }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("size-2 rounded-full", DIFF_STYLE[d].replace("text-", "bg-"))} /> {DIFF_LABEL[d]}
    </span>
  );
}

function ImgHead({ label, src, title }: { label: string; src: string | null; title?: string }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="flex gap-2">
        <div className="size-16 shrink-0 overflow-hidden rounded-lg border border-border bg-background">
          {src ? (
            <img loading="lazy" decoding="async" src={resolveImage(src)} alt={label} className="size-full object-cover" />
          ) : (
            <div className="grid size-full place-items-center text-[10px] text-muted-foreground">No image</div>
          )}
        </div>
        <p className="text-sm font-medium leading-tight">{title || "—"}</p>
      </div>
    </div>
  );
}
