import { useEffect, useMemo, useRef, useState } from "react";
import {
  Layers, Loader2, Plus, Trash2, Save, Wand2, AlertTriangle, Check, Upload,
  Pencil, Copy, X, CheckSquare, Square, Power,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invalidateProducts } from "@/lib/use-products";
import {
  fetchAdminVariants,
  fetchHasVariants,
  setHasVariants,
  saveVariants,
  variantLabel,
  COMMON_SIZES,
  COMMON_COLORS,
  type AdminVariant,
} from "@/lib/product-variants";

/**
 * Self-contained Size/Colour variant builder for a single product `slug`.
 *
 * This is the SAME builder used by the full-page editor route
 * (`/admin-product/$slug/variants`); it is extracted here so the inline
 * Product Editor modal (Add / Edit Product) can render it without duplicating
 * any of the persistence logic in `@/lib/product-variants`.
 *
 * Variants require an existing product row (they reference the product by
 * slug), so callers must only mount this once the product has been saved.
 */

type Row = Omit<AdminVariant, "productSlug">;

function blankRow(size: string | null, color: string | null, colorHex: string | null): Row {
  return {
    id: `new-${Math.random().toString(36).slice(2, 9)}`,
    name: variantLabel(size, color),
    sku: null, size, color, colorHex,
    imageUrl: null, priceAdjustment: 0, comparePrice: null,
    barcode: null, weight: null, stockQuantity: 0, lowStockThreshold: 5,
    active: true, sortOrder: 0, version: 1,
  };
}
const isNew = (id: string) => id.startsWith("new-");
const newId = () => `new-${Math.random().toString(36).slice(2, 9)}`;

type Confirm = { title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void };

