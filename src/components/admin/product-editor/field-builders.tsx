// ============================================================
// Structured field builders for the Product Command Center —
// feature list, key/value pairs, and a lightweight rich-text
// editor toolbar. Pure UI; all values are held in form state.
// ============================================================
import { useRef } from "react";
import { Plus, Trash2, GripVertical, Bold, Italic, List, ListOrdered, Heading2 } from "lucide-react";

export type KV = { k: string; v: string };

export function kvToArray(obj: Record<string, string> | null | undefined): KV[] {
  if (!obj) return [];
  return Object.entries(obj).map(([k, v]) => ({ k, v: String(v) }));
}
export function arrayToKv(rows: KV[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    const k = r.k.trim();
    if (k) out[k] = r.v.trim();
  }
  return out;
}

/* ----------------------------- Features builder ----------------------------- */

export function FeaturesBuilder({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const update = (i: number, text: string) => onChange(value.map((f, idx) => (idx === i ? text : f)));
  const add = () => onChange([...value, ""]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      {value.length === 0 && (
        <p className="rounded-lg border border-dashed border-white/10 px-3 py-3 text-center text-xs text-muted-foreground">
          No features yet. Add highlights buyers care about.
        </p>
      )}
      {value.map((f, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-md border border-accent/30 bg-accent/10 text-[10px] font-mono text-accent">{i + 1}</span>
          <input value={f} onChange={(e) => update(i, e.target.value)} placeholder="e.g. Adjustable resistance"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm focus:border-accent/40 focus:outline-none" />
          <button type="button" onClick={() => remove(i)} aria-label="Remove feature"
            className="grid size-8 shrink-0 place-items-center rounded-md border border-white/10 text-muted-foreground transition-all hover:border-destructive/50 hover:text-destructive">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <button type="button" onClick={add}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground hover:border-accent/40 active:scale-[0.97]">
        <Plus className="size-3.5" /> Add Feature
      </button>
    </div>
  );
}

/* ----------------------------- Key/Value builder ----------------------------- */

export function KeyValueBuilder({
  rows, onChange, keyPlaceholder = "Key", valuePlaceholder = "Value", addLabel = "Add Row",
}: {
  rows: KV[];
  onChange: (rows: KV[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel?: string;
}) {
  const update = (i: number, patch: Partial<KV>) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const add = () => onChange([...rows, { k: "", v: "" }]);
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      {rows.length === 0 && (
        <p className="rounded-lg border border-dashed border-white/10 px-3 py-3 text-center text-xs text-muted-foreground">
          No rows yet.
        </p>
      )}
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <GripVertical className="size-4 shrink-0 text-muted-foreground/50" />
          <input value={r.k} onChange={(e) => update(i, { k: e.target.value })} placeholder={keyPlaceholder}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm focus:border-accent/40 focus:outline-none" />
          <span className="shrink-0 text-muted-foreground">→</span>
          <input value={r.v} onChange={(e) => update(i, { v: e.target.value })} placeholder={valuePlaceholder}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm focus:border-accent/40 focus:outline-none" />
          <button type="button" onClick={() => remove(i)} aria-label="Remove row"
            className="grid size-8 shrink-0 place-items-center rounded-md border border-white/10 text-muted-foreground transition-all hover:border-destructive/50 hover:text-destructive">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <button type="button" onClick={add}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground hover:border-accent/40 active:scale-[0.97]">
        <Plus className="size-3.5" /> {addLabel}
      </button>
    </div>
  );
}

/* ----------------------------- Rich-text (markdown) ----------------------------- */

export function RichTextEditor({ value, onChange, rows = 6 }: { value: string; onChange: (v: string) => void; rows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function wrap(before: string, after = before) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end) || "text";
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = start + before.length;
      el.selectionEnd = start + before.length + selected.length;
    });
  }

  function linePrefix(prefix: string | ((n: number) => string)) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const block = value.slice(lineStart, end);
    const lines = block.split("\n");
    const out = lines.map((l, i) => (typeof prefix === "function" ? prefix(i + 1) : prefix) + l).join("\n");
    const next = value.slice(0, lineStart) + out + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => el.focus());
  }

  const tools = [
    { icon: Heading2, label: "Heading", run: () => linePrefix("## ") },
    { icon: Bold, label: "Bold", run: () => wrap("**") },
    { icon: Italic, label: "Italic", run: () => wrap("_") },
    { icon: List, label: "Bullet list", run: () => linePrefix("- ") },
    { icon: ListOrdered, label: "Numbered list", run: () => linePrefix((n) => `${n}. `) },
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] focus-within:border-accent/40">
      <div className="flex flex-wrap items-center gap-1 border-b border-white/10 bg-white/[0.02] p-1.5">
        {tools.map((t) => (
          <button key={t.label} type="button" title={t.label} aria-label={t.label} onClick={t.run}
            className="grid size-8 place-items-center rounded-md text-muted-foreground transition-all hover:bg-white/5 hover:text-foreground">
            <t.icon className="size-4" />
          </button>
        ))}
      </div>
      <textarea ref={ref} value={value} rows={rows} onChange={(e) => onChange(e.target.value)}
        placeholder="Describe the product. Use the toolbar for headings, bold, and lists."
        className="w-full resize-y bg-transparent px-3 py-2.5 text-sm focus:outline-none" />
    </div>
  );
}
