import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Plus, Trash2, X, Loader2, GripVertical, Eye, EyeOff, ImagePlus, Smartphone, ArrowUp, ArrowDown, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/components/admin/AdminShell";
import { cn } from "@/lib/utils";
import { useEditorProtection } from "@/hooks/use-editor-protection";
import { EditorSaveBar } from "@/components/admin/EditorSaveBar";

export type BannerRow = {
  id: string;
  title: string;
  subtitle: string | null;
  image: string | null;
  mobile_image: string | null;
  link: string | null;
  cta_text: string | null;
  type: string;
  region: string;
  pages: string[];
  active: boolean;
  sort_order: number;
  starts_at: string | null;
  ends_at: string | null;
};

const TYPES = ["promo", "hero", "offer"] as const;
const REGIONS = ["all", "india", "international"] as const;
const PAGE_OPTIONS = ["home", "shop", "product", "category", "cart", "checkout", "deals"] as const;

const blank = (type: BannerRow["type"] = "promo"): Partial<BannerRow> => ({
  title: "",
  subtitle: null,
  image: null,
  mobile_image: null,
  link: null,
  cta_text: null,
  type,
  region: "all",
  pages: [],
  active: true,
  sort_order: 0,
  starts_at: null,
  ends_at: null,
});

const toLocal = (iso: string | null | undefined) =>
  iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

/**
 * Live banner CMS as a mobile-first glass bottom sheet. Mirrors the
 * announcement CMS. Image uploads go to the public `banners` bucket; all
 * writes are RLS + role gated (editor+ only).
 */