export function VariantBuilder({ slug }: { slug: string }) {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  // Combination generator inputs
  const [selSizes, setSelSizes] = useState<string[]>([]);
  const [customSize, setCustomSize] = useState("");
  const [selColors, setSelColors] = useState<{ name: string; hex: string }[]>([]);
  const [customColor, setCustomColor] = useState("");
  const [customHex, setCustomHex] = useState("#111111");

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      const [hv, vars] = await Promise.all([fetchHasVariants(slug), fetchAdminVariants(slug)]);
      if (!active) return;
      setEnabled(hv);
      setRows(vars.map(({ productSlug: _p, ...r }) => r));
      setLoading(false);
    })().catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug]);

  const toggleSize = (s: string) =>
    setSelSizes((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  const toggleColor = (c: { name: string; hex: string }) =>
    setSelColors((p) => (p.some((x) => x.name === c.name) ? p.filter((x) => x.name !== c.name) : [...p, c]));

  function addCustomSize() {
    const s = customSize.trim();
    if (s && !selSizes.includes(s)) setSelSizes((p) => [...p, s]);
    setCustomSize("");
  }
  function addCustomColor() {
    const name = customColor.trim();
    if (name && !selColors.some((c) => c.name === name)) setSelColors((p) => [...p, { name, hex: customHex }]);
    setCustomColor("");
  }

  function generate() {
    const sizes = selSizes.length ? selSizes : [null];
    const colors = selColors.length ? selColors : [null];
    if (selSizes.length === 0 && selColors.length === 0) {
      toast.error("Pick at least one size or colour first");
      return;
    }
    const existing = new Set(rows.map((r) => `${r.size ?? ""}|${r.color ?? ""}`));
    const additions: Row[] = [];
    for (const c of colors) {
      for (const s of sizes) {
        const key = `${(s as string) ?? ""}|${(c as any)?.name ?? ""}`;
        if (existing.has(key)) continue;
        existing.add(key);
        additions.push(blankRow(s as string | null, (c as any)?.name ?? null, (c as any)?.hex ?? null));
      }
    }
    if (!additions.length) { toast.info("All those combinations already exist"); return; }
    setRows((p) => [...p, ...additions]);
    toast.success(`${additions.length} combination${additions.length === 1 ? "" : "s"} added`);
  }

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function removeRow(id: string) {
    setRows((p) => p.filter((r) => r.id !== id));
    setSelected((s) => { const n = new Set(s); n.delete(id); return n; });
  }
  function duplicateRow(id: string) {
    setRows((p) => {
      const src = p.find((r) => r.id === id);
      if (!src) return p;
      return [...p, { ...src, id: newId(), sku: null }];
    });
  }

  // ----- Size / Colour management (operates on existing variant rows) -----

  const sizesInUse = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.size) m.set(r.size, (m.get(r.size) ?? 0) + 1);
    return [...m.entries()].map(([size, count]) => ({ size, count }));
  }, [rows]);

  const colorsInUse = useMemo(() => {
    const m = new Map<string, { hex: string | null; count: number }>();
    for (const r of rows) {
      if (!r.color) continue;
      const prev = m.get(r.color);
      m.set(r.color, { hex: r.colorHex ?? prev?.hex ?? null, count: (prev?.count ?? 0) + 1 });
    }
    return [...m.entries()].map(([color, v]) => ({ color, hex: v.hex, count: v.count }));
  }, [rows]);

  function renameSize(oldSize: string, nextSizeRaw: string) {
    const nextSize = nextSizeRaw.trim();
    if (!nextSize || nextSize === oldSize) return;
    setRows((p) =>
      p.map((r) => (r.size === oldSize ? { ...r, size: nextSize, name: variantLabel(nextSize, r.color) } : r)),
    );
    toast.success(`Size renamed to "${nextSize}"`);
  }
  function deleteSize(size: string, count: number) {
    setConfirm({
      title: `Delete size "${size}"?`,
      message: `This will remove ${count} variant${count === 1 ? "" : "s"} using this size. Other sizes are not affected. This applies when you save.`,
      confirmLabel: "Delete size",
      danger: true,
      onConfirm: () => {
        setRows((p) => p.filter((r) => r.size !== size));
        toast.success(`Size "${size}" removed`);
      },
    });
  }

  function renameColor(oldColor: string, nextNameRaw: string, nextHex: string | null) {
    const nextName = nextNameRaw.trim();
    if (!nextName) return;
    if (nextName === oldColor && (nextHex ?? null) === (colorsInUse.find((c) => c.color === oldColor)?.hex ?? null)) return;
    setRows((p) =>
      p.map((r) =>
        r.color === oldColor
          ? { ...r, color: nextName, colorHex: nextHex ?? r.colorHex, name: variantLabel(r.size, nextName) }
          : r,
      ),
    );
    toast.success(`Colour updated to "${nextName}"`);
  }
  function deleteColor(color: string, count: number) {
    setConfirm({
      title: `Delete colour "${color}"?`,
      message: `This will remove ${count} variant${count === 1 ? "" : "s"} using this colour. Other colours are not affected. This applies when you save.`,
      confirmLabel: "Delete colour",
      danger: true,
      onConfirm: () => {
        setRows((p) => p.filter((r) => r.color !== color));
        toast.success(`Colour "${color}" removed`);
      },
    });
  }

  // ----- Selection / bulk actions -----

  const allSelected = rows.length > 0 && selected.size === rows.length;
  function toggleSelect(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }
  function bulkSetActive(active: boolean) {
    setRows((p) => p.map((r) => (selected.has(r.id) ? { ...r, active } : r)));
    toast.success(`${selected.size} variant${selected.size === 1 ? "" : "s"} ${active ? "activated" : "deactivated"}`);
  }
  function bulkDuplicate() {
    const copies = rows.filter((r) => selected.has(r.id)).map((r) => ({ ...r, id: newId(), sku: null }));
    setRows((p) => [...p, ...copies]);
    setSelected(new Set());
    toast.success(`${copies.length} variant${copies.length === 1 ? "" : "s"} duplicated`);
  }
  function bulkDelete() {
    const count = selected.size;
    setConfirm({
      title: `Delete ${count} selected variant${count === 1 ? "" : "s"}?`,
      message: `The selected variant${count === 1 ? "" : "s"} will be removed when you save. This cannot be undone after saving.`,
      confirmLabel: "Delete selected",
      danger: true,
      onConfirm: () => {
        setRows((p) => p.filter((r) => !selected.has(r.id)));
        setSelected(new Set());
        toast.success(`${count} variant${count === 1 ? "" : "s"} removed`);
      },
    });
  }

  async function onToggleEnabled(v: boolean) {
    setEnabled(v);
    try {
      await setHasVariants(slug, v);
      invalidateProducts();
      toast.success(v ? "Variants enabled" : "Variants disabled");
    } catch (e: any) {
      setEnabled(!v);
      toast.error("Could not update", { description: e?.message });
    }
  }

  const dupWarning = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows) {
      const k = `${r.size ?? ""}|${r.color ?? ""}`;
      if (seen.has(k)) return true;
      seen.add(k);
    }
    return false;
  }, [rows]);

  async function save() {
    if (dupWarning) { toast.error("Remove duplicate Size + Colour combinations first"); return; }
    setSaving(true);
    try {
      await saveVariants(
        slug,
        rows.map((r) => ({ ...r, id: isNew(r.id) ? undefined : r.id })),
      );
      const fresh = await fetchAdminVariants(slug);
      setRows(fresh.map(({ productSlug: _p, ...r }) => r));
      setSelected(new Set());
      invalidateProducts();
      toast.success("Variants saved");
    } catch (e: any) {
      toast.error("Save failed", { description: e?.message });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="grid place-items-center py-12"><Loader2 className="size-5 animate-spin text-accent" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Enable toggle */}
      <div className="card-premium rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="size-4 text-accent" />
          <h3 className="text-sm font-medium">Product Variants</h3>
        </div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={enabled} onChange={(e) => onToggleEnabled(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
          <span>
            <span className="block text-sm">Enable variants for this product</span>
            <span className="block text-xs text-muted-foreground mt-0.5">When off, this product is sold as a single item with no size/colour options. Existing catalog, cart and checkout are unaffected.</span>
          </span>
        </label>
      </div>

      {enabled && (
        <>
          {/* Combination generator */}
          <div className="card-premium rounded-2xl p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Wand2 className="size-4 text-accent" />
              <h3 className="text-sm font-medium">Build combinations</h3>
            </div>

            <div>
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-2">Sizes</p>
              <div className="flex flex-wrap gap-2">
                {COMMON_SIZES.map((s) => (
                  <Chip key={s} active={selSizes.includes(s)} onClick={() => toggleSize(s)}>{s}</Chip>
                ))}
                {selSizes.filter((s) => !COMMON_SIZES.includes(s as any)).map((s) => (
                  <Chip key={s} active onClick={() => toggleSize(s)}>{s}</Chip>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <input value={customSize} onChange={(e) => setCustomSize(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomSize())}
                  placeholder="Custom size" className="flex-1 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/40" />
                <button type="button" onClick={addCustomSize} className="rounded-lg border border-white/12 px-3 text-xs hover:border-white/25">Add</button>
              </div>
            </div>

            <div>
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-2">Colours</p>
              <div className="flex flex-wrap gap-2">
                {COMMON_COLORS.map((c) => (
                  <SwatchChip key={c.name} active={selColors.some((x) => x.name === c.name)} hex={c.hex} onClick={() => toggleColor(c)}>{c.name}</SwatchChip>
                ))}
                {selColors.filter((c) => !COMMON_COLORS.some((x) => x.name === c.name)).map((c) => (
                  <SwatchChip key={c.name} active hex={c.hex} onClick={() => toggleColor(c)}>{c.name}</SwatchChip>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <input type="color" value={customHex} onChange={(e) => setCustomHex(e.target.value)}
                  className="h-9 w-11 rounded-lg border border-white/10 bg-transparent p-0.5" aria-label="Custom colour swatch" />
                <input value={customColor} onChange={(e) => setCustomColor(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomColor())}
                  placeholder="Custom colour name" className="flex-1 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/40" />
                <button type="button" onClick={addCustomColor} className="rounded-lg border border-white/12 px-3 text-xs hover:border-white/25">Add</button>
              </div>
            </div>

            <button type="button" onClick={generate}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:brightness-110">
              <Plus className="size-3.5" /> Generate combinations
            </button>
          </div>

          {/* Manage sizes / colours in use */}
          {(sizesInUse.length > 0 || colorsInUse.length > 0) && (
            <div className="card-premium rounded-2xl p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Pencil className="size-4 text-accent" />
                <h3 className="text-sm font-medium">Manage options</h3>
              </div>

              {sizesInUse.length > 0 && (
                <div>
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-2">Sizes in use</p>
                  <div className="flex flex-wrap gap-2">
                    {sizesInUse.map(({ size, count }) => (
                      <ManagedSizeChip key={size} size={size} count={count}
                        onRename={(next) => renameSize(size, next)} onDelete={() => deleteSize(size, count)} />
                    ))}
                  </div>
                </div>
              )}

              {colorsInUse.length > 0 && (
                <div>
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-2">Colours in use</p>
                  <div className="flex flex-wrap gap-2">
                    {colorsInUse.map(({ color, hex, count }) => (
                      <ManagedColorChip key={color} color={color} hex={hex} count={count}
                        onRename={(name, h) => renameColor(color, name, h)} onDelete={() => deleteColor(color, count)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {dupWarning && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              <AlertTriangle className="size-3.5 shrink-0" /> Duplicate Size + Colour combinations exist — remove them before saving.
            </div>
          )}

          {/* Bulk actions */}
          {rows.length > 0 && (
            <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-background/80 px-3 py-2 backdrop-blur">
              <button type="button" onClick={toggleSelectAll}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-3 py-1.5 text-xs hover:border-white/25">
                {allSelected ? <CheckSquare className="size-3.5 text-accent" /> : <Square className="size-3.5" />}
                {allSelected ? "Clear" : "Select all"}
              </button>
              {selected.size > 0 && (
                <>
                  <span className="text-xs text-muted-foreground">{selected.size} selected</span>
                  <button type="button" onClick={() => bulkSetActive(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-3 py-1.5 text-xs hover:border-white/25">
                    <Power className="size-3.5 text-emerald-400" /> Activate
                  </button>
                  <button type="button" onClick={() => bulkSetActive(false)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-3 py-1.5 text-xs hover:border-white/25">
                    <Power className="size-3.5 text-muted-foreground" /> Deactivate
                  </button>
                  <button type="button" onClick={bulkDuplicate}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-3 py-1.5 text-xs hover:border-white/25">
                    <Copy className="size-3.5" /> Duplicate
                  </button>
                  <button type="button" onClick={bulkDelete}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10">
                    <Trash2 className="size-3.5" /> Delete
                  </button>
                </>
              )}
            </div>
          )}

          {/* Variant rows */}
          <div className="space-y-3">
            {rows.length === 0 && (
              <div className="card-premium rounded-2xl p-8 text-center text-sm text-muted-foreground">
                No variants yet. Pick sizes/colours above and generate combinations, or
                <button type="button" onClick={() => setRows((p) => [...p, blankRow(null, null, null)])} className="ml-1 text-accent hover:underline">add one manually</button>.
              </div>
            )}
            {rows.map((r) => (
              <VariantCard key={r.id} r={r} selected={selected.has(r.id)} onSelect={() => toggleSelect(r.id)}
                onChange={(p) => updateRow(r.id, p)}
                onRemove={() => setConfirm({
                  title: `Delete variant "${variantLabel(r.size, r.color)}"?`,
                  message: "This variant will be removed when you save.",
                  confirmLabel: "Delete", danger: true, onConfirm: () => removeRow(r.id),
                })}
                onDuplicate={() => duplicateRow(r.id)} />
            ))}
          </div>

          {/* Save */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{rows.length} variant{rows.length === 1 ? "" : "s"}</span>
            <button type="button" onClick={save} disabled={saving || dupWarning}
              className="ml-auto inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground hover:brightness-110 disabled:opacity-50">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save variants
            </button>
          </div>
        </>
      )}

      {confirm && (
        <ConfirmDialog c={confirm} onClose={() => setConfirm(null)} />
      )}
    </div>
  );
}

function ConfirmDialog({ c, onClose }: { c: Confirm; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] grid place-items-center p-4 animate-in fade-in duration-150" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm card-premium rounded-2xl p-5 animate-in zoom-in-95 duration-150">
        <div className="flex items-start gap-3">
          <div className={`grid size-9 shrink-0 place-items-center rounded-full ${c.danger ? "bg-destructive/15 text-destructive" : "bg-accent/15 text-accent"}`}>
            <AlertTriangle className="size-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold">{c.title}</h4>
            <p className="mt-1 text-xs text-muted-foreground">{c.message}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-white/12 px-4 py-2 text-sm hover:border-white/25">Cancel</button>
          <button type="button" onClick={() => { c.onConfirm(); onClose(); }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${c.danger ? "bg-destructive text-destructive-foreground hover:brightness-110" : "bg-accent text-accent-foreground hover:brightness-110"}`}>
            {c.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${active ? "bg-accent/15 text-accent border-accent/40" : "border-white/12 text-muted-foreground hover:border-white/25"}`}>
      {children}
    </button>
  );
}

function SwatchChip({ active, hex, onClick, children }: { active: boolean; hex: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-colors ${active ? "bg-accent/15 text-accent border-accent/40" : "border-white/12 text-muted-foreground hover:border-white/25"}`}>
      <span className="size-3.5 rounded-full border border-white/20" style={{ background: hex }} />
      {children}
      {active && <Check className="size-3" />}
    </button>
  );
}

function ManagedSizeChip({ size, count, onRename, onDelete }: {
  size: string; count: number; onRename: (next: string) => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(size);
  function commit() { onRename(val); setEditing(false); }
  if (editing) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg border border-accent/40 bg-accent/10 px-1.5 py-1">
        <input autoFocus value={val} onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") { setVal(size); setEditing(false); } }}
          className="w-16 bg-transparent px-1 text-xs focus:outline-none" />
        <button type="button" onClick={commit} className="grid size-6 place-items-center rounded text-emerald-400 hover:bg-white/10"><Check className="size-3.5" /></button>
        <button type="button" onClick={() => { setVal(size); setEditing(false); }} className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-white/10"><X className="size-3.5" /></button>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-lg border border-white/12 pl-3 pr-1 py-1">
      <span className="text-xs font-medium">{size}</span>
      <span className="text-[10px] text-muted-foreground">×{count}</span>
      <button type="button" title="Edit size" onClick={() => { setVal(size); setEditing(true); }} className="grid size-7 place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-white/10"><Pencil className="size-3.5" /></button>
      <button type="button" title="Delete size" onClick={onDelete} className="grid size-7 place-items-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"><Trash2 className="size-3.5" /></button>
    </span>
  );
}

function ManagedColorChip({ color, hex, count, onRename, onDelete }: {
  color: string; hex: string | null; count: number; onRename: (name: string, hex: string | null) => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(color);
  const [h, setH] = useState(hex ?? "#111111");
  function commit() { onRename(name, h); setEditing(false); }
  if (editing) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg border border-accent/40 bg-accent/10 px-1.5 py-1">
        <input type="color" value={h} onChange={(e) => setH(e.target.value)} className="size-6 rounded border border-white/10 bg-transparent p-0.5" aria-label="Edit swatch" />
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") { setName(color); setH(hex ?? "#111111"); setEditing(false); } }}
          className="w-20 bg-transparent px-1 text-xs focus:outline-none" />
        <button type="button" onClick={commit} className="grid size-6 place-items-center rounded text-emerald-400 hover:bg-white/10"><Check className="size-3.5" /></button>
        <button type="button" onClick={() => { setName(color); setH(hex ?? "#111111"); setEditing(false); }} className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-white/10"><X className="size-3.5" /></button>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 pl-2.5 pr-1 py-1">
      <span className="size-3.5 rounded-full border border-white/20" style={{ background: hex ?? "#111111" }} />
      <span className="text-xs font-medium">{color}</span>
      <span className="text-[10px] text-muted-foreground">×{count}</span>
      <button type="button" title="Edit colour" onClick={() => { setName(color); setH(hex ?? "#111111"); setEditing(true); }} className="grid size-7 place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-white/10"><Pencil className="size-3.5" /></button>
      <button type="button" title="Delete colour" onClick={onDelete} className="grid size-7 place-items-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"><Trash2 className="size-3.5" /></button>
    </span>
  );
}

function VField({ label, value, onChange, type = "text", hint, className }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; hint?: string; className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/40" />
      {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function VariantCard({ r, selected, onSelect, onChange, onRemove, onDuplicate }: {
  r: Row; selected: boolean; onSelect: () => void; onChange: (p: Partial<Row>) => void; onRemove: () => void; onDuplicate: () => void;
}) {
  const low = r.stockQuantity <= r.lowStockThreshold;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function uploadImage(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `variants/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("product-images").upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      onChange({ imageUrl: data.publicUrl });
      toast.success("Variant image uploaded");
    } catch (e: any) {
      toast.error("Upload failed", { description: e?.message });
    } finally {
      setUploading(false);
    }
  }
  return (
    <div className={`card-premium rounded-2xl p-4 transition-colors ${selected ? "ring-1 ring-accent/50" : ""}`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <button type="button" onClick={onSelect} title={selected ? "Deselect" : "Select"}
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/10 text-muted-foreground hover:border-white/25">
            {selected ? <CheckSquare className="size-4 text-accent" /> : <Square className="size-4" />}
          </button>
          {r.colorHex && <span className="size-4 rounded-full border border-white/20 shrink-0" style={{ background: r.colorHex }} />}
          <span className="text-sm font-medium truncate">{variantLabel(r.size, r.color)}</span>
          {!r.active && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">inactive</span>}
          {r.active && low && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-400">low stock</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={onDuplicate} title="Duplicate" className="grid size-8 place-items-center rounded-lg border border-white/10 text-muted-foreground hover:text-foreground hover:border-white/25">
            <Copy className="size-3.5" />
          </button>
          <button type="button" onClick={onRemove} title="Remove" className="grid size-8 place-items-center rounded-lg border border-white/10 text-muted-foreground hover:text-destructive hover:border-destructive/40">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <VField label="Size" value={r.size ?? ""} onChange={(v) => onChange({ size: v || null })} />
        <VField label="Colour" value={r.color ?? ""} onChange={(v) => onChange({ color: v || null })} />
        <div>
          <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">Swatch</label>
          <div className="flex gap-2">
            <input type="color" value={r.colorHex ?? "#111111"} onChange={(e) => onChange({ colorHex: e.target.value })}
              className="h-9 w-11 rounded-lg border border-white/10 bg-transparent p-0.5" aria-label="Variant swatch" />
            <input value={r.colorHex ?? ""} onChange={(e) => onChange({ colorHex: e.target.value || null })} placeholder="#hex"
              className="flex-1 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/40" />
          </div>
        </div>
        <VField label="SKU" value={r.sku ?? ""} onChange={(v) => onChange({ sku: v || null })} />
        <VField label="Stock" type="number" value={String(r.stockQuantity)} onChange={(v) => onChange({ stockQuantity: Number(v) || 0 })} />
        <VField label="Low-stock alert" type="number" value={String(r.lowStockThreshold)} onChange={(v) => onChange({ lowStockThreshold: Number(v) || 0 })} />
        <VField label="Price adjustment" type="number" value={String(r.priceAdjustment)} onChange={(v) => onChange({ priceAdjustment: Number(v) || 0 })} hint="Added to the base price (can be negative)" />
        <VField label="Compare price" type="number" value={r.comparePrice != null ? String(r.comparePrice) : ""} onChange={(v) => onChange({ comparePrice: v.trim() === "" ? null : Number(v) })} />
        <VField label="Barcode" value={r.barcode ?? ""} onChange={(v) => onChange({ barcode: v || null })} />
        <VField label="Weight" type="number" value={r.weight != null ? String(r.weight) : ""} onChange={(v) => onChange({ weight: v.trim() === "" ? null : Number(v) })} />
        <div className="col-span-2">
          <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">Variant image (optional)</label>
          <div className="flex items-center gap-2">
            {r.imageUrl ? (
              <img src={r.imageUrl} alt="Variant" className="size-11 shrink-0 rounded-lg object-cover border border-white/10" />
            ) : (
              <div className="size-11 shrink-0 rounded-lg border border-dashed border-white/15 grid place-items-center text-muted-foreground"><Upload className="size-4" /></div>
            )}
            <input value={r.imageUrl ?? ""} onChange={(e) => onChange({ imageUrl: e.target.value || null })} placeholder="Paste image URL or upload"
              className="flex-1 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/40" />
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.currentTarget.value = ""; }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-3 py-2 text-xs hover:border-white/25 disabled:opacity-50">
              {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} Upload
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={r.active} onChange={(e) => onChange({ active: e.target.checked })} className="accent-[var(--accent)]" />
          Active
        </label>
        <p className="mt-1 text-[10px] text-muted-foreground">Inactive variants are hidden from customers but kept for records.</p>
      </div>
    </div>
  );
}
