import { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Loader2, Eye, EyeOff, Archive, Trash2, Copy, FolderTree, Boxes,
  IndianRupee, Tag, Star, Globe, Truck, CalendarClock, Download, RotateCcw,
  ChevronRight, ArrowLeft, DollarSign, Percent, TrendingUp, ShoppingBag,
} from "lucide-react";
import { toast } from "sonner";
import {
  runBulkAction, actionLabel, exportProductsCSV, exportProductsJSON, downloadFile,
  type BulkAction,
} from "@/lib/bulk-products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useBadgeCatalog, bulkAssign, bulkUnassign, badgeAnimationClass } from "@/lib/use-product-badges";
import { ProductBadge } from "@/components/ui/ProductBadge";

type SelRow = Record<string, unknown> & { id: string; slug?: string };


type Props = {
  ids: string[];
  rows: SelRow[];
  categories: { slug: string; name: string }[];
  mode?: "normal" | "recycle";
  onDone: () => void;
  onClear: () => void;
};

type FormKind =
  | null | "move_category" | "set_collection" | "set_homepage_section" | "priority"
  | "stock" | "pricing" | "tags" | "badges" | "region" | "shipping" | "schedule" | "export";

export function BulkActionBar({ ids, rows, categories, mode = "normal", onDone, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormKind>(null);
  const [busy, setBusy] = useState(false);
  const count = ids.length;
  if (typeof document === "undefined" || count === 0) return null;

  async function run(action: BulkAction, params: Record<string, unknown> = {}) {
    setBusy(true);
    const res = await runBulkAction(ids, action, params);
    setBusy(false);
    if (!res.ok) { toast.error(res.error ?? "Action failed"); return; }
    toast.success(`${actionLabel(action)} · ${res.affected} product${res.affected === 1 ? "" : "s"}`);
    setOpen(false); setForm(null);
    onDone();
  }

  function doExport(fmt: "csv" | "json") {
    const stamp = new Date().toISOString().slice(0, 10);
    if (fmt === "csv") downloadFile(`products-${stamp}.csv`, exportProductsCSV(rows), "text/csv");
    else downloadFile(`products-${stamp}.json`, exportProductsJSON(rows), "application/json");
    toast.success(`Exported ${rows.length} products`);
    setForm(null); setOpen(false);
  }

  const bar = (
    <motion.div
      initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className="fixed inset-x-0 bottom-0 z-[60] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto flex max-w-3xl items-center gap-2 rounded-2xl border border-border/60 bg-background/90 p-2 shadow-2xl backdrop-blur-xl">
        <button onClick={onClear} className="rounded-xl p-2 text-muted-foreground hover:bg-muted" aria-label="Clear selection">
          <X className="h-4 w-4" />
        </button>
        <div className="flex-1 text-sm font-medium">
          <span className="text-primary">{count}</span> selected
        </div>
        <Button size="sm" className="rounded-xl" onClick={() => setOpen(true)} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Actions"}
        </Button>
      </div>
    </motion.div>
  );

  return createPortal(
    <>
      <AnimatePresence>{!open && bar}</AnimatePresence>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-[70] flex items-end justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setOpen(false); setForm(null); }} />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 360, damping: 34 }}
              className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-border/60 bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl"
            >
              <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-muted" />
              <div className="mb-3 flex items-center gap-2">
                {form && (
                  <button onClick={() => setForm(null)} className="rounded-lg p-1.5 hover:bg-muted">
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                )}
                <h3 className="text-base font-semibold">
                  {form ? "Configure action" : `${count} products selected`}
                </h3>
                <button onClick={() => { setOpen(false); setForm(null); }} className="ml-auto rounded-lg p-1.5 hover:bg-muted">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {busy && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-t-3xl bg-background/60">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              )}

              {!form ? (
                mode === "recycle" ? (
                  <div className="space-y-1.5">
                    <Row icon={RotateCcw} label="Restore products" onClick={() => run("restore_deleted")} />
                    <Row icon={Trash2} label="Delete permanently" danger
                      onClick={() => { if (confirm(`Permanently delete ${count} products? This cannot be undone.`)) run("permanent_delete"); }} />
                    <Row icon={Download} label="Export" chevron onClick={() => setForm("export")} />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <SectionLabel>Publishing</SectionLabel>
                    <Row icon={Eye} label="Publish" onClick={() => run("publish")} />
                    <Row icon={EyeOff} label="Unpublish" onClick={() => run("unpublish")} />
                    <Row icon={Archive} label="Archive" onClick={() => run("archive")} />
                    <Row icon={CalendarClock} label="Schedule" chevron onClick={() => setForm("schedule")} />

                    <SectionLabel>Catalog</SectionLabel>
                    <Row icon={Copy} label="Duplicate" onClick={() => run("duplicate")} />
                    <Row icon={FolderTree} label="Move category" chevron onClick={() => setForm("move_category")} />
                    <Row icon={ShoppingBag} label="Collection / section" chevron onClick={() => setForm("set_collection")} />
                    <Row icon={Boxes} label="Stock" chevron onClick={() => setForm("stock")} />
                    <Row icon={IndianRupee} label="Pricing" chevron onClick={() => setForm("pricing")} />
                    <Row icon={Tag} label="Tags" chevron onClick={() => setForm("tags")} />
                    <Row icon={Star} label="Badges" chevron onClick={() => setForm("badges")} />
                    <Row icon={TrendingUp} label="Priority score" chevron onClick={() => setForm("priority")} />

                    <SectionLabel>Distribution</SectionLabel>
                    <Row icon={Globe} label="Region eligibility" chevron onClick={() => setForm("region")} />
                    <Row icon={Truck} label="Shipping & COD" chevron onClick={() => setForm("shipping")} />
                    <Row icon={Download} label="Export" chevron onClick={() => setForm("export")} />

                    <SectionLabel>Danger</SectionLabel>
                    <Row icon={Trash2} label="Move to Recycle Bin" danger onClick={() => run("soft_delete")} />
                  </div>
                )
              ) : (
                <FormPane kind={form} categories={categories} rows={rows}
                  onRun={run} onExport={doExport} onDone={onDone} />

              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>,
    document.body,
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-1 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>;
}

function Row({ icon: Icon, label, onClick, chevron, danger }: {
  icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; chevron?: boolean; danger?: boolean;
}) {
  return (
    <button onClick={onClick}
      className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition hover:bg-muted active:scale-[0.99]",
        danger && "text-destructive hover:bg-destructive/10")}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 font-medium">{label}</span>
      {chevron && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
    </button>
  );
}

function Pill({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={cn("rounded-full border px-3 py-1.5 text-sm transition",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted")}>
      {children}
    </button>
  );
}

function FormPane({ kind, categories, rows, onRun, onExport, onDone }: {
  kind: Exclude<FormKind, null>;
  categories: { slug: string; name: string }[];
  rows: SelRow[];
  onRun: (a: BulkAction, p?: Record<string, unknown>) => void;
  onExport: (fmt: "csv" | "json") => void;
  onDone: () => void;
}) {

  const [val, setVal] = useState("");
  const [val2, setVal2] = useState("");
  const [val3, setVal3] = useState("");

  if (kind === "export") {
    return (
      <div className="space-y-2">
        <Row icon={Download} label="Export as CSV" onClick={() => onExport("csv")} />
        <Row icon={Download} label="Export as Excel (CSV)" onClick={() => onExport("csv")} />
        <Row icon={Download} label="Export as JSON" onClick={() => onExport("json")} />
      </div>
    );
  }

  if (kind === "move_category") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Move selected products to a category.</p>
        <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {categories.map((c) => (
            <Row key={c.slug} icon={FolderTree} label={c.name} onClick={() => onRun("move_category", { category: c.slug })} />
          ))}
        </div>
      </div>
    );
  }

  if (kind === "priority") {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium">Set priority score</p>
        <Input type="number" min={1} max={100} value={val} onChange={(e) => setVal(e.target.value)} placeholder="1 – 100" />
        <p className="text-xs text-muted-foreground">
          Higher priority products appear before lower priority products within the same section.
        </p>
        <Button size="sm" className="w-full" onClick={() => onRun("set_priority", { value: Number(val) || 0 })}>
          Apply to selected
        </Button>
      </div>
    );
  }

  if (kind === "set_collection") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">Collection</p>
          <Input value={val} onChange={(e) => setVal(e.target.value)} placeholder="e.g. summer-2026" />
          <Button size="sm" className="w-full" onClick={() => onRun("set_collection", { collection: val })}>Apply collection</Button>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Homepage section</p>
          <Input value={val2} onChange={(e) => setVal2(e.target.value)} placeholder="e.g. featured / trending / new" />
          <Button size="sm" className="w-full" onClick={() => onRun("set_homepage_section", { section: val2 })}>Apply section</Button>
        </div>
      </div>
    );
  }

  if (kind === "stock") {
    return (
      <div className="space-y-3">
        <Input type="number" value={val} onChange={(e) => setVal(e.target.value)} placeholder="Quantity" />
        <div className="grid grid-cols-3 gap-2">
          <Button size="sm" variant="outline" onClick={() => onRun("set_stock", { value: Number(val) || 0 })}>Set</Button>
          <Button size="sm" variant="outline" onClick={() => onRun("inc_stock", { value: Number(val) || 0 })}>Increase</Button>
          <Button size="sm" variant="outline" onClick={() => onRun("dec_stock", { value: Number(val) || 0 })}>Decrease</Button>
        </div>
        <div className="space-y-2 border-t border-border/50 pt-3">
          <Input type="number" value={val2} onChange={(e) => setVal2(e.target.value)} placeholder="Low-stock threshold" />
          <Button size="sm" variant="outline" className="w-full" onClick={() => onRun("set_low_threshold", { value: Number(val2) || 0 })}>Set threshold</Button>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-border/50 pt-3">
          <Button size="sm" variant="outline" onClick={() => onRun("set_inventory_tracking", { value: true })}>Track inventory</Button>
          <Button size="sm" variant="outline" onClick={() => onRun("set_inventory_tracking", { value: false })}>Stop tracking</Button>
        </div>
      </div>
    );
  }

  if (kind === "pricing") {
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          <Input type="number" value={val} onChange={(e) => setVal(e.target.value)} placeholder="Amount / %" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" onClick={() => onRun("set_price_inr", { value: Number(val) || 0 })}><IndianRupee className="mr-1 h-3.5 w-3.5" />Set INR</Button>
          <Button size="sm" variant="outline" onClick={() => onRun("set_price_usd", { value: Number(val) || 0 })}><DollarSign className="mr-1 h-3.5 w-3.5" />Set USD</Button>
          <Button size="sm" variant="outline" onClick={() => onRun("inc_price_pct", { value: Number(val) || 0 })}><Percent className="mr-1 h-3.5 w-3.5" />Increase %</Button>
          <Button size="sm" variant="outline" onClick={() => onRun("dec_price_pct", { value: Number(val) || 0 })}><Percent className="mr-1 h-3.5 w-3.5" />Decrease %</Button>
          <Button size="sm" variant="outline" onClick={() => onRun("set_sale", { pct: Number(val) || 0 })}>Apply sale %</Button>
          <Button size="sm" variant="outline" onClick={() => onRun("remove_sale")}>Remove sale</Button>
        </div>
        <Button size="sm" variant="outline" className="w-full" onClick={() => onRun("round_price")}>Round prices to .99</Button>
      </div>
    );
  }

  if (kind === "tags") {
    const tags = val.split(",").map((t) => t.trim()).filter(Boolean);
    return (
      <div className="space-y-3">
        <Input value={val} onChange={(e) => setVal(e.target.value)} placeholder="tag1, tag2, tag3" />
        <div className="grid grid-cols-3 gap-2">
          <Button size="sm" variant="outline" onClick={() => onRun("add_tags", { tags })}>Add</Button>
          <Button size="sm" variant="outline" onClick={() => onRun("remove_tags", { tags })}>Remove</Button>
          <Button size="sm" variant="outline" onClick={() => onRun("replace_tags", { tags })}>Replace</Button>
        </div>
      </div>
    );
  }

  if (kind === "badges") {
    return <BadgesPane rows={rows} onDone={onDone} />;
  }


  if (kind === "region") {
    return (
      <div className="space-y-2">
        <Row icon={Globe} label="India only" onClick={() => onRun("set_region", { region: "india" })} />
        <Row icon={Globe} label="International only" onClick={() => onRun("set_region", { region: "international" })} />
        <Row icon={Globe} label="Both regions" onClick={() => onRun("set_region", { region: "both" })} />
      </div>
    );
  }

  if (kind === "shipping") {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" onClick={() => onRun("set_cod", { value: true })}>COD eligible</Button>
          <Button size="sm" variant="outline" onClick={() => onRun("set_cod", { value: false })}>COD disabled</Button>
          <Button size="sm" variant="outline" onClick={() => onRun("set_return", { value: true })}>Returns on</Button>
          <Button size="sm" variant="outline" onClick={() => onRun("set_return", { value: false })}>Returns off</Button>
        </div>
        <div className="space-y-2 border-t border-border/50 pt-3">
          <Input value={val} onChange={(e) => setVal(e.target.value)} placeholder="Warranty (e.g. 1 year)" />
          <Button size="sm" variant="outline" className="w-full" onClick={() => onRun("set_warranty", { value: val })}>Set warranty</Button>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-border/50 pt-3">
          <Input value={val2} onChange={(e) => setVal2(e.target.value)} placeholder="Shipping class" />
          <Button size="sm" variant="outline" onClick={() => onRun("set_shipping_class", { value: val2 })}>Set class</Button>
        </div>
        <div className="space-y-2">
          <Input value={val3} onChange={(e) => setVal3(e.target.value)} placeholder="Delivery estimate (e.g. 3-5 days)" />
          <Button size="sm" variant="outline" className="w-full"
            onClick={() => onRun("set_delivery_estimate", { value: val3 })}>
            Set delivery estimate
          </Button>
        </div>
      </div>
    );
  }

  if (kind === "schedule") {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium">Schedule publish</p>
        <Input type="datetime-local" value={val} onChange={(e) => setVal(e.target.value)} />
        <Button size="sm" variant="outline" className="w-full"
          onClick={() => val && onRun("schedule_publish", { at: new Date(val).toISOString() })}>Schedule publish</Button>
        <div className="border-t border-border/50 pt-3">
          <p className="mb-2 text-sm font-medium">Schedule unpublish</p>
          <Input type="datetime-local" value={val2} onChange={(e) => setVal2(e.target.value)} />
          <Button size="sm" variant="outline" className="mt-2 w-full"
            onClick={() => val2 && onRun("schedule_unpublish", { at: new Date(val2).toISOString() })}>Schedule unpublish</Button>
        </div>
      </div>
    );
  }

  return null;
}

