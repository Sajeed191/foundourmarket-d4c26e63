import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { X, Eye, EyeOff, Loader2, FolderTree, ImagePlus, CheckSquare, Square } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invalidateCategories } from "@/lib/use-categories";
import { cn } from "@/lib/utils";

type Row = { id: string; label: string; active: boolean };

/**
 * Bulk visibility console. Lists every category and banner with checkboxes so
 * staff can hide or publish many at once — no need to open each item. Writes
 * are RLS-protected (editor/admin only); realtime keeps the storefront in sync.
 */
export function BulkVisibilityPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [categories, setCategories] = useState<Row[] | null>(null);
  const [banners, setBanners] = useState<Row[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  async function load() {
    const [{ data: cats }, { data: bans }] = await Promise.all([
      supabase
        .from("categories")
        .select("id,name,homepage_visible")
        .order("sort_order", { ascending: true }),
      supabase
        .from("banners")
        .select("id,title,active")
        .order("sort_order", { ascending: true }),
    ]);
    setCategories(
      ((cats as any[]) ?? []).map((c) => ({ id: c.id, label: c.name, active: !!c.homepage_visible })),
    );
    setBanners(
      ((bans as any[]) ?? []).map((b) => ({ id: b.id, label: b.title, active: !!b.active })),
    );
  }

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    load();
    const ch = supabase
      .channel("bulk-visibility")
      .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "banners" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const catKey = (id: string) => `category:${id}`;
  const banKey = (id: string) => `banner:${id}`;

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleGroup(rows: Row[], keyFn: (id: string) => string) {
    const keys = rows.map((r) => keyFn(r.id));
    const allSelected = keys.length > 0 && keys.every((k) => selected.has(k));
    setSelected((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (allSelected ? next.delete(k) : next.add(k)));
      return next;
    });
  }

  const selectedCats = useMemo(
    () => (categories ?? []).filter((c) => selected.has(catKey(c.id))).map((c) => c.id),
    [categories, selected],
  );
  const selectedBans = useMemo(
    () => (banners ?? []).filter((b) => selected.has(banKey(b.id))).map((b) => b.id),
    [banners, selected],
  );

  const count = selectedCats.length + selectedBans.length;

  async function apply(next: boolean) {
    if (!count || busy) return;
    setBusy(true);
    try {
      const ops: PromiseLike<{ error: unknown }>[] = [];
      if (selectedCats.length) {
        ops.push(
          supabase.from("categories").update({ homepage_visible: next }).in("id", selectedCats),
        );
      }
      if (selectedBans.length) {
        ops.push(supabase.from("banners").update({ active: next }).in("id", selectedBans));
      }
      const results = await Promise.all(ops);
      const failed = results.find((r: any) => r?.error);
      if (failed && (failed as any).error) throw (failed as any).error;
      invalidateCategories();
      toast.success(next ? `Published ${count} item${count > 1 ? "s" : ""}` : `Hid ${count} item${count > 1 ? "s" : ""}`);
      setSelected(new Set());
      await load();
    } catch (e) {
      toast.error("Bulk update failed", {
        description: e instanceof Error ? e.message : "Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (typeof document === "undefined") return null;

  function Group({ title, icon: Icon, rows, keyFn }: { title: string; icon: typeof FolderTree; rows: Row[] | null; keyFn: (id: string) => string }) {
    const list = rows ?? [];
    const keys = list.map((r) => keyFn(r.id));
    const allSelected = keys.length > 0 && keys.every((k) => selected.has(k));
    return (
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-accent">
            <Icon className="size-3.5" /> {title} ({list.length})
          </span>
          {list.length > 0 && (
            <button
              onClick={() => toggleGroup(list, keyFn)}
              className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-accent"
            >
              {allSelected ? "Deselect all" : "Select all"}
            </button>
          )}
        </div>
        {rows === null ? (
          <div className="grid place-items-center py-6 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : list.length === 0 ? (
          <p className="px-1 py-3 text-xs text-muted-foreground">None yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {list.map((r) => {
              const key = keyFn(r.id);
              const isSel = selected.has(key);
              const Box = isSel ? CheckSquare : Square;
              return (
                <li key={r.id}>
                  <button
                    onClick={() => toggle(key)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all",
                      isSel ? "border-accent/50 bg-accent/10" : "border-white/5 bg-white/[0.02] hover:border-accent/30",
                    )}
                  >
                    <Box className={cn("size-4 shrink-0", isSel ? "text-accent" : "text-muted-foreground")} />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{r.label}</span>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest",
                        r.active ? "bg-accent/15 text-accent" : "bg-white/5 text-muted-foreground",
                      )}
                    >
                      {r.active ? <Eye className="size-2.5" /> : <EyeOff className="size-2.5" />}
                      {r.active ? "Live" : "Hidden"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[110] print:hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-background/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-accent/20 bg-background/95 backdrop-blur-2xl shadow-[-30px_0_80px_-30px_oklch(0.74_0.19_49/0.4)]"
          >
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
              <span className="flex items-center gap-2 text-sm font-display tracking-tight text-foreground">
                Bulk visibility
              </span>
              <button
                onClick={onClose}
                className="grid size-7 place-items-center rounded-full text-muted-foreground hover:text-foreground"
                aria-label="Close bulk visibility"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <Group title="Categories" icon={FolderTree} rows={categories} keyFn={catKey} />
              <Group title="Banners" icon={ImagePlus} rows={banners} keyFn={banKey} />
            </div>

            <div className="border-t border-white/5 bg-background/80 px-4 py-3 backdrop-blur-xl">
              <div className="mb-2 text-center text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                {count} selected
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => apply(true)}
                  disabled={!count || busy}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-xs font-semibold uppercase tracking-widest text-accent-foreground transition-all hover:brightness-110 disabled:opacity-40"
                >
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />} Publish
                </button>
                <button
                  onClick={() => apply(false)}
                  disabled={!count || busy}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-xs font-semibold uppercase tracking-widest text-foreground transition-all hover:border-accent/40 disabled:opacity-40"
                >
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : <EyeOff className="size-3.5" />} Hide
                </button>
              </div>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