export function BannerAdminSheet({
  onClose,
  onChanged,
  defaultType = "promo",
}: {
  onClose: () => void;
  onChanged: () => void;
  /** Default banner type for newly created banners (matches the carousel slot). */
  defaultType?: BannerRow["type"];
}) {
  const [rows, setRows] = useState<BannerRow[]>([]);
  const [editing, setEditing] = useState<Partial<BannerRow> | null>(null);
  const [original, setOriginal] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"image" | "mobile_image" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<"image" | "mobile_image">("image");

  const entityId = editing?.id ?? "new";
  const protection = useEditorProtection({
    entityType: "banner",
    entityId,
    value: editing as Record<string, unknown> | null,
    baseline: original,
    enabled: !!editing,
  });

  function openEditor(row: Partial<BannerRow>) {
    setEditing(row);
    setOriginal(JSON.stringify(row));
  }

  async function load() {
    const { data, error } = await supabase.from("banners").select("*").order("sort_order");
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((data as BannerRow[]) ?? []);
  }
  useEffect(() => {
    void load();
  }, []);

  function pickFile(target: "image" | "mobile_image") {
    uploadTarget.current = target;
    fileRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editing) return;
    const target = uploadTarget.current;
    setUploading(target);
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("banners").upload(path, file, {
      cacheControl: "31536000",
      upsert: false,
    });
    if (upErr) {
      setUploading(null);
      toast.error(upErr.message);
      return;
    }
    const { data } = supabase.storage.from("banners").getPublicUrl(path);
    setEditing({ ...editing, [target]: data.publicUrl });
    setUploading(null);
    toast.success("Image uploaded");
  }

  async function save() {
    if (!editing?.title?.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    const payload = {
      title: editing.title.trim(),
      subtitle: editing.subtitle?.trim() || null,
      image: editing.image || null,
      mobile_image: editing.mobile_image || null,
      link: editing.link?.trim() || null,
      cta_text: editing.cta_text?.trim() || null,
      type: editing.type ?? "promo",
      region: editing.region ?? "all",
      pages: editing.pages ?? [],
      active: editing.active ?? true,
      sort_order: Number(editing.sort_order) || 0,
      starts_at: editing.starts_at ?? null,
      ends_at: editing.ends_at ?? null,
    };
    const { data: saved, error } = editing.id
      ? await supabase.from("banners").update(payload).eq("id", editing.id).select("id").single()
      : await supabase.from("banners").insert(payload).select("id").single();
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing.id ? "Banner updated" : "Banner created");
    logActivity(editing.id ? "banner_update" : "banner_create", "banner", editing.id, { type: payload.type });
    await protection.recordVersion(
      (editing.id ?? saved?.id ?? entityId) as string,
      payload as Record<string, unknown>,
      editing.id ? "Updated" : "Created banner",
    );
    await protection.markClean();
    setEditing(null);
    await load();
    onChanged();
  }

  async function toggleActive(r: BannerRow) {
    const { error } = await supabase.from("banners").update({ active: !r.active }).eq("id", r.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    logActivity("banner_toggle", "banner", r.id, { active: !r.active });
    await load();
    onChanged();
  }

  async function del(id: string) {
    if (!confirm("Delete this banner?")) return;
    const { error } = await supabase.from("banners").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    logActivity("banner_delete", "banner", id);
    toast.success("Deleted");
    await load();
    onChanged();
  }

  async function reorder(id: string, direction: "up" | "down") {
    // Optimistic swap for instant feel
    setRows((prev) => {
      const i = prev.findIndex((r) => r.id === id);
      const j = direction === "up" ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    const { error } = await supabase.rpc("reorder_banner", { _id: id, _direction: direction });
    if (error) {
      toast.error(error.message);
    }
    await load();
    onChanged();
  }

  async function duplicate(r: BannerRow) {
    const { id, ...rest } = r;
    const { error } = await supabase
      .from("banners")
      .insert({ ...rest, title: `${r.title} (copy)`, active: false, sort_order: (r.sort_order ?? 0) + 1 });
    if (error) {
      toast.error(error.message);
      return;
    }
    logActivity("banner_duplicate", "banner", id);
    toast.success("Duplicated as draft");
    await load();
    onChanged();
  }


  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm"
        onClick={() => {
          if (uploading || saving) return;
          onClose();
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFile}
          onClick={(e) => e.stopPropagation()}
        />
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 32, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-x-0 bottom-0 max-h-[90vh] overflow-y-auto rounded-t-3xl border-t border-accent/20 bg-background/95 p-5 backdrop-blur-2xl sm:inset-y-0 sm:right-0 sm:left-auto sm:w-full sm:max-w-md sm:max-h-none sm:rounded-none sm:rounded-l-3xl sm:border-l sm:border-t-0"
        >
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15 sm:hidden" />
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display font-semibold leading-tight">Banner CMS</h2>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Live · realtime · region-aware
              </p>
            </div>
            <button
              onClick={() => {
                if (uploading || saving) {
                  toast.error("Please wait for the upload to finish");
                  return;
                }
                onClose();
              }}
              className="grid size-8 place-items-center rounded-full border border-white/10 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          {!editing && (
            <>
              <button
                onClick={() => openEditor(blank(defaultType))}
                className="mb-4 flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-accent-foreground"
              >
                <Plus className="size-3.5" /> New banner
              </button>
              <ul className="space-y-2">
                {rows.map((r, i) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-2.5"
                  >
                    <div className="flex shrink-0 flex-col">
                      <button
                        onClick={() => reorder(r.id, "up")}
                        disabled={i === 0}
                        className="grid size-5 place-items-center rounded text-muted-foreground/60 hover:text-accent disabled:opacity-20"
                        aria-label="Move up"
                      >
                        <ArrowUp className="size-3.5" />
                      </button>
                      <button
                        onClick={() => reorder(r.id, "down")}
                        disabled={i === rows.length - 1}
                        className="grid size-5 place-items-center rounded text-muted-foreground/60 hover:text-accent disabled:opacity-20"
                        aria-label="Move down"
                      >
                        <ArrowDown className="size-3.5" />
                      </button>
                    </div>
                    <div className="size-10 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                      {r.image ? (
                        <img loading="lazy" decoding="async" src={r.image} alt="" className="size-full object-cover" />
                      ) : (
                        <div className="grid size-full place-items-center text-muted-foreground/40">
                          <ImagePlus className="size-4" />
                        </div>
                      )}
                    </div>
                    <button onClick={() => openEditor(r)} className="min-w-0 flex-1 text-left">
                      <p className={cn("truncate text-sm", !r.active && "text-muted-foreground line-through")}>
                        {r.title}
                      </p>
                      <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                        {r.type} · {r.region}
                        {r.pages.length > 0 && ` · ${r.pages.join(",")}`}
                      </p>
                    </button>
                    <button
                      onClick={() => toggleActive(r)}
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-lg border",
                        r.active ? "border-accent/40 bg-accent/10 text-accent" : "border-white/10 text-muted-foreground",
                      )}
                      aria-label="Toggle active"
                    >
                      {r.active ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                    </button>
                    <button
                      onClick={() => duplicate(r)}
                      className="grid size-7 shrink-0 place-items-center rounded-lg border border-white/10 text-muted-foreground hover:text-accent"
                      aria-label="Duplicate"
                    >
                      <Copy className="size-3.5" />
                    </button>
                    <button
                      onClick={() => del(r.id)}
                      className="grid size-7 shrink-0 place-items-center rounded-lg border border-white/10 text-red-400 hover:bg-red-500/10"
                      aria-label="Delete"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
                {rows.length === 0 && (
                  <li className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-muted-foreground">
                    No banners yet.
                  </li>
                )}
              </ul>
            </>
          )}

          {editing && (
            <div className="space-y-4">
              <EditorSaveBar
                state={protection.state}
                lastSavedAt={protection.lastSavedAt}
                recovery={protection.recovery}
                onRestore={() => {
                  const d = protection.restoreDraft();
                  if (d) setEditing(d as Partial<BannerRow>);
                }}
                onDismiss={() => void protection.dismissDraft()}
                entityType="banner"
                entityId={entityId}
                onRestoreVersion={(snap) => setEditing(snap as Partial<BannerRow>)}
                onDuplicateVersion={(snap) =>
                  setEditing({ ...(snap as Partial<BannerRow>), id: undefined, title: `${(snap as BannerRow).title} (copy)` })
                }
              />
              <div className="grid grid-cols-2 gap-3">
                <ImagePicker
                  label="Desktop image"
                  icon={<ImagePlus className="size-4" />}
                  url={editing.image ?? null}
                  busy={uploading === "image"}
                  onPick={() => pickFile("image")}
                  onClear={() => setEditing({ ...editing, image: null })}
                />
                <ImagePicker
                  label="Mobile image"
                  icon={<Smartphone className="size-4" />}
                  url={editing.mobile_image ?? null}
                  busy={uploading === "mobile_image"}
                  onPick={() => pickFile("mobile_image")}
                  onClear={() => setEditing({ ...editing, mobile_image: null })}
                />
              </div>

              <Field label="Title">
                <input
                  value={editing.title ?? ""}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  className={input}
                  placeholder="Summer drop is live"
                />
              </Field>

              <Field label="Subtitle">
                <textarea
                  value={editing.subtitle ?? ""}
                  onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })}
                  rows={2}
                  className={input}
                  placeholder="Up to 40% off premium gear"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <select
                    value={editing.type ?? "promo"}
                    onChange={(e) => setEditing({ ...editing, type: e.target.value })}
                    className={input}
                  >
                    {TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Region">
                  <select
                    value={editing.region ?? "all"}
                    onChange={(e) => setEditing({ ...editing, region: e.target.value })}
                    className={input}
                  >
                    {REGIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Show on pages (none = all)">
                <div className="flex flex-wrap gap-1.5">
                  {PAGE_OPTIONS.map((p) => {
                    const on = (editing.pages ?? []).includes(p);
                    return (
                      <button
                        key={p}
                        onClick={() =>
                          setEditing({
                            ...editing,
                            pages: on
                              ? (editing.pages ?? []).filter((x) => x !== p)
                              : [...(editing.pages ?? []), p],
                          })
                        }
                        className={cn(
                          "rounded-full border px-3 py-1 text-[10px] font-mono uppercase tracking-widest transition-all",
                          on ? "border-accent/50 bg-accent/15 text-accent" : "border-white/10 text-muted-foreground",
                        )}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Link (optional)">
                  <input
                    value={editing.link ?? ""}
                    onChange={(e) => setEditing({ ...editing, link: e.target.value })}
                    className={input}
                    placeholder="/deals"
                  />
                </Field>
                <Field label="CTA label">
                  <input
                    value={editing.cta_text ?? ""}
                    onChange={(e) => setEditing({ ...editing, cta_text: e.target.value })}
                    className={input}
                    placeholder="Shop now"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Starts">
                  <input
                    type="datetime-local"
                    value={toLocal(editing.starts_at)}
                    onChange={(e) => setEditing({ ...editing, starts_at: fromLocal(e.target.value) })}
                    className={input}
                  />
                </Field>
                <Field label="Ends">
                  <input
                    type="datetime-local"
                    value={toLocal(editing.ends_at)}
                    onChange={(e) => setEditing({ ...editing, ends_at: fromLocal(e.target.value) })}
                    className={input}
                  />
                </Field>
              </div>

              <Field label="Priority (lower = first)">
                <input
                  type="number"
                  value={editing.sort_order ?? 0}
                  onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
                  className={input}
                />
              </Field>

              <button
                onClick={() => setEditing({ ...editing, active: !(editing.active ?? true) })}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs",
                  editing.active ?? true
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-white/10 text-muted-foreground",
                )}
              >
                Active (visible live)
                <span className={cn("size-2 rounded-full", editing.active ?? true ? "bg-accent" : "bg-muted-foreground/40")} />
              </button>

              <div className="sticky bottom-0 -mx-5 flex gap-2 border-t border-white/10 bg-background/95 px-5 py-3">
                <button
                  onClick={save}
                  disabled={saving}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-accent-foreground disabled:opacity-50"
                >
                  {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  {editing.id ? "Save changes" : "Create"}
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="rounded-full border border-white/10 px-4 py-2.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground"
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

const input =
  "w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ImagePicker({
  label,
  icon,
  url,
  busy,
  onPick,
  onClear,
}: {
  label: string;
  icon: React.ReactNode;
  url: string | null;
  busy: boolean;
  onPick: () => void;
  onClear: () => void;
}) {
  return (
    <div>
      <span className="mb-1 block text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="relative aspect-video overflow-hidden rounded-lg border border-white/10 bg-white/[0.02]">
        {url ? (
          <img loading="lazy" decoding="async" src={url} alt="" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-muted-foreground/40">{icon}</div>
        )}
        {busy && (
          <div className="absolute inset-0 grid place-items-center bg-black/50">
            <Loader2 className="size-5 animate-spin text-accent" />
          </div>
        )}
        {url && !busy && (
          <button
            onClick={onClear}
            className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-black/60 text-white hover:bg-red-500/70"
            aria-label="Remove image"
          >
            <X className="size-3" />
          </button>
        )}
      </div>
      <button
        onClick={onPick}
        disabled={busy}
        className="mt-1.5 w-full rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:border-accent/40 hover:text-accent disabled:opacity-50"
      >
        {url ? "Replace" : "Upload"}
      </button>
    </div>
  );
}