/** Realtime badge bulk assign/remove — reads catalog live from Badge Manager. */
function BadgesPane({ rows, onDone }: { rows: SelRow[]; onDone: () => void }) {
  const { types, map, loading } = useBadgeCatalog();
  const [busy, setBusy] = useState<string | null>(null);
  const slugs = rows.map((r) => r.slug).filter((s): s is string => Boolean(s));
  const active = types.filter((t) => !t.archived).sort((a, b) => b.priority - a.priority);

  async function toggle(id: string, on: boolean) {
    if (slugs.length === 0) { toast.error("No products selected"); return; }
    setBusy(`${id}:${on}`);
    try {
      if (on) {
        const n = await bulkAssign(slugs, id);
        toast.success(`Badge applied to ${n} product${n === 1 ? "" : "s"}`);
      } else {
        await bulkUnassign(slugs, id);
        toast.success(`Badge removed from ${slugs.length} product${slugs.length === 1 ? "" : "s"}`);
      }
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="grid place-items-center py-6"><Loader2 className="size-4 animate-spin text-accent" /></div>;
  if (active.length === 0) return <p className="text-sm text-muted-foreground">No badges available. Create one in Badge Manager.</p>;

  return (
    <div className="space-y-2 max-h-[60vh] overflow-y-auto">
      {active.map((b) => {
        // Count how many selected products already carry this badge.
        const assignedCount = slugs.reduce((n, s) => n + ((map.get(s) ?? []).some((x) => x.id === b.id) ? 1 : 0), 0);
        const allAssigned = assignedCount === slugs.length && slugs.length > 0;
        return (
          <div key={b.id} className={cn("flex items-center gap-2 rounded-xl border p-2 transition-colors", b.enabled ? "border-border/50" : "border-dashed border-border/40 opacity-70")}>
            <ProductBadge label={b.label} className={badgeAnimationClass(b.animation)} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground">
                <span className="uppercase tracking-widest">P{b.priority}</span>
                {!b.enabled && <span className="text-amber-400">inactive</span>}
                {assignedCount > 0 && <span>· {assignedCount}/{slugs.length} have it</span>}
              </div>
            </div>
            <Button size="sm" variant="outline" disabled={busy !== null || allAssigned || !b.enabled} onClick={() => toggle(b.id, true)}>
              {busy === `${b.id}:true` ? <Loader2 className="size-3 animate-spin" /> : "Add"}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy !== null || assignedCount === 0} onClick={() => toggle(b.id, false)}>
              {busy === `${b.id}:false` ? <Loader2 className="size-3 animate-spin" /> : "Remove"}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

